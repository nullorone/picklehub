import { Inject, Injectable } from '@nestjs/common';
import {
    AdBillingModel,
    AdCampaignDecisionKind,
    AdCampaignState,
    AdCreativeFormat,
    AdDeliveryEventKind,
    AdPriorityTier,
    AdTargetDimension,
    AdTargetOperator,
    ContentReviewState,
    Prisma,
    type Campaign,
    type CampaignRevision,
    type Creative,
    type Placement,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import { AuditService } from '../audit/audit.service';
import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { OutboxService } from '../outbox/outbox.service';
import { advertisingError } from './advertising.errors';
import { AdvertisingFrequencyCacheService } from './advertising-frequency-cache.service';
import { canonicalAdvertisingRequest } from './advertising-idempotency.service';
import { AdvertisingProviderPort } from './advertising-provider';
import type {
    CampaignInput,
    CampaignRevisionInput,
    CreativeInput,
    DecisionContext,
    JsonRecord,
    TargetRuleInput,
} from './advertising.types';

const CODE = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const POLICY = /^[1-9][0-9]*\.[0-9]+\.[0-9]+$/u;
const TOKEN = /^[A-Za-z0-9_-]{43,256}$/u;
const TARGET_DIMENSIONS = Object.values(AdTargetDimension);
const TARGET_OPERATORS = Object.values(AdTargetOperator);
const CLIENT_KINDS = ['WEB', 'TMA', 'MOBILE'];
const FORM_FACTORS = ['NARROW', 'REGULAR', 'WIDE'];
const CONNECTIVITY = ['OFFLINE', 'CONSTRAINED', 'REGULAR'];
const PRIORITY: Record<AdPriorityTier, number> = {
    HOUSE_EMERGENCY: 0,
    GUARANTEED_DIRECT: 1,
    STANDARD_DIRECT: 2,
};
const PAUSE_REASONS = new Set([
    'MANUAL',
    'BUDGET_GUARD',
    'PRODUCT_GUARDRAIL',
    'ACCESSIBILITY',
    'PRIVACY',
    'SAFETY',
    'LEGAL',
    'PROVIDER_REVIEW_EXPIRED',
    'INCIDENT',
]);

type RevisionWithRules = CampaignRevision & {
    targetRules: { dimension: AdTargetDimension; operator: AdTargetOperator; values: string[] }[];
};
type Candidate = Campaign & { approvedRevision: RevisionWithRules | null; creatives: Creative[] };

@Injectable()
export class AdvertisingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService,
        private readonly audit: AuditService,
        private readonly requestContext: RequestContextService,
        private readonly outbox: OutboxService,
        private readonly provider: AdvertisingProviderPort,
        private readonly frequencyCache: AdvertisingFrequencyCacheService,
        @Inject(ENVIRONMENT) environment: Environment
    ) {
        this.assetBaseUrl = environment.ADVERTISING_ASSET_BASE_URL.replace(/\/$/u, '');
    }

    private readonly assetBaseUrl: string;

    async decide(context: DecisionContext, actorScope: string, tx: Prisma.TransactionClient): Promise<object> {
        this.assertContext(context);
        if (context.criticalState) return this.noFill('CRITICAL_STATE');
        const placement = await tx.placement.findUnique({ where: { code: context.placementCode } });
        if (placement === null || !placement.enabled || placement.surface !== context.surface)
            return this.noFill('PLACEMENT_PAUSED');
        if (context.connectivity === 'OFFLINE') return this.noFill('NO_ELIGIBLE_CAMPAIGN');

        const now = new Date();
        const candidates = await tx.campaign.findMany({
            where: { state: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
            include: { approvedRevision: { include: { targetRules: true } }, creatives: true },
        });
        const eligible = candidates
            .filter((candidate) => this.isEligible(candidate, placement, context))
            .sort((left, right) => this.compareCandidates(left, right));
        let capped = false;
        let exhausted = false;
        for (const candidate of eligible) {
            const revision = candidate.approvedRevision;
            if (revision === null) continue;
            await tx.$executeRaw`SELECT id FROM campaigns WHERE id = ${candidate.id}::uuid FOR UPDATE`;
            const locked = await tx.campaign.findUniqueOrThrow({ where: { id: candidate.id } });
            if (locked.state !== 'ACTIVE' || locked.approvedRevisionId !== revision.id) continue;
            const reservation = this.reservation(revision);
            if (locked.reservedMinor + locked.spentMinor + reservation > locked.budgetMinor) {
                exhausted = true;
                continue;
            }
            const counter = await this.counter(tx, candidate.id, context.capToken, actorScope, now);
            if (await this.frequencyCache.capped(counter.id, revision.cap24Hours, revision.cap7Days, now)) {
                capped = true;
                continue;
            }
            await tx.$executeRaw`SELECT id FROM delivery_counters WHERE id = ${counter.id}::uuid FOR UPDATE`;
            const counts = await this.frequency(tx, counter.id, now);
            if (
                counts.day >= revision.cap24Hours ||
                counts.week >= revision.cap7Days ||
                (counter.lastViewableAt !== null && now.getTime() - counter.lastViewableAt.getTime() < 300_000)
            ) {
                capped = true;
                continue;
            }
            const creative = candidate.creatives
                .filter((item) => revision.creativeIds.includes(item.id) && item.format === placement.format)
                .sort((left, right) => left.id.localeCompare(right.id))[0];
            if (creative === undefined) continue;
            return this.issue(tx, candidate, revision, creative, placement, counter.id, reservation, now);
        }
        if (eligible.length > 0)
            return this.noFill(capped ? 'FREQUENCY_CAPPED' : exhausted ? 'BUDGET_EXHAUSTED' : 'CREATIVE_REJECTED');
        if (placement.fallbackEnabled) return this.fallback(context);
        return this.noFill('NO_ELIGIBLE_CAMPAIGN');
    }

    async impression(input: JsonRecord, tx: Prisma.TransactionClient): Promise<object> {
        this.assertExact(input, ['deliveryToken', 'visiblePercent', 'continuousForegroundMilliseconds']);
        const token = this.requiredToken(input.deliveryToken);
        const visiblePercent = this.integer(input.visiblePercent, 50, 100);
        const foreground = this.integer(input.continuousForegroundMilliseconds, 1000, 600_000);
        const issued = await tx.adDeliveryEvent.findFirst({
            where: { kind: 'ISSUED', deliveryTokenHash: this.crypto.hash(`AD_DELIVERY:${token}`) },
            include: { campaignRevision: true },
        });
        if (issued === null) throw advertisingError('TOKEN_REPLAYED', 409);
        const duplicate = await tx.adDeliveryEvent.findUnique({
            where: { deliveryId_kind: { deliveryId: issued.deliveryId, kind: 'VIEWABLE_IMPRESSION' } },
        });
        if (duplicate !== null) return this.receipt(duplicate, true, true, null);
        if (issued.tokenExpiresAt === null || issued.tokenExpiresAt <= new Date())
            throw advertisingError('DELIVERY_TOKEN_EXPIRED', 410);
        if (visiblePercent < 50 || foreground < 1000) return this.rejectedReceipt('NOT_VIEWABLE');
        const finalized = issued.campaignRevision.billingModel === 'CPM' ? issued.reservedMinor : 0n;
        const event = await tx.adDeliveryEvent.create({
            data: this.measurementData(issued, 'VIEWABLE_IMPRESSION', finalized, new Date()),
        });
        await this.aggregateMeasurement(tx, event, 'VIEWABLE_IMPRESSION');
        if (event.deliveryCounterId !== null) {
            const counts = await this.frequency(tx, event.deliveryCounterId, event.occurredAt);
            await this.frequencyCache.store(event.deliveryCounterId, counts.day, counts.week, event.occurredAt);
        }
        await this.deliveryOutbox(tx, 'advertising.impression.viewable.v1', event);
        return this.receipt(event, true, false, null);
    }

    async click(input: JsonRecord, tx: Prisma.TransactionClient): Promise<object> {
        this.assertExact(input, ['clickToken', 'trustedActivation']);
        const token = this.requiredToken(input.clickToken);
        if (typeof input.trustedActivation !== 'boolean') throw advertisingError('VALIDATION_FAILED', 400);
        const issued = await tx.adDeliveryEvent.findFirst({
            where: { kind: 'ISSUED', clickTokenHash: this.crypto.hash(`AD_CLICK:${token}`) },
            include: { campaignRevision: true, creative: true },
        });
        if (issued === null) throw advertisingError('TOKEN_REPLAYED', 409);
        const existing = await tx.adDeliveryEvent.findFirst({
            where: { deliveryId: issued.deliveryId, kind: { in: ['VALID_CLICK', 'INVALID_CLICK'] } },
        });
        if (existing !== null) {
            const accepted = existing.kind === 'VALID_CLICK';
            return {
                ...this.receipt(existing, accepted, true, accepted ? null : existing.invalidReason),
                redirectUrl: accepted ? issued.creative.landingUrl : null,
            };
        }
        if (issued.tokenExpiresAt === null || issued.tokenExpiresAt <= new Date())
            throw advertisingError('DELIVERY_TOKEN_EXPIRED', 410);
        if (!input.trustedActivation) {
            const event = await tx.adDeliveryEvent.create({
                data: {
                    ...this.measurementData(issued, 'INVALID_CLICK', 0n, new Date()),
                    invalidReason: 'UNTRUSTED_ACTIVATION',
                },
            });
            await this.aggregateMeasurement(tx, event, 'INVALID_CLICK');
            return { ...this.receipt(event, false, false, 'UNTRUSTED_ACTIVATION'), redirectUrl: null };
        }
        const destination = this.safeDestination(issued.creative);
        const finalized = issued.campaignRevision.billingModel === 'CPC' ? issued.reservedMinor : 0n;
        const event = await tx.adDeliveryEvent.create({
            data: this.measurementData(issued, 'VALID_CLICK', finalized, new Date()),
        });
        await this.aggregateMeasurement(tx, event, 'VALID_CLICK');
        await this.deliveryOutbox(tx, 'advertising.click.validated.v1', event);
        return { ...this.receipt(event, true, false, null), redirectUrl: destination };
    }

    async listPlacements(limit: number): Promise<object> {
        const rows = await this.prisma.placement.findMany({ orderBy: [{ code: 'asc' }], take: limit + 1 });
        return {
            items: rows.slice(0, limit).map((row) => this.placement(row)),
            pageInfo: { hasNext: rows.length > limit, nextCursor: null },
        };
    }

    async createPlacement(actorId: string, input: JsonRecord, tx: Prisma.TransactionClient): Promise<object> {
        this.assertPlacementInput(input);
        const row = await tx.placement.create({ data: { id: uuidV7(), ...this.placementData(input) } });
        await this.auditEntry(tx, actorId, 'advertising.placement.created', 'AD_PLACEMENT', row.id, ['policy']);
        return this.placement(row);
    }

    async updatePlacement(
        actorId: string,
        id: string,
        input: JsonRecord,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        this.assertPlacementInput(input);
        const result = await tx.placement.updateMany({
            where: { id, version: BigInt(Number(input.expectedVersion)) },
            data: { ...this.placementData(input), version: { increment: 1 }, updatedAt: new Date() },
        });
        if (result.count === 0) {
            if ((await tx.placement.findUnique({ where: { id } })) === null)
                throw advertisingError('AD_RESOURCE_NOT_FOUND', 404);
            throw advertisingError('REVISION_CONFLICT', 409);
        }
        const row = await tx.placement.findUniqueOrThrow({ where: { id } });
        await this.auditEntry(tx, actorId, 'advertising.placement.updated', 'AD_PLACEMENT', id, ['policy']);
        return this.placement(row);
    }

    async listCampaigns(limit: number, state?: string): Promise<object> {
        if (state !== undefined && !Object.values(AdCampaignState).includes(state as AdCampaignState))
            throw advertisingError('VALIDATION_FAILED', 400);
        const rows = await this.prisma.campaign.findMany({
            where: state === undefined ? {} : { state: state as AdCampaignState },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
        });
        return {
            items: rows.slice(0, limit).map((row) => this.campaign(row)),
            pageInfo: { hasNext: rows.length > limit, nextCursor: null },
        };
    }

    async createCampaign(actorId: string, input: CampaignInput, tx: Prisma.TransactionClient): Promise<object> {
        this.assertCampaignInput(input, false);
        const row = await tx.campaign.create({
            data: {
                id: uuidV7(),
                advertiserName: this.text(input.advertiserName, 160),
                advertiserLegalId: this.text(input.advertiserLegalId, 120),
                timezone: input.timezone,
                startsAt: new Date(input.startsAt),
                endsAt: new Date(input.endsAt),
                currency: input.currency,
                budgetMinor: BigInt(input.budgetMinor),
            },
        });
        await this.auditEntry(tx, actorId, 'advertising.campaign.created', 'AD_CAMPAIGN', row.id, [
            'schedule',
            'budget',
        ]);
        return this.campaign(row);
    }

    async getCampaign(id: string): Promise<object> {
        const row = await this.prisma.campaign.findUnique({ where: { id } });
        if (row === null) throw advertisingError('AD_RESOURCE_NOT_FOUND', 404);
        return this.campaign(row);
    }

    async createCreative(actorId: string, input: CreativeInput, tx: Prisma.TransactionClient): Promise<object> {
        this.assertCreativeInput(input);
        const campaign = await tx.campaign.findUnique({ where: { id: input.campaignId } });
        if (campaign === null) throw advertisingError('AD_RESOURCE_NOT_FOUND', 404);
        if (Number(campaign.version) !== input.expectedCampaignVersion)
            throw advertisingError('REVISION_CONFLICT', 409);
        const revision =
            (await tx.creative.aggregate({ where: { campaignId: campaign.id }, _max: { revision: true } }))._max
                .revision ?? 0;
        const row = await tx.creative.create({
            data: {
                id: uuidV7(),
                campaignId: campaign.id,
                revision: revision + 1,
                format: input.format as AdCreativeFormat,
                assetId: input.assetId,
                mediaType: input.mediaType,
                byteLength: BigInt(input.byteLength),
                sha256: input.sha256,
                altText: this.text(input.altText, 500),
                headline: input.headline === undefined ? null : this.text(input.headline, 120),
                body: input.body === undefined ? null : this.text(input.body, 300),
                landingUrl: this.https(input.landingUrl),
                approvedRedirectHosts: this.redirectHosts(input.landingUrl, input.approvedRedirectHosts),
                createdByUserId: actorId,
            },
        });
        await this.auditEntry(tx, actorId, 'advertising.creative.created', 'AD_CREATIVE', row.id, [
            'asset',
            'destination',
        ]);
        return this.creative(row);
    }

    async getCreative(id: string): Promise<object> {
        const row = await this.prisma.creative.findUnique({ where: { id } });
        if (row === null) throw advertisingError('AD_RESOURCE_NOT_FOUND', 404);
        return this.creative(row);
    }

    async createRevision(
        actorId: string,
        campaignId: string,
        input: CampaignRevisionInput,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        this.assertCampaignInput(input, true);
        const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
        if (campaign === null) throw advertisingError('AD_RESOURCE_NOT_FOUND', 404);
        if (Number(campaign.version) !== input.expectedVersion) throw advertisingError('REVISION_CONFLICT', 409);
        await this.assertInventory(tx, campaignId, input);
        const revisionNumber =
            (await tx.campaignRevision.aggregate({ where: { campaignId }, _max: { revision: true } }))._max.revision ??
            0;
        const snapshotHash = createHash('sha256').update(canonicalAdvertisingRequest(input)).digest('hex');
        const row = await tx.campaignRevision.create({
            data: {
                id: uuidV7(),
                campaignId,
                revision: revisionNumber + 1,
                advertiserName: this.text(input.advertiserName, 160),
                advertiserLegalId: this.text(input.advertiserLegalId, 120),
                timezone: input.timezone,
                startsAt: new Date(input.startsAt),
                endsAt: new Date(input.endsAt),
                currency: input.currency,
                budgetMinor: BigInt(input.budgetMinor),
                billingModel: input.billingModel as AdBillingModel,
                rateMinor: BigInt(input.rateMinor),
                priorityTier: input.priorityTier as AdPriorityTier,
                cap24Hours: input.cap24Hours,
                cap7Days: input.cap7Days,
                placementIds: input.placementIds,
                creativeIds: input.creativeIds,
                legalLabel: input.legalLabel.label,
                legalDisclosure: input.legalLabel.disclosure,
                registrationToken: input.legalLabel.registrationToken,
                policyVersion: input.policyVersion,
                snapshotHash,
                submittedByUserId: actorId,
                targetRules: {
                    create: input.targetRules.map((rule) => ({
                        id: uuidV7(),
                        dimension: rule.dimension as AdTargetDimension,
                        operator: rule.operator as AdTargetOperator,
                        values: rule.values,
                    })),
                },
            },
        });
        if (campaign.state === 'ACTIVE') {
            await tx.campaign.update({
                where: { id: campaignId },
                data: { state: 'PAUSED', version: { increment: 1 } },
            });
        }
        await tx.campaign.update({
            where: { id: campaignId },
            data: {
                currentRevisionId: row.id,
                approvedRevisionId: null,
                state: 'DRAFT',
                version: { increment: 1 },
                updatedAt: new Date(),
            },
        });
        await this.auditEntry(tx, actorId, 'advertising.campaign.revision_created', 'AD_CAMPAIGN', campaignId, [
            'revision',
        ]);
        return this.revision(row, input);
    }

    async decideCampaign(
        actorId: string,
        campaignId: string,
        input: JsonRecord,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        this.assertExact(input, [
            'expectedVersion',
            'revisionId',
            'decision',
            'reason',
            'checklistVersion',
            'independentReviewer',
        ]);
        const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
        if (campaign === null) throw advertisingError('AD_RESOURCE_NOT_FOUND', 404);
        if (Number(campaign.version) !== this.integer(input.expectedVersion, 0, Number.MAX_SAFE_INTEGER))
            throw advertisingError('REVISION_CONFLICT', 409);
        const revisionId = String(input.revisionId);
        const revision = await tx.campaignRevision.findUnique({ where: { id: revisionId } });
        if (revision?.campaignId !== campaignId || campaign.currentRevisionId !== revisionId)
            throw advertisingError('APPROVAL_REQUIRED', 422);
        const decision = String(input.decision);
        this.reason(input.reason);
        if (!['SUBMIT', 'APPROVE', 'REJECT'].includes(decision) || !POLICY.test(String(input.checklistVersion)))
            throw advertisingError('VALIDATION_FAILED', 400);
        if (decision === 'SUBMIT' && campaign.state !== 'DRAFT')
            throw advertisingError('INVALID_STATE_TRANSITION', 400);
        if ((decision === 'APPROVE' || decision === 'REJECT') && campaign.state !== 'IN_REVIEW')
            throw advertisingError('INVALID_STATE_TRANSITION', 400);
        if (decision === 'APPROVE' && (input.independentReviewer !== true || revision.submittedByUserId === actorId))
            throw advertisingError('CONFLICT_OF_INTEREST', 403);
        const now = new Date();
        const deliveryState: AdCampaignState = now < revision.startsAt ? 'SCHEDULED' : 'ACTIVE';
        if (decision === 'APPROVE')
            await tx.campaignRevision.update({
                where: { id: revisionId },
                data: { reviewedByUserId: actorId, approvedAt: now },
            });
        let updated = await tx.campaign.update({
            where: { id: campaignId },
            data: {
                state: decision === 'SUBMIT' ? 'IN_REVIEW' : decision === 'REJECT' ? 'REJECTED' : 'APPROVED',
                version: { increment: 1 },
                updatedAt: now,
                ...(decision === 'APPROVE'
                    ? {
                          approvedRevisionId: revisionId,
                          advertiserName: revision.advertiserName,
                          advertiserLegalId: revision.advertiserLegalId,
                          timezone: revision.timezone,
                          startsAt: revision.startsAt,
                          endsAt: revision.endsAt,
                          currency: revision.currency,
                          budgetMinor: revision.budgetMinor,
                      }
                    : {}),
            },
        });
        if (decision === 'APPROVE') {
            updated = await tx.campaign.update({
                where: { id: campaignId },
                data: { state: deliveryState, version: { increment: 1 }, updatedAt: now },
            });
        }
        await tx.adCampaignDecision.create({
            data: {
                id: uuidV7(),
                campaignId,
                campaignRevisionId: revisionId,
                campaignVersion: updated.version,
                kind: decision as AdCampaignDecisionKind,
                reasonCode: String(input.reason),
                checklistVersion: String(input.checklistVersion),
                actorUserId: actorId,
                reviewerUserId: decision === 'APPROVE' ? actorId : null,
                operationId: uuidV7(),
            },
        });
        await this.auditEntry(
            tx,
            actorId,
            `advertising.campaign.${decision.toLowerCase()}`,
            'AD_CAMPAIGN',
            campaignId,
            ['state'],
            String(input.reason)
        );
        return this.campaign(updated);
    }

    async campaignState(
        actorId: string,
        campaignId: string,
        input: JsonRecord,
        resume: boolean,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        this.assertExact(input, ['expectedVersion', 'reason']);
        this.reason(input.reason);
        const campaign = await tx.campaign.findUnique({
            where: { id: campaignId },
            include: { approvedRevision: true },
        });
        if (campaign === null) throw advertisingError('AD_RESOURCE_NOT_FOUND', 404);
        if (Number(campaign.version) !== this.integer(input.expectedVersion, 0, Number.MAX_SAFE_INTEGER))
            throw advertisingError('REVISION_CONFLICT', 409);
        if (
            (!resume && !['APPROVED', 'SCHEDULED', 'ACTIVE'].includes(campaign.state)) ||
            (resume && campaign.state !== 'PAUSED')
        )
            throw advertisingError('INVALID_STATE_TRANSITION', 400);
        const now = new Date();
        if (
            resume &&
            (campaign.approvedRevision === null ||
                now < campaign.startsAt ||
                now >= campaign.endsAt ||
                campaign.spentMinor >= campaign.budgetMinor)
        )
            throw advertisingError('INVALID_STATE_TRANSITION', 400);
        const state: AdCampaignState = resume ? 'ACTIVE' : 'PAUSED';
        if (campaign.approvedRevisionId === null) throw advertisingError('APPROVAL_REQUIRED', 422);
        const updated = await tx.campaign.update({
            where: { id: campaignId },
            data: { state, version: { increment: 1 }, updatedAt: now },
        });
        await tx.adCampaignDecision.create({
            data: {
                id: uuidV7(),
                campaignId,
                campaignRevisionId: campaign.approvedRevisionId,
                campaignVersion: updated.version,
                kind: resume ? 'RESUME' : 'PAUSE',
                reasonCode: String(input.reason),
                actorUserId: actorId,
                operationId: uuidV7(),
            },
        });
        await this.auditEntry(
            tx,
            actorId,
            `advertising.campaign.${resume ? 'resumed' : 'paused'}`,
            'AD_CAMPAIGN',
            campaignId,
            ['state'],
            String(input.reason)
        );
        return this.campaign(updated);
    }

    async listProviders(): Promise<object[]> {
        const rows = await this.prisma.adProviderPolicy.findMany({
            orderBy: [{ code: 'asc' }, { version: 'desc' }],
            distinct: ['code'],
        });
        return rows.map((row) => this.providerState(row));
    }

    async changeProvider(
        actorId: string,
        code: string,
        input: JsonRecord,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        this.assertExact(input, [
            'expectedVersion',
            'enabled',
            'reason',
            'termsUrl',
            'termsVersion',
            'reviewDueAt',
            'policyVersion',
            'allowedFields',
        ]);
        if (!CODE.test(code) || typeof input.enabled !== 'boolean') throw advertisingError('VALIDATION_FAILED', 400);
        this.reason(input.reason);
        if (input.enabled) throw advertisingError('LEGAL_EVIDENCE_REQUIRED', 422);
        const current = await tx.adProviderPolicy.findFirst({ where: { code }, orderBy: { version: 'desc' } });
        const expected = this.integer(input.expectedVersion, 0, Number.MAX_SAFE_INTEGER);
        if ((current?.version ?? 0) !== expected) throw advertisingError('REVISION_CONFLICT', 409);
        const allowed = input.allowedFields;
        if (!Array.isArray(allowed) || allowed.some((item) => !TARGET_DIMENSIONS.includes(item as AdTargetDimension)))
            throw advertisingError('TARGETING_REJECTED', 422);
        if (typeof input.policyVersion !== 'string' || !POLICY.test(input.policyVersion))
            throw advertisingError('VALIDATION_FAILED', 400);
        const reviewDueAt = this.date(input.reviewDueAt);
        if (reviewDueAt <= new Date()) throw advertisingError('VALIDATION_FAILED', 400);
        const row = await tx.adProviderPolicy.create({
            data: {
                id: uuidV7(),
                code,
                version: expected + 1,
                enabled: false,
                legalReview: 'PENDING',
                securityReview: 'PENDING',
                privacyReview: 'PENDING',
                commercialReview: 'PENDING',
                termsUrl: this.https(typeof input.termsUrl === 'string' ? input.termsUrl : ''),
                termsVersion: this.text(input.termsVersion, 120),
                policyVersion: input.policyVersion,
                allowedFields: allowed as string[],
                reviewDueAt,
                evidenceCiphertext: this.crypto.encrypt(
                    JSON.stringify({ disabledReason: input.reason, policyVersion: input.policyVersion })
                ),
                encryptionKeyVersion: 1,
                createdByUserId: actorId,
            },
        });
        await this.auditEntry(
            tx,
            actorId,
            'advertising.provider.disabled',
            'AD_PROVIDER',
            row.id,
            ['enabled'],
            String(input.reason)
        );
        return this.providerState(row);
    }

    async report(input: JsonRecord): Promise<object> {
        this.assertExact(input, ['campaignId', 'creativeId', 'placementId', 'from', 'until']);
        const from = this.date(input.from);
        const until = this.date(input.until);
        if (from >= until || until.getTime() - from.getTime() > 366 * 86_400_000)
            throw advertisingError('INVALID_TIME_RANGE', 400);
        const campaignId = this.optionalUuid(input.campaignId);
        const creativeId = this.optionalUuid(input.creativeId);
        const placementId = this.optionalUuid(input.placementId);
        const rows = await this.prisma.adReportDaily.findMany({
            where: {
                day: { gte: from, lt: until },
                ...(campaignId === undefined ? {} : { campaignId }),
                ...(creativeId === undefined ? {} : { creativeId }),
                ...(placementId === undefined ? {} : { placementId }),
            },
            orderBy: [{ day: 'asc' }],
        });
        return {
            rows: rows.map((row) => {
                const suppressed = row.served < 20n;
                return {
                    day: row.day.toISOString().slice(0, 10),
                    campaignId: row.campaignId,
                    creativeId: suppressed ? null : row.creativeId,
                    placementId: suppressed ? null : row.placementId,
                    eligible: Number(row.eligible),
                    served: Number(row.served),
                    viewable: suppressed ? 0 : Number(row.viewable),
                    validClicks: suppressed ? 0 : Number(row.validClicks),
                    invalidEvents: suppressed ? 0 : Number(row.invalidEvents),
                    spendMinor: suppressed ? 0 : Number(row.spendMinor),
                    suppressed,
                };
            }),
            minimumCohortSize: 20,
            generatedAt: new Date().toISOString(),
        };
    }

    private async issue(
        tx: Prisma.TransactionClient,
        campaign: Candidate,
        revision: CampaignRevision,
        creative: Creative,
        placement: Placement,
        counterId: string,
        reservation: bigint,
        now: Date
    ): Promise<object> {
        const deliveryId = uuidV7();
        const deliveryToken = this.crypto.secret();
        const clickToken = this.crypto.secret();
        const expiresAt = new Date(now.getTime() + 15 * 60_000);
        const event = await tx.adDeliveryEvent.create({
            data: {
                id: uuidV7(),
                deliveryId,
                kind: 'ISSUED',
                source: campaign.approvedRevision?.priorityTier === 'HOUSE_EMERGENCY' ? 'HOUSE' : 'DIRECT',
                campaignId: campaign.id,
                campaignRevisionId: revision.id,
                creativeId: creative.id,
                placementId: placement.id,
                deliveryCounterId: counterId,
                deliveryTokenHash: this.crypto.hash(`AD_DELIVERY:${deliveryToken}`),
                clickTokenHash: this.crypto.hash(`AD_CLICK:${clickToken}`),
                tokenExpiresAt: expiresAt,
                reservedMinor: reservation,
                timingBucket: this.timingBucket(now),
                policyVersion: revision.policyVersion,
                occurredAt: now,
                expiresAt: new Date(now.getTime() + 30 * 86_400_000),
            },
        });
        await tx.adReportDaily.upsert({
            where: {
                day_campaignId_creativeId_placementId: {
                    day: this.day(now),
                    campaignId: campaign.id,
                    creativeId: creative.id,
                    placementId: placement.id,
                },
            },
            create: {
                day: this.day(now),
                campaignId: campaign.id,
                creativeId: creative.id,
                placementId: placement.id,
                eligible: 1,
                served: 1,
            },
            update: { eligible: { increment: 1 }, served: { increment: 1 }, updatedAt: now },
        });
        await this.deliveryOutbox(tx, 'advertising.delivery.issued.v1', event);
        return {
            source: event.source,
            deliveryToken,
            clickToken,
            campaignId: campaign.id,
            campaignRevisionId: revision.id,
            creativeId: creative.id,
            placementId: placement.id,
            expiresAt: expiresAt.toISOString(),
            refreshAfterSeconds: 300,
            legal: {
                label: 'Реклама',
                advertiserName: revision.advertiserName,
                registrationToken: revision.registrationToken,
                disclosure: revision.legalDisclosure,
            },
            creative: {
                format: creative.format,
                assetUrl: `${this.assetBaseUrl}/${creative.assetId}`,
                mediaType: creative.mediaType,
                byteLength: Number(creative.byteLength),
                altText: creative.altText,
                headline: creative.headline,
                body: creative.body,
            },
        };
    }

    private async counter(
        tx: Prisma.TransactionClient,
        campaignId: string,
        capToken: string | undefined,
        actorScope: string,
        now: Date
    ) {
        const subject = capToken === undefined ? `SESSION:${actorScope}` : `DURABLE:${capToken}`;
        const capSubjectHash = this.crypto.hash(`AD_CAP:${subject}`);
        return tx.deliveryCounter.upsert({
            where: { campaignId_capSubjectHash: { campaignId, capSubjectHash } },
            create: {
                id: uuidV7(),
                campaignId,
                capSubjectHash,
                window24StartedAt: now,
                window7StartedAt: now,
                expiresAt: new Date(now.getTime() + 8 * 86_400_000),
            },
            update: {},
        });
    }

    private async frequency(
        tx: Prisma.TransactionClient,
        counterId: string,
        now: Date
    ): Promise<{ day: number; week: number }> {
        const [day, week] = await Promise.all([
            tx.adDeliveryEvent.count({
                where: {
                    deliveryCounterId: counterId,
                    kind: 'VIEWABLE_IMPRESSION',
                    occurredAt: { gt: new Date(now.getTime() - 86_400_000) },
                },
            }),
            tx.adDeliveryEvent.count({
                where: {
                    deliveryCounterId: counterId,
                    kind: 'VIEWABLE_IMPRESSION',
                    occurredAt: { gt: new Date(now.getTime() - 7 * 86_400_000) },
                },
            }),
        ]);
        return { day, week };
    }

    private isEligible(candidate: Candidate, placement: Placement, context: DecisionContext): boolean {
        const revision = candidate.approvedRevision;
        return (
            revision !== null &&
            revision.placementIds.includes(placement.id) &&
            revision.targetRules.every((rule) => {
                const value = this.dimension(context, rule.dimension);
                const matches = value !== undefined && rule.values.includes(value);
                return rule.operator === 'INCLUDE' ? matches : !matches;
            })
        );
    }

    private dimension(context: DecisionContext, dimension: AdTargetDimension): string | undefined {
        const values: Record<AdTargetDimension, string | undefined> = {
            SURFACE: context.surface,
            CLIENT_KIND: context.clientKind,
            LOCALE: context.locale,
            FORM_FACTOR: context.formFactor,
            OBJECT_CLASS: context.objectClass,
            CONTENT_CATEGORY: context.contentCategory,
            COUNTRY: context.geography?.countryCode,
            REGION: context.geography?.regionCode,
            CITY: context.geography?.cityCode,
            CONNECTIVITY: context.connectivity,
        };
        return values[dimension];
    }

    private compareCandidates(left: Candidate, right: Candidate): number {
        const leftRevision = left.approvedRevision;
        const rightRevision = right.approvedRevision;
        if (leftRevision === null) return 1;
        if (rightRevision === null) return -1;
        return (
            PRIORITY[leftRevision.priorityTier] - PRIORITY[rightRevision.priorityTier] ||
            leftRevision.snapshotHash.localeCompare(rightRevision.snapshotHash) ||
            left.id.localeCompare(right.id)
        );
    }

    private reservation(revision: CampaignRevision): bigint {
        if (revision.billingModel === 'CPM') return (revision.rateMinor + 999n) / 1000n;
        if (revision.billingModel === 'CPC') return revision.rateMinor;
        return 0n;
    }

    private async fallback(context: DecisionContext): Promise<object> {
        if (!context.providerConsent) return this.noFill('PROVIDER_CONSENT_REQUIRED');
        const policy = await this.prisma.adProviderPolicy.findFirst({
            where: { enabled: true },
            orderBy: { createdAt: 'desc' },
        });
        if (policy === null) return this.noFill('PROVIDER_DISABLED');
        if (
            policy.reviewDueAt <= new Date() ||
            [policy.legalReview, policy.securityReview, policy.privacyReview, policy.commercialReview].some(
                (review) => review !== 'APPROVED'
            )
        )
            return this.noFill('PROVIDER_DISABLED');
        try {
            await this.provider.decide(context);
        } catch {
            return this.noFill('PROVIDER_TIMEOUT', 300);
        }
        return this.noFill('PROVIDER_TIMEOUT', 300);
    }

    private measurementData(
        issued: Awaited<ReturnType<Prisma.TransactionClient['adDeliveryEvent']['findFirstOrThrow']>>,
        kind: AdDeliveryEventKind,
        finalizedMinor: bigint,
        now: Date
    ): Prisma.AdDeliveryEventUncheckedCreateInput {
        return {
            id: uuidV7(),
            deliveryId: issued.deliveryId,
            kind,
            source: issued.source,
            campaignId: issued.campaignId,
            campaignRevisionId: issued.campaignRevisionId,
            creativeId: issued.creativeId,
            placementId: issued.placementId,
            deliveryCounterId: issued.deliveryCounterId,
            finalizedMinor,
            timingBucket: this.timingBucket(now),
            policyVersion: issued.policyVersion,
            occurredAt: now,
            expiresAt: new Date(now.getTime() + 30 * 86_400_000),
        };
    }

    private async deliveryOutbox(
        tx: Prisma.TransactionClient,
        type: string,
        event: {
            id: string;
            deliveryId: string;
            campaignId: string;
            campaignRevisionId: string;
            creativeId: string;
            placementId: string;
            occurredAt: Date;
        }
    ): Promise<void> {
        const context = this.requestContext.get();
        await this.outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                eventId: event.id,
                deliveryId: event.deliveryId,
                campaignId: event.campaignId,
                campaignRevisionId: event.campaignRevisionId,
                creativeId: event.creativeId,
                placementId: event.placementId,
                occurredAt: event.occurredAt.toISOString(),
            },
            correlationId: context?.correlationId ?? uuidV7(),
            occurredAt: event.occurredAt,
        });
    }

    private async aggregateMeasurement(
        tx: Prisma.TransactionClient,
        event: {
            campaignId: string;
            creativeId: string;
            placementId: string;
            occurredAt: Date;
            finalizedMinor: bigint;
        },
        kind: 'VIEWABLE_IMPRESSION' | 'VALID_CLICK' | 'INVALID_CLICK'
    ): Promise<void> {
        const identity = {
            day: this.day(event.occurredAt),
            campaignId: event.campaignId,
            creativeId: event.creativeId,
            placementId: event.placementId,
        };
        await tx.adReportDaily.upsert({
            where: { day_campaignId_creativeId_placementId: identity },
            create: {
                ...identity,
                served: 1,
                viewable: kind === 'VIEWABLE_IMPRESSION' ? 1 : 0,
                validClicks: kind === 'VALID_CLICK' ? 1 : 0,
                invalidEvents: kind === 'INVALID_CLICK' ? 1 : 0,
                spendMinor: event.finalizedMinor,
            },
            update: {
                ...(kind === 'VIEWABLE_IMPRESSION' ? { viewable: { increment: 1 } } : {}),
                ...(kind === 'VALID_CLICK' ? { validClicks: { increment: 1 } } : {}),
                ...(kind === 'INVALID_CLICK' ? { invalidEvents: { increment: 1 } } : {}),
                spendMinor: { increment: event.finalizedMinor },
                updatedAt: event.occurredAt,
            },
        });
    }

    private async auditEntry(
        tx: Prisma.TransactionClient,
        actorId: string,
        action: string,
        targetType: string,
        targetId: string,
        fields: string[],
        reasonCode?: string
    ): Promise<void> {
        const context = this.requestContext.get();
        await this.audit.append(tx, {
            actorType: 'USER',
            actorId,
            action,
            targetType,
            targetId,
            outcome: 'SUCCEEDED',
            ...(reasonCode === undefined ? {} : { reasonCode }),
            changedFields: { fields },
            requestId: context?.requestId ?? uuidV7(),
            correlationId: context?.correlationId ?? uuidV7(),
            source: 'advertising',
        });
    }

    private receipt(
        event: { id: string; kind: AdDeliveryEventKind; occurredAt: Date },
        accepted: boolean,
        duplicate: boolean,
        invalidReason: string | null
    ): object {
        return {
            receiptId: event.id,
            event: event.kind,
            accepted,
            duplicate,
            invalidReason,
            recordedAt: event.occurredAt.toISOString(),
        };
    }
    private rejectedReceipt(reason: string): object {
        return {
            receiptId: uuidV7(),
            event: 'VIEWABLE_IMPRESSION',
            accepted: false,
            duplicate: false,
            invalidReason: reason,
            recordedAt: new Date().toISOString(),
        };
    }
    private noFill(reason: string, retryAfterSeconds: number | null = null): object {
        return { source: 'NO_FILL', reason, retryAfterSeconds };
    }
    private campaign(row: Campaign): object {
        return {
            id: row.id,
            version: Number(row.version),
            state: row.state,
            currentRevisionId: row.currentRevisionId,
            approvedRevisionId: row.approvedRevisionId,
            advertiserName: row.advertiserName,
            startsAt: row.startsAt.toISOString(),
            endsAt: row.endsAt.toISOString(),
            currency: row.currency,
            budgetMinor: Number(row.budgetMinor),
            reservedMinor: Number(row.reservedMinor),
            spentMinor: Number(row.spentMinor),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        };
    }
    private placement(row: Placement): object {
        return {
            id: row.id,
            version: Number(row.version),
            code: row.code,
            surface: row.surface,
            format: row.format,
            enabled: row.enabled,
            fallbackEnabled: row.fallbackEnabled,
            minimumWidth: row.minimumWidth,
            minimumHeight: row.minimumHeight,
            updatedAt: row.updatedAt.toISOString(),
        };
    }
    private creative(row: Creative): object {
        return {
            id: row.id,
            campaignId: row.campaignId,
            revision: row.revision,
            format: row.format,
            assetId: row.assetId,
            altText: row.altText,
            landingUrl: row.landingUrl,
            immutable: true,
            createdAt: row.createdAt.toISOString(),
        };
    }
    private revision(row: CampaignRevision, snapshot: CampaignRevisionInput): object {
        return {
            id: row.id,
            campaignId: row.campaignId,
            revision: row.revision,
            snapshot,
            snapshotHash: row.snapshotHash,
            approvedAt: row.approvedAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
        };
    }
    private providerState(row: {
        code: string;
        version: number;
        policyVersion: string;
        enabled: boolean;
        legalReview: ContentReviewState;
        securityReview: ContentReviewState;
        privacyReview: ContentReviewState;
        commercialReview: ContentReviewState;
        reviewDueAt: Date;
        allowedFields: string[];
        createdAt: Date;
    }): object {
        const reviews = [row.legalReview, row.securityReview, row.privacyReview, row.commercialReview];
        const reviewState = reviews.every((review) => review === 'APPROVED')
            ? 'APPROVED'
            : reviews.some((review) => review === 'REJECTED')
              ? 'REJECTED'
              : 'PENDING';
        return {
            code: row.code,
            enabled: row.enabled,
            reviewState,
            reviewDueAt: row.reviewDueAt.toISOString(),
            policyVersion: row.policyVersion,
            allowedFields: row.allowedFields,
            updatedAt: row.createdAt.toISOString(),
        };
    }

    private assertContext(input: DecisionContext): void {
        this.assertExact(input, [
            'placementCode',
            'surface',
            'clientKind',
            'locale',
            'formFactor',
            'objectClass',
            'contentCategory',
            'geography',
            'connectivity',
            'criticalState',
            'providerConsent',
            'capToken',
        ]);
        if (
            !CODE.test(input.placementCode) ||
            !CODE.test(input.surface) ||
            !CLIENT_KINDS.includes(input.clientKind) ||
            !FORM_FACTORS.includes(input.formFactor) ||
            !CONNECTIVITY.includes(input.connectivity) ||
            typeof input.criticalState !== 'boolean' ||
            typeof input.providerConsent !== 'boolean' ||
            typeof input.locale !== 'string' ||
            input.locale.length > 35 ||
            (input.capToken !== undefined && !TOKEN.test(input.capToken))
        )
            throw advertisingError('VALIDATION_FAILED', 400);
        for (const value of [input.objectClass, input.contentCategory])
            if (value !== undefined && !CODE.test(value)) throw advertisingError('VALIDATION_FAILED', 400);
        if (input.geography !== undefined) {
            this.assertExact(input.geography, ['countryCode', 'regionCode', 'cityCode']);
            if (!/^[A-Z]{2}$/u.test(input.geography.countryCode)) throw advertisingError('VALIDATION_FAILED', 400);
        }
    }

    private assertCampaignInput(input: CampaignInput, revision: boolean): void {
        this.assertExact(
            input,
            [
                'expectedVersion',
                'creativeIds',
                'advertiserName',
                'advertiserLegalId',
                'timezone',
                'startsAt',
                'endsAt',
                'currency',
                'budgetMinor',
                'billingModel',
                'rateMinor',
                'priorityTier',
                'cap24Hours',
                'cap7Days',
                'placementIds',
                'targetRules',
                'legalLabel',
                'policyVersion',
            ].filter((key) => revision || !['expectedVersion', 'creativeIds'].includes(key))
        );
        const starts = this.date(input.startsAt);
        const ends = this.date(input.endsAt);
        if (
            ends <= starts ||
            !/^[A-Z]{3}$/u.test(input.currency) ||
            !POLICY.test(input.policyVersion) ||
            !Object.values(AdBillingModel).includes(input.billingModel as AdBillingModel) ||
            !Object.values(AdPriorityTier).includes(input.priorityTier as AdPriorityTier) ||
            this.integer(input.budgetMinor, 1, Number.MAX_SAFE_INTEGER) < 1 ||
            this.integer(input.rateMinor, 0, Number.MAX_SAFE_INTEGER) < 0 ||
            this.integer(input.cap24Hours, 1, 3) > this.integer(input.cap7Days, 1, 10) ||
            !Array.isArray(input.placementIds) ||
            input.placementIds.length < 1 ||
            input.placementIds.length > 100 ||
            input.placementIds.some((id) => !UUID.test(id)) ||
            !Array.isArray(input.targetRules) ||
            typeof input.legalLabel !== 'object' ||
            input.legalLabel.label !== 'Реклама' ||
            input.legalLabel.advertiserName !== input.advertiserName ||
            typeof input.timezone !== 'string'
        )
            throw advertisingError('VALIDATION_FAILED', 400);
        this.assertExact(input.legalLabel, ['label', 'advertiserName', 'registrationToken', 'disclosure']);
        this.assertTimezone(input.timezone);
        this.optionalText(input.legalLabel.registrationToken, 160);
        this.optionalText(input.legalLabel.disclosure, 500);
        if (new Set(input.placementIds).size !== input.placementIds.length)
            throw advertisingError('VALIDATION_FAILED', 400);
        if (
            revision &&
            (!Array.isArray((input as CampaignRevisionInput).creativeIds) ||
                (input as CampaignRevisionInput).creativeIds.some((id) => !UUID.test(id)))
        )
            throw advertisingError('VALIDATION_FAILED', 400);
        if (
            revision &&
            new Set((input as CampaignRevisionInput).creativeIds).size !==
                (input as CampaignRevisionInput).creativeIds.length
        )
            throw advertisingError('VALIDATION_FAILED', 400);
        const ruleKeys = input.targetRules.map((rule) => `${rule.dimension}:${rule.operator}`);
        if (new Set(ruleKeys).size !== ruleKeys.length) throw advertisingError('TARGETING_REJECTED', 422);
        for (const rule of input.targetRules) this.assertTargetRule(rule);
    }
    private assertTargetRule(rule: TargetRuleInput): void {
        this.assertExact(rule, ['dimension', 'operator', 'values']);
        if (
            !TARGET_DIMENSIONS.includes(rule.dimension as AdTargetDimension) ||
            !TARGET_OPERATORS.includes(rule.operator as AdTargetOperator) ||
            !Array.isArray(rule.values) ||
            rule.values.length < 1 ||
            rule.values.length > 100 ||
            rule.values.some((value) => typeof value !== 'string' || !CODE.test(value))
        )
            throw advertisingError('TARGETING_REJECTED', 422);
    }
    private assertCreativeInput(input: CreativeInput): void {
        this.assertExact(input, [
            'campaignId',
            'expectedCampaignVersion',
            'format',
            'assetId',
            'mediaType',
            'byteLength',
            'sha256',
            'altText',
            'headline',
            'body',
            'landingUrl',
            'approvedRedirectHosts',
        ]);
        if (
            !UUID.test(input.campaignId) ||
            !UUID.test(input.assetId) ||
            !Object.values(AdCreativeFormat).includes(input.format as AdCreativeFormat) ||
            !['image/avif', 'image/jpeg', 'image/png', 'image/webp'].includes(input.mediaType) ||
            this.integer(input.byteLength, 1, 1_048_576) < 1 ||
            !/^[0-9a-f]{64}$/u.test(input.sha256) ||
            !Array.isArray(input.approvedRedirectHosts) ||
            input.approvedRedirectHosts.length < 1 ||
            input.approvedRedirectHosts.length > 10
        )
            throw advertisingError('VALIDATION_FAILED', 400);
        this.text(input.altText, 500);
        this.https(input.landingUrl);
        if (
            (input.format === 'STATIC_IMAGE' && (input.headline !== undefined || input.body !== undefined)) ||
            (input.format === 'TEXT_IMAGE_CARD' && input.headline === undefined)
        )
            throw advertisingError('VALIDATION_FAILED', 400);
    }
    private assertPlacementInput(input: JsonRecord): void {
        this.assertExact(input, [
            'expectedVersion',
            'code',
            'surface',
            'format',
            'enabled',
            'fallbackEnabled',
            'minimumWidth',
            'minimumHeight',
        ]);
        if (
            !CODE.test(String(input.code)) ||
            !CODE.test(String(input.surface)) ||
            !Object.values(AdCreativeFormat).includes(input.format as AdCreativeFormat) ||
            typeof input.enabled !== 'boolean' ||
            typeof input.fallbackEnabled !== 'boolean' ||
            (input.fallbackEnabled && !input.enabled)
        )
            throw advertisingError('VALIDATION_FAILED', 400);
        this.integer(input.expectedVersion, 0, Number.MAX_SAFE_INTEGER);
        this.integer(input.minimumWidth, 1, 4096);
        this.integer(input.minimumHeight, 1, 4096);
    }
    private placementData(input: JsonRecord): {
        code: string;
        surface: string;
        format: AdCreativeFormat;
        enabled: boolean;
        fallbackEnabled: boolean;
        minimumWidth: number;
        minimumHeight: number;
        pausedReason: string | null;
    } {
        return {
            code: String(input.code),
            surface: String(input.surface),
            format: input.format as AdCreativeFormat,
            enabled: Boolean(input.enabled),
            fallbackEnabled: Boolean(input.fallbackEnabled),
            minimumWidth: Number(input.minimumWidth),
            minimumHeight: Number(input.minimumHeight),
            pausedReason: input.enabled ? null : 'MANUAL',
        };
    }
    private async assertInventory(
        tx: Prisma.TransactionClient,
        campaignId: string,
        input: CampaignRevisionInput
    ): Promise<void> {
        const [placements, creatives] = await Promise.all([
            tx.placement.count({ where: { id: { in: input.placementIds } } }),
            tx.creative.count({ where: { id: { in: input.creativeIds }, campaignId } }),
        ]);
        if (
            placements !== new Set(input.placementIds).size ||
            creatives !== new Set(input.creativeIds).size ||
            input.creativeIds.length < 1
        )
            throw advertisingError('APPROVAL_REQUIRED', 422);
    }
    private safeDestination(creative: Creative): string {
        const url = new URL(creative.landingUrl);
        if (!creative.approvedRedirectHosts.includes(url.hostname.toLowerCase()))
            throw advertisingError('AD_POLICY_UNAVAILABLE', 503);
        return url.toString();
    }
    private redirectHosts(url: string, hosts: string[]): string[] {
        const landingHost = new URL(this.https(url)).hostname.toLowerCase();
        const normalized = hosts.map((host) => host.trim().toLowerCase());
        if (normalized.some((host) => !/^[a-z0-9.-]+$/u.test(host)) || !normalized.includes(landingHost))
            throw advertisingError('VALIDATION_FAILED', 400);
        return [...new Set(normalized)];
    }
    private reason(value: unknown): void {
        if (typeof value !== 'string' || !PAUSE_REASONS.has(value)) throw advertisingError('VALIDATION_FAILED', 400);
    }
    private requiredToken(value: unknown): string {
        if (typeof value !== 'string' || !TOKEN.test(value)) throw advertisingError('VALIDATION_FAILED', 400);
        return value;
    }
    private text(value: unknown, maximum: number): string {
        if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > maximum)
            throw advertisingError('VALIDATION_FAILED', 400);
        return value.trim();
    }
    private optionalText(value: unknown, maximum: number): string | null {
        if (value === null || value === undefined) return null;
        return this.text(value, maximum);
    }
    private assertTimezone(value: string): void {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
        } catch {
            throw advertisingError('VALIDATION_FAILED', 400);
        }
    }
    private https(value: string): string {
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new Error();
            if (
                (url.port !== '' && url.port !== '443') ||
                isIP(url.hostname) !== 0 ||
                !url.hostname.includes('.') ||
                url.hostname === 'localhost' ||
                url.hostname.endsWith('.local')
            )
                throw new Error();
            return url.toString();
        } catch {
            throw advertisingError('VALIDATION_FAILED', 400);
        }
    }
    private date(value: unknown): Date {
        if (typeof value !== 'string') throw advertisingError('VALIDATION_FAILED', 400);
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw advertisingError('VALIDATION_FAILED', 400);
        return date;
    }
    private integer(value: unknown, minimum: number, maximum: number): number {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum)
            throw advertisingError('VALIDATION_FAILED', 400);
        return value;
    }
    private optionalUuid(value: unknown): string | undefined {
        if (value === undefined) return undefined;
        if (typeof value !== 'string' || !UUID.test(value)) throw advertisingError('VALIDATION_FAILED', 400);
        return value;
    }
    private assertExact(value: object, keys: readonly string[]): void {
        if (Object.keys(value).some((key) => !keys.includes(key))) throw advertisingError('VALIDATION_FAILED', 400);
    }
    private timingBucket(value: Date): string {
        return `${value.toISOString().slice(0, 13)}:00Z`;
    }
    private day(value: Date): Date {
        return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
    }
}
