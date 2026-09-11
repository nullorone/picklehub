import { Injectable } from '@nestjs/common';
import {
    AdminRestrictionScope,
    AdminRestrictionState,
    ModerationCaseState,
    ModerationDecisionOutcome,
    PlatformRole,
    Prisma,
    VenueCandidateState,
    VenueModerationOutcome,
    VenueModerationSubject,
    VenuePublicationState,
    VenueSourceKind,
    VenueVerificationState,
} from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { OutboxService } from '../outbox/outbox.service';
import { TrustSafetyCryptoService } from '../trust-safety/trust-safety-crypto.service';
import { AdministrationConfirmationService } from './administration-confirmation.service';
import { AdministrationCursorService } from './administration-cursor.service';
import { AdminPurposeDto } from './administration.dto';
import type {
    AuditQueryDto,
    CaseQueryDto,
    ChangeRestrictionDto,
    CreateBreakGlassDto,
    CreateRoleGrantDto,
    DecideCaseDto,
    DecideVenueDto,
    MergeVenueDto,
    RevokeDto,
    UserLookupDto,
    VenueQueryDto,
} from './administration.dto';
import { administrationError, AdministrationException } from './administration.errors';
import { AdministrationMetricsService } from './administration-metrics.service';
import type { AuthenticatedAdmin } from './administration-session.service';

type Transaction = Prisma.TransactionClient;
interface MutationResult {
    response: object;
    auditId: string;
}

@Injectable()
export class AdministrationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly clock: Clock,
        private readonly crypto: IdentityCryptoService,
        private readonly safetyCrypto: TrustSafetyCryptoService,
        private readonly audit: AuditService,
        private readonly outbox: OutboxService,
        private readonly context: RequestContextService,
        private readonly cursors: AdministrationCursorService,
        private readonly confirmations: AdministrationConfirmationService,
        private readonly metrics: AdministrationMetricsService
    ) {}

    async grantRole(admin: AuthenticatedAdmin, body: CreateRoleGrantDto, key: string): Promise<object> {
        if (body.subjectUserId === admin.actorId) throw administrationError('CAPABILITY_REQUIRED', 403);
        const validUntil = body.validUntil === undefined ? null : new Date(body.validUntil);
        const reviewAt = new Date(body.reviewAt);
        const grantId = uuidV7();
        return this.mutate(
            admin,
            key,
            '/admin/role-grants',
            body,
            'PLATFORM_ROLE_GRANT',
            grantId,
            async (tx, operationId) => {
                const now = this.clock.now();
                if (body.expectedRevision !== 0 || reviewAt <= now || (validUntil !== null && validUntil <= now))
                    throw administrationError('VALIDATION_FAILED', 400);
                const approver = await tx.platformRoleGrant.findFirst({
                    where: {
                        role: PlatformRole.SUPERADMIN,
                        subjectUserId: { notIn: [admin.actorId, body.subjectUserId] },
                        revokedAt: null,
                        validFrom: { lte: now },
                        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
                    },
                    orderBy: { createdAt: 'asc' },
                });
                if (approver === null) throw administrationError('ADMIN_WRITE_UNAVAILABLE', 503);
                const grant = await tx.platformRoleGrant.create({
                    data: {
                        id: grantId,
                        subjectUserId: body.subjectUserId,
                        role: body.role,
                        grantedByUserId: admin.actorId,
                        approvedByUserId: approver.subjectUserId,
                        reasonCode: body.reasonCode,
                        policyVersion: body.policyVersion,
                        approvalReference: body.approvalReference,
                        validUntil,
                        reviewAt,
                    },
                });
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'ROLE_GRANT_CREATED',
                    'PLATFORM_ROLE_GRANT',
                    grantId,
                    body,
                    ['role', 'validUntil', 'reviewAt']
                );
                return { response: this.roleGrant(grant), auditId };
            },
            () => this.confirmations.consume(body.confirmationToken, admin.actorId, 'ROLE_GRANT', body.subjectUserId)
        );
    }

    async revokeRole(admin: AuthenticatedAdmin, grantId: string, body: RevokeDto, key: string): Promise<object> {
        return this.mutate(
            admin,
            key,
            `/admin/role-grants/${grantId}/revoke`,
            body,
            'PLATFORM_ROLE_GRANT',
            grantId,
            async (tx, operationId) => {
                const changed = await tx.platformRoleGrant.updateMany({
                    where: {
                        id: grantId,
                        revision: body.expectedRevision,
                        revokedAt: null,
                        subjectUserId: { not: admin.actorId },
                    },
                    data: {
                        revokedAt: this.clock.now(),
                        revokedByUserId: admin.actorId,
                        revokeReasonCode: body.reasonCode,
                        revision: { increment: 1 },
                        updatedAt: this.clock.now(),
                    },
                });
                if (changed.count !== 1) await this.throwRevisionOrNotFound(tx, 'platformRoleGrant', grantId);
                const grant = await tx.platformRoleGrant.findUniqueOrThrow({ where: { id: grantId } });
                await tx.adminSession.updateMany({
                    where: { roleGrantId: grantId, revokedAt: null },
                    data: { revokedAt: this.clock.now(), revokeReasonCode: 'ROLE_REVOKED' },
                });
                await tx.user.update({ where: { id: grant.subjectUserId }, data: { authEpoch: { increment: 1 } } });
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'ROLE_GRANT_REVOKED',
                    'PLATFORM_ROLE_GRANT',
                    grantId,
                    body,
                    ['revokedAt', 'revision', 'sessions', 'securityEpoch']
                );
                return { response: this.roleGrant(grant), auditId };
            },
            () => this.confirmations.consume(body.confirmationToken, admin.actorId, 'ROLE_REVOKE', grantId)
        );
    }

    async lookupUser(_admin: AuthenticatedAdmin, body: UserLookupDto): Promise<object> {
        const entries = Object.entries(body.key);
        if (entries.length !== 1) throw administrationError('VALIDATION_FAILED', 400);
        const [kind, raw] = entries[0] ?? [];
        if (typeof raw !== 'string' || raw.length === 0 || raw.length > 320)
            throw administrationError('VALIDATION_FAILED', 400);
        let userId: string | undefined;
        if (kind === 'userId') userId = raw;
        else if (kind === 'receiptId') {
            userId =
                (await this.prisma.safetySignal.findUnique({ where: { id: raw }, select: { reporterId: true } }))
                    ?.reporterId ?? undefined;
        } else if (kind === 'exactEmail' || kind === 'exactTelegramSubject') {
            const provider = kind === 'exactEmail' ? 'EMAIL' : 'TELEGRAM';
            const canonical = kind === 'exactEmail' ? raw.trim().toLowerCase() : raw.trim();
            userId = (
                await this.prisma.identity.findUnique({
                    where: {
                        provider_subjectKey: { provider, subjectKey: this.crypto.hash(`${provider}:${canonical}`) },
                    },
                    select: { userId: true },
                })
            )?.userId;
        } else throw administrationError('VALIDATION_FAILED', 400);
        if (userId === undefined) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
        const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { draft: true } });
        if (user === null) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
        const [profile, restrictions, identity] = await Promise.all([
            this.prisma.playerProfile.findUnique({ where: { userId }, select: { displayName: true } }),
            this.prisma.userRestriction.findMany({
                where: {
                    userId,
                    state: AdminRestrictionState.ACTIVE,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: this.clock.now() } }],
                },
                select: { scope: true },
            }),
            body.includeMaskedIdentity === true && body.purpose === AdminPurposeDto.SUPPORT
                ? this.prisma.identity.findFirst({ where: { userId }, select: { subjectCiphertext: true } })
                : Promise.resolve(null),
        ]);
        let maskedIdentity: string | null = null;
        if (identity !== null) maskedIdentity = this.mask(this.crypto.decrypt(identity.subjectCiphertext));
        return {
            userId,
            accountState: user.status,
            displayName: profile?.displayName ?? user.draft?.displayName ?? null,
            maskedIdentity,
            restrictionScopes: [...new Set(restrictions.map(({ scope }) => scope))],
        };
    }

    async listCases(admin: AuthenticatedAdmin, query: CaseQueryDto): Promise<object> {
        const bind = this.bind(admin, 'cases', query);
        const cursor = this.cursors.decode(query.cursor, 'admin-cases', bind);
        const snapshotAt = cursor?.snapshotAt ?? this.clock.now().toISOString();
        const assignment =
            query.assignment === 'ASSIGNED_TO_ME'
                ? { assignedModeratorId: admin.actorId }
                : query.assignment === 'UNASSIGNED'
                  ? { assignedModeratorId: null }
                  : query.assignment === 'ASSIGNED_TO_OTHER'
                    ? { assignedModeratorId: { not: null, notIn: [admin.actorId] } }
                    : {};
        const rows = await this.prisma.moderationCase.findMany({
            where: {
                createdAt: this.ageFilter(query.age, snapshotAt),
                ...(cursor === undefined ? {} : { id: { gt: cursor.lastId } }),
                ...(query.kind === undefined ? {} : { category: query.kind as never }),
                ...(query.state === undefined ? {} : { state: query.state as never }),
                ...(query.priority === undefined ? {} : { priority: query.priority as never }),
                ...assignment,
            },
            orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            take: query.limit + 1,
        });
        if (rows[0] !== undefined)
            this.metrics.observeOldestQueueItem(this.clock.now().getTime() - rows[0].createdAt.getTime());
        return this.page(rows, query.limit, snapshotAt, bind, 'admin-cases', (row) =>
            this.caseSummary(row, admin.actorId)
        );
    }

    async caseDetail(admin: AuthenticatedAdmin, caseId: string): Promise<object> {
        const moderationCase = await this.prisma.moderationCase.findUnique({
            where: { id: caseId },
            include: {
                signals: { include: { signal: { include: { evidence: true } } } },
                responses: true,
                decisions: { include: { appeals: true }, orderBy: { revision: 'desc' }, take: 1 },
            },
        });
        if (moderationCase === null) {
            await this.readAudit(admin, 'SAFETY_CASE_READ_DENIED', 'MODERATION_CASE', caseId, 'DENIED');
            throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
        }
        const assigned =
            admin.role === PlatformRole.MODERATOR &&
            moderationCase.assignedModeratorId === admin.actorId &&
            moderationCase.conflictDetectedAt === null;
        const breakGlass =
            admin.role === PlatformRole.SUPERADMIN &&
            (await this.prisma.breakGlassGrant.findFirst({
                where: { actorUserId: admin.actorId, caseId, revokedAt: null, expiresAt: { gt: this.clock.now() } },
            })) !== null;
        if (!assigned && !breakGlass) {
            await this.readAudit(admin, 'SAFETY_CASE_READ_DENIED', 'MODERATION_CASE', caseId, 'DENIED');
            throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
        }
        await this.readAudit(
            admin,
            breakGlass ? 'BREAK_GLASS_CASE_READ' : 'SAFETY_CASE_READ',
            'MODERATION_CASE',
            caseId
        );
        const narrative = moderationCase.signals
            .map(({ signal }) => signal.evidence)
            .find((evidence) => evidence !== null && evidence.cryptoshreddedAt === null);
        const latestDecision = moderationCase.decisions[0];
        return {
            summary: this.caseSummary(moderationCase, admin.actorId),
            sourceCount: moderationCase.signals.length,
            policyVersion: moderationCase.signals[0]?.signal.policyVersion ?? 'trust-safety-v1',
            restrictedNarrative:
                narrative === undefined || narrative === null
                    ? null
                    : this.safetyCrypto.decrypt(narrative.ciphertext, `safety-evidence:v1:${narrative.signalId}`),
            restrictedResponses: moderationCase.responses.map((response) =>
                this.safetyCrypto.decrypt(response.ciphertext, `safety-response:v1:${response.id}`)
            ),
            restrictedAppeal:
                latestDecision?.appeals[0]?.textCiphertext === null || latestDecision?.appeals[0] === undefined
                    ? null
                    : this.safetyCrypto.decrypt(
                          latestDecision.appeals[0].textCiphertext,
                          `safety-appeal:v1:${latestDecision.appeals[0].id}`
                      ),
        };
    }

    async assignCase(
        admin: AuthenticatedAdmin,
        caseId: string,
        assigneeId: string,
        body: RevokeDto,
        key: string
    ): Promise<object> {
        return this.mutate(
            admin,
            key,
            `/admin/cases/${caseId}/assignment`,
            { body, assigneeId },
            'MODERATION_CASE',
            caseId,
            async (tx, operationId) => {
                const activeModerator = await tx.platformRoleGrant.findFirst({
                    where: { subjectUserId: assigneeId, role: PlatformRole.MODERATOR, revokedAt: null },
                });
                if (activeModerator === null) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
                const changed = await tx.moderationCase.updateMany({
                    where: {
                        id: caseId,
                        revision: body.expectedRevision,
                        state: {
                            in: [ModerationCaseState.OPEN, ModerationCaseState.TRIAGED, ModerationCaseState.ASSIGNED],
                        },
                    },
                    data: {
                        assignedModeratorId: assigneeId,
                        state: ModerationCaseState.ASSIGNED,
                        revision: { increment: 1 },
                        updatedAt: this.clock.now(),
                    },
                });
                if (changed.count !== 1) await this.throwRevisionOrNotFound(tx, 'moderationCase', caseId);
                const row = await tx.moderationCase.findUniqueOrThrow({ where: { id: caseId } });
                await this.event(tx, 'safety.case.status.changed.v1', 'caseId', caseId);
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'SAFETY_CASE_ASSIGNED',
                    'MODERATION_CASE',
                    caseId,
                    body,
                    ['assignedModeratorId', 'state', 'revision']
                );
                return { response: this.caseSummary(row, admin.actorId), auditId };
            }
        );
    }

    async decideCase(admin: AuthenticatedAdmin, caseId: string, body: DecideCaseDto, key: string): Promise<object> {
        return this.mutate(
            admin,
            key,
            `/admin/cases/${caseId}/decision`,
            body,
            'MODERATION_CASE',
            caseId,
            async (tx, operationId) => {
                const moderationCase = await tx.moderationCase.findUnique({
                    where: { id: caseId },
                    include: { signals: { include: { signal: true } } },
                });
                if (moderationCase === null) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
                if (
                    moderationCase.assignedModeratorId !== admin.actorId ||
                    moderationCase.conflictDetectedAt !== null ||
                    (moderationCase.state !== ModerationCaseState.ASSIGNED &&
                        moderationCase.state !== ModerationCaseState.INVESTIGATING) ||
                    moderationCase.revision !== body.expectedRevision
                )
                    throw administrationError('REVISION_CONFLICT', 409);
                const decisionId = uuidV7();
                const previous = await tx.moderationDecision.findFirst({
                    where: { caseId },
                    orderBy: { revision: 'desc' },
                });
                await tx.moderationDecision.create({
                    data: {
                        id: decisionId,
                        caseId,
                        revision: (previous?.revision ?? 0) + 1,
                        supersedesDecisionId: previous?.id ?? null,
                        reviewerId: admin.actorId,
                        outcome: body.outcome as ModerationDecisionOutcome,
                        policyCode: body.reasonCode,
                        policyVersion: body.policyVersion,
                        scopeCode: body.restrictionScope ?? 'NONE',
                        basisChecksum: this.crypto.hash(
                            `ADMIN_DECISION:${caseId}:${String(body.expectedRevision)}:${body.outcome}`
                        ),
                        expiresAt: body.restrictionExpiresAt === undefined ? null : new Date(body.restrictionExpiresAt),
                    },
                });
                const sourceSignal = moderationCase.signals[0]?.signal;
                if (sourceSignal === undefined) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
                if (body.outcome !== 'NO_VIOLATION') {
                    const decisionRevision = (previous?.revision ?? 0) + 1;
                    await tx.moderationEffect.create({
                        data: {
                            id: uuidV7(),
                            decisionId,
                            kind: body.outcome as ModerationDecisionOutcome,
                            logicalKey: this.crypto.hash(
                                `ADMIN_EFFECT:${caseId}:${body.outcome}:${String(decisionRevision)}`
                            ),
                            ownerReferenceId: sourceSignal.id,
                            sourceRevision: BigInt(decisionRevision),
                        },
                    });
                }
                await tx.moderationCase.update({
                    where: { id: caseId },
                    data: {
                        state: ModerationCaseState.DECIDED,
                        revision: { increment: 1 },
                        updatedAt: this.clock.now(),
                    },
                });
                await tx.safetySignal.updateMany({
                    where: { caseLink: { caseId } },
                    data: {
                        state: 'RESOLVED',
                        version: { increment: 1 },
                        resolvedAt: this.clock.now(),
                        updatedAt: this.clock.now(),
                    },
                });
                await this.event(tx, 'safety.decision.recorded.v1', 'decisionId', decisionId);
                if (body.outcome !== 'NO_VIOLATION')
                    await this.event(tx, 'safety.effect.requested.v1', 'decisionId', decisionId);
                const row = await tx.moderationCase.findUniqueOrThrow({ where: { id: caseId } });
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'SAFETY_CASE_DECIDED',
                    'MODERATION_CASE',
                    caseId,
                    body,
                    ['state', 'decisionRevision']
                );
                return { response: this.caseSummary(row, admin.actorId), auditId };
            }
        );
    }

    async createRestriction(
        admin: AuthenticatedAdmin,
        userId: string,
        body: ChangeRestrictionDto,
        key: string
    ): Promise<object> {
        const needsConfirmation = body.scope === 'PLATFORM_ACCESS' || body.expiresAt === undefined;
        const restrictionId = uuidV7();
        return this.mutate(
            admin,
            key,
            `/admin/users/${userId}/restrictions`,
            body,
            'USER_RESTRICTION',
            restrictionId,
            async (tx, operationId) => {
                if (
                    body.expectedRevision !== 0 ||
                    (body.expiresAt !== undefined && new Date(body.expiresAt) <= this.clock.now())
                )
                    throw administrationError('VALIDATION_FAILED', 400);
                const decision = await tx.moderationDecision.findUnique({
                    where: { id: body.decisionId },
                    include: { case: { include: { signals: { include: { signal: true } } } } },
                });
                if (
                    decision === null ||
                    decision.reviewerId !== admin.actorId ||
                    !decision.case.signals.some(({ signal }) => signal.subjectId === userId)
                )
                    throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
                const restriction = await tx.userRestriction.create({
                    data: {
                        id: restrictionId,
                        userId,
                        decisionId: body.decisionId,
                        scope: body.scope as AdminRestrictionScope,
                        reasonCode: body.reasonCode,
                        policyVersion: body.policyVersion,
                        createdByUserId: admin.actorId,
                        expiresAt: body.expiresAt === undefined ? null : new Date(body.expiresAt),
                    },
                });
                if (body.scope === 'PLATFORM_ACCESS') {
                    await tx.user.update({ where: { id: userId }, data: { authEpoch: { increment: 1 } } });
                    await tx.session.updateMany({
                        where: { userId, revokedAt: null },
                        data: { revokedAt: this.clock.now() },
                    });
                }
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'USER_RESTRICTION_CREATED',
                    'USER_RESTRICTION',
                    restrictionId,
                    body,
                    ['scope', 'state', 'expiresAt']
                );
                return { response: this.restriction(restriction), auditId };
            },
            needsConfirmation
                ? () => this.confirmations.consume(body.confirmationToken, admin.actorId, 'USER_RESTRICT', userId)
                : undefined
        );
    }

    async revokeRestriction(
        admin: AuthenticatedAdmin,
        userId: string,
        restrictionId: string,
        body: RevokeDto,
        key: string
    ): Promise<object> {
        return this.mutate(
            admin,
            key,
            `/admin/users/${userId}/restrictions/${restrictionId}/revoke`,
            body,
            'USER_RESTRICTION',
            restrictionId,
            async (tx, operationId) => {
                const changed = await tx.userRestriction.updateMany({
                    where: {
                        id: restrictionId,
                        userId,
                        revision: body.expectedRevision,
                        state: AdminRestrictionState.ACTIVE,
                    },
                    data: {
                        state: AdminRestrictionState.REVOKED,
                        revokedAt: this.clock.now(),
                        revokedByUserId: admin.actorId,
                        revokeReasonCode: body.reasonCode,
                        revision: { increment: 1 },
                        updatedAt: this.clock.now(),
                    },
                });
                if (changed.count !== 1) await this.throwRevisionOrNotFound(tx, 'userRestriction', restrictionId);
                const restriction = await tx.userRestriction.findUniqueOrThrow({ where: { id: restrictionId } });
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'USER_RESTRICTION_REVOKED',
                    'USER_RESTRICTION',
                    restrictionId,
                    body,
                    ['state', 'revokedAt', 'revision']
                );
                return { response: this.restriction(restriction), auditId };
            }
        );
    }

    async listVenues(admin: AuthenticatedAdmin, query: VenueQueryDto): Promise<object> {
        const bind = this.bind(admin, 'venues', query);
        const cursor = this.cursors.decode(query.cursor, 'admin-venues', bind);
        const snapshotAt = cursor?.snapshotAt ?? this.clock.now().toISOString();
        if (query.kind !== undefined && query.kind !== 'CANDIDATE') {
            return this.page([], query.limit, snapshotAt, bind, 'admin-venues', () => ({}));
        }
        if (
            query.state !== undefined &&
            !Object.values(VenueCandidateState).includes(query.state as VenueCandidateState)
        ) {
            return this.page([], query.limit, snapshotAt, bind, 'admin-venues', () => ({}));
        }
        const sourceKind =
            query.sourceClass === 'OSM'
                ? VenueSourceKind.OPENSTREETMAP
                : query.sourceClass === 'PROVIDER'
                  ? VenueSourceKind.GEOCODER
                  : query.sourceClass === 'PLAYER'
                    ? VenueSourceKind.COMMUNITY
                    : undefined;
        const rows = await this.prisma.venueCandidate.findMany({
            where: {
                createdAt: this.ageFilter(query.age, snapshotAt),
                ...(cursor === undefined ? {} : { id: { gt: cursor.lastId } }),
                ...(query.state === undefined ? {} : { state: query.state as never }),
                ...(query.locality === undefined ? {} : { locality: query.locality }),
                ...(sourceKind === undefined ? {} : { sources: { some: { kind: sourceKind } } }),
            },
            include: { sources: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: query.limit + 1,
        });
        if (rows[0] !== undefined)
            this.metrics.observeOldestQueueItem(this.clock.now().getTime() - rows[0].createdAt.getTime());
        return this.page(rows, query.limit, snapshotAt, bind, 'admin-venues', (row) => this.venueSummary(row));
    }

    async venueDetail(itemId: string): Promise<object> {
        const candidate = await this.prisma.venueCandidate.findUnique({
            where: { id: itemId },
            include: { sources: true },
        });
        if (candidate === null) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
        const nearby = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM venues
            WHERE publication_state = 'PUBLISHED'
              AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${candidate.longitude}, ${candidate.latitude}), 4326)::geography, 500)
            ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint(${candidate.longitude}, ${candidate.latitude}), 4326)::geography), id
            LIMIT 20`);
        return {
            item: this.venueSummary(candidate),
            name: candidate.name,
            normalizedAddress: candidate.normalizedAddress,
            longitude: Number(candidate.longitude),
            latitude: Number(candidate.latitude),
            provenance: candidate.sources.slice(0, 20).map((source) => source.attributionText),
            nearbyPublishedVenueIds: nearby.map(({ id }) => id),
        };
    }

    async decideVenue(admin: AuthenticatedAdmin, itemId: string, body: DecideVenueDto, key: string): Promise<object> {
        return this.mutate(
            admin,
            key,
            `/admin/venue-candidates/${itemId}/decision`,
            body,
            'VENUE_CANDIDATE',
            itemId,
            async (tx, operationId) => {
                const candidate = await tx.venueCandidate.findUnique({
                    where: { id: itemId },
                    include: { sources: true },
                });
                if (candidate === null) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
                if (candidate.state !== VenueCandidateState.PENDING_REVIEW || body.expectedRevision !== 0)
                    throw administrationError('REVISION_CONFLICT', 409);
                let canonicalVenueId: string | null = null;
                if (body.decision === 'APPROVE') {
                    canonicalVenueId = uuidV7();
                    await tx.venue.create({
                        data: {
                            id: canonicalVenueId,
                            name: candidate.name,
                            normalizedAddress: candidate.normalizedAddress,
                            locality: candidate.locality,
                            timeZone: candidate.timeZone,
                            longitude: candidate.longitude,
                            latitude: candidate.latitude,
                            verificationState: VenueVerificationState.MODERATOR_VERIFIED,
                            publicationState: VenuePublicationState.PUBLISHED,
                            lastVerifiedAt: this.clock.now(),
                        },
                    });
                    await tx.venueSource.updateMany({
                        where: { candidateId: itemId },
                        data: { candidateId: null, venueId: canonicalVenueId },
                    });
                }
                await tx.venueCandidate.update({
                    where: { id: itemId },
                    data: {
                        state:
                            body.decision === 'APPROVE' ? VenueCandidateState.APPROVED : VenueCandidateState.REJECTED,
                        canonicalVenueId,
                        decidedAt: this.clock.now(),
                    },
                });
                await tx.venueModerationDecision.create({
                    data: {
                        id: uuidV7(),
                        subject: VenueModerationSubject.CANDIDATE,
                        candidateId: itemId,
                        venueId: canonicalVenueId,
                        moderatorId: admin.actorId,
                        outcome:
                            body.decision === 'APPROVE'
                                ? VenueModerationOutcome.APPROVED
                                : VenueModerationOutcome.REJECTED,
                        reasonCode: body.reasonCode,
                    },
                });
                await this.event(tx, 'venue.moderation.decided.v1', 'candidateId', itemId);
                const updated = await tx.venueCandidate.findUniqueOrThrow({
                    where: { id: itemId },
                    include: { sources: true },
                });
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'VENUE_CANDIDATE_DECIDED',
                    'VENUE_CANDIDATE',
                    itemId,
                    body,
                    ['state', 'canonicalVenueId']
                );
                return { response: this.venueSummary(updated), auditId };
            }
        );
    }

    async mergeVenue(admin: AuthenticatedAdmin, itemId: string, body: MergeVenueDto, key: string): Promise<object> {
        if (body.survivorVenueId === body.duplicateVenueId) throw administrationError('VALIDATION_FAILED', 400);
        return this.mutate(
            admin,
            key,
            `/admin/venue-candidates/${itemId}/merge`,
            body,
            'VENUE_CANDIDATE',
            itemId,
            async (tx, operationId) => {
                const candidate = await tx.venueCandidate.findUnique({
                    where: { id: itemId },
                    include: { sources: true },
                });
                if (candidate === null) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
                if (candidate.state !== VenueCandidateState.PENDING_REVIEW || body.expectedRevision !== 0)
                    throw administrationError('REVISION_CONFLICT', 409);
                const venues = await tx.venue.findMany({
                    where: { id: { in: [body.survivorVenueId, body.duplicateVenueId] } },
                });
                if (venues.length !== 2) throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
                const decisionId = uuidV7();
                await tx.venueModerationDecision.create({
                    data: {
                        id: decisionId,
                        subject: VenueModerationSubject.CANDIDATE,
                        candidateId: itemId,
                        venueId: body.survivorVenueId,
                        moderatorId: admin.actorId,
                        outcome: VenueModerationOutcome.MERGED,
                        reasonCode: body.reasonCode,
                    },
                });
                await tx.venue.update({
                    where: { id: body.duplicateVenueId },
                    data: {
                        canonicalVenueId: body.survivorVenueId,
                        publicationState: VenuePublicationState.MERGED,
                        version: { increment: 1 },
                    },
                });
                await tx.venueMerge.create({
                    data: {
                        id: uuidV7(),
                        previousVenueId: body.duplicateVenueId,
                        canonicalVenueId: body.survivorVenueId,
                        decisionId,
                        reasonCode: body.reasonCode,
                    },
                });
                await tx.venueCandidate.update({
                    where: { id: itemId },
                    data: {
                        state: VenueCandidateState.MERGED,
                        canonicalVenueId: body.survivorVenueId,
                        decidedAt: this.clock.now(),
                    },
                });
                await this.event(tx, 'venue.moderation.decided.v1', 'candidateId', itemId);
                const updated = await tx.venueCandidate.findUniqueOrThrow({
                    where: { id: itemId },
                    include: { sources: true },
                });
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'VENUE_CANDIDATE_MERGED',
                    'VENUE_CANDIDATE',
                    itemId,
                    body,
                    ['state', 'canonicalVenueId', 'duplicateCanonicalVenueId']
                );
                return { response: this.venueSummary(updated), auditId };
            },
            () => this.confirmations.consume(body.confirmationToken, admin.actorId, 'VENUE_MERGE', itemId)
        );
    }

    async searchAudit(admin: AuthenticatedAdmin, query: AuditQueryDto): Promise<object> {
        const from = new Date(query.from);
        const to = new Date(query.to);
        if (to <= from || to.getTime() - from.getTime() > 31 * 86_400_000)
            throw administrationError('INVALID_TIME_RANGE', 400);
        const bind = this.bind(admin, 'audit', query);
        const cursor = this.cursors.decode(query.cursor, 'admin-audit', bind);
        const snapshotAt = cursor?.snapshotAt ?? this.clock.now().toISOString();
        const rows = await this.prisma.auditEntry.findMany({
            where: {
                createdAt: { gte: from, lte: new Date(Math.min(to.getTime(), new Date(snapshotAt).getTime())) },
                targetId: query.targetId ?? { not: null },
                ...(cursor === undefined ? {} : { id: { gt: cursor.lastId } }),
                ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
                ...(query.action === undefined ? {} : { action: query.action }),
                ...(query.targetType === undefined ? {} : { targetType: query.targetType }),
                ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
                ...(query.requestId === undefined ? {} : { requestId: query.requestId }),
                ...(query.correlationId === undefined ? {} : { correlationId: query.correlationId }),
                ...(admin.role === PlatformRole.MODERATOR
                    ? { OR: [{ actorId: admin.actorId }, { targetType: 'MODERATION_CASE' }] }
                    : {}),
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: query.limit + 1,
        });
        await this.prisma.$transaction(async (tx) => {
            await this.adminAudit(
                tx,
                uuidV7(),
                admin,
                'AUDIT_SEARCHED',
                'AUDIT_ENTRY',
                uuidV7(),
                { reasonCode: 'ACCESS_REVIEW', policyVersion: 'admin-v1' },
                []
            );
        });
        return this.page(rows, query.limit, snapshotAt, bind, 'admin-audit', (row) => ({
            auditEntryId: row.id,
            operationId: row.operationId ?? row.id,
            actorType: row.actorType === 'SYSTEM' ? 'SYSTEM' : 'ADMIN',
            actorId: row.actorId,
            action: row.action.toUpperCase().replaceAll('.', '_'),
            targetType: row.targetType,
            targetId: row.targetId,
            outcome: row.outcome,
            reasonCode: row.reasonCode ?? 'ACCESS_REVIEW',
            policyVersion: row.policyVersion ?? 'legacy',
            changedFields: row.changedFields,
            requestId: row.requestId,
            correlationId: row.correlationId,
            source: row.source.toUpperCase().replaceAll('-', '_'),
            createdAt: row.createdAt.toISOString(),
        }));
    }

    async createBreakGlass(admin: AuthenticatedAdmin, body: CreateBreakGlassDto, key: string): Promise<object> {
        const expiresAt = new Date(body.expiresAt);
        const grantId = uuidV7();
        return this.mutate(
            admin,
            key,
            '/admin/break-glass-grants',
            body,
            'BREAK_GLASS_GRANT',
            grantId,
            async (tx, operationId) => {
                if (expiresAt <= this.clock.now() || expiresAt.getTime() - this.clock.now().getTime() > 30 * 60_000)
                    throw administrationError('VALIDATION_FAILED', 400);
                if ((await tx.moderationCase.findUnique({ where: { id: body.caseId } })) === null)
                    throw administrationError('ADMIN_RESOURCE_NOT_FOUND', 404);
                const grant = await tx.breakGlassGrant.create({
                    data: {
                        id: grantId,
                        actorUserId: admin.actorId,
                        caseId: body.caseId,
                        incidentReference: body.incidentReference,
                        reasonCode: body.reasonCode,
                        policyVersion: body.policyVersion,
                        justificationCiphertext: this.crypto.encrypt(body.justification),
                        encryptionKeyVersion: 1,
                        expiresAt,
                    },
                });
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'BREAK_GLASS_GRANTED',
                    'BREAK_GLASS_GRANT',
                    grantId,
                    body,
                    ['caseId', 'expiresAt']
                );
                return { response: this.breakGlass(grant), auditId };
            },
            () => this.confirmations.consume(body.confirmationToken, admin.actorId, 'BREAK_GLASS', body.caseId)
        );
    }

    async revokeBreakGlass(admin: AuthenticatedAdmin, grantId: string, body: RevokeDto, key: string): Promise<object> {
        return this.mutate(
            admin,
            key,
            `/admin/break-glass-grants/${grantId}/revoke`,
            body,
            'BREAK_GLASS_GRANT',
            grantId,
            async (tx, operationId) => {
                const changed = await tx.breakGlassGrant.updateMany({
                    where: { id: grantId, revision: body.expectedRevision, revokedAt: null },
                    data: {
                        revokedAt: this.clock.now(),
                        revokedByUserId: admin.actorId,
                        revokeReasonCode: body.reasonCode,
                        revision: { increment: 1 },
                    },
                });
                if (changed.count !== 1) await this.throwRevisionOrNotFound(tx, 'breakGlassGrant', grantId);
                const grant = await tx.breakGlassGrant.findUniqueOrThrow({ where: { id: grantId } });
                const auditId = await this.adminAudit(
                    tx,
                    operationId,
                    admin,
                    'BREAK_GLASS_REVOKED',
                    'BREAK_GLASS_GRANT',
                    grantId,
                    body,
                    ['revokedAt', 'revision']
                );
                return { response: this.breakGlass(grant), auditId };
            }
        );
    }

    private async mutate(
        admin: AuthenticatedAdmin,
        key: string,
        path: string,
        body: object,
        targetType: string,
        targetId: string,
        callback: (tx: Transaction, operationId: string) => Promise<MutationResult>,
        beforeFirstAttempt?: () => Promise<void>
    ): Promise<object> {
        const fingerprint = this.crypto.hash(JSON.stringify(body));
        const existing = await this.prisma.adminOperationReceipt.findUnique({
            where: {
                actorUserId_method_canonicalPath_idempotencyKey: {
                    actorUserId: admin.actorId,
                    method: 'POST',
                    canonicalPath: path,
                    idempotencyKey: key,
                },
            },
        });
        if (existing !== null) {
            if (existing.requestFingerprint !== fingerprint) throw administrationError('IDEMPOTENCY_KEY_REUSED', 409);
            this.metrics.increment('admin_idempotency_replayed_total', { target: targetType });
            return JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as object;
        }
        await beforeFirstAttempt?.();
        try {
            return await this.prisma.$transaction(
                async (tx) => {
                    const operationId = uuidV7();
                    const result = await callback(tx, operationId);
                    await tx.adminOperationReceipt.create({
                        data: {
                            id: uuidV7(),
                            actorUserId: admin.actorId,
                            idempotencyKey: key,
                            method: 'POST',
                            canonicalPath: path,
                            requestFingerprint: fingerprint,
                            targetType,
                            targetId,
                            expectedRevision: 'expectedRevision' in body ? Number(body.expectedRevision) : 0,
                            responseStatus: 200,
                            responseCiphertext: this.crypto.encrypt(JSON.stringify(result.response)),
                            encryptionKeyVersion: 1,
                            auditEntryId: result.auditId,
                        },
                    });
                    return result.response;
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            );
        } catch (error) {
            if (error instanceof AdministrationException) throw error;
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                throw administrationError('CONFLICTING_ACTIVE_GRANT', 409);
            this.metrics.auditFailed();
            throw administrationError('AUDIT_UNAVAILABLE', 503);
        }
    }

    private async adminAudit(
        tx: Transaction,
        operationId: string,
        admin: AuthenticatedAdmin,
        action: string,
        targetType: string,
        targetId: string,
        body: { reasonCode: string; policyVersion: string },
        names: string[]
    ): Promise<string> {
        const requestId = this.context.get()?.requestId ?? uuidV7();
        return this.audit.append(tx, {
            operationId,
            actorType: 'ADMIN',
            actorId: admin.actorId,
            action,
            targetType,
            targetId,
            outcome: 'SUCCEEDED',
            reasonCode: body.reasonCode,
            policyVersion: body.policyVersion,
            changedFields: { names },
            requestId,
            correlationId: this.context.get()?.correlationId ?? requestId,
            source: 'administration',
        });
    }

    private async readAudit(
        admin: AuthenticatedAdmin,
        action: string,
        targetType: string,
        targetId: string,
        outcome = 'SUCCEEDED'
    ): Promise<void> {
        try {
            await this.prisma.$transaction(async (tx) => {
                const requestId = this.context.get()?.requestId ?? uuidV7();
                await this.audit.append(tx, {
                    operationId: uuidV7(),
                    actorType: 'ADMIN',
                    actorId: admin.actorId,
                    action,
                    targetType,
                    targetId,
                    outcome,
                    reasonCode: 'ACCESS_REVIEW',
                    policyVersion: 'admin-v1',
                    changedFields: { names: [] },
                    requestId,
                    correlationId: this.context.get()?.correlationId ?? requestId,
                    source: 'administration',
                });
            });
        } catch {
            this.metrics.auditFailed();
            throw administrationError('AUDIT_UNAVAILABLE', 503);
        }
    }

    private async event(tx: Transaction, type: string, field: string, id: string): Promise<void> {
        const requestId = this.context.get()?.correlationId ?? uuidV7();
        await this.outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: this.clock.now().toISOString(),
                correlationId: requestId,
                causationId: null,
                data: { [field]: id },
            },
            correlationId: requestId,
            occurredAt: this.clock.now(),
        });
    }

    private async throwRevisionOrNotFound(
        tx: Transaction,
        model: 'platformRoleGrant' | 'moderationCase' | 'userRestriction' | 'breakGlassGrant',
        id: string
    ): Promise<never> {
        const found =
            model === 'platformRoleGrant'
                ? await tx.platformRoleGrant.findUnique({ where: { id } })
                : model === 'moderationCase'
                  ? await tx.moderationCase.findUnique({ where: { id } })
                  : model === 'userRestriction'
                    ? await tx.userRestriction.findUnique({ where: { id } })
                    : await tx.breakGlassGrant.findUnique({ where: { id } });
        throw administrationError(
            found === null ? 'ADMIN_RESOURCE_NOT_FOUND' : 'REVISION_CONFLICT',
            found === null ? 404 : 409
        );
    }

    private page<T extends { id: string }>(
        rows: T[],
        limit: number,
        snapshotAt: string,
        bind: string,
        type: string,
        map: (row: T) => object
    ): object {
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return {
            items: items.map(map),
            pageInfo: {
                hasMore: rows.length > limit,
                nextCursor:
                    rows.length > limit && last !== undefined
                        ? this.cursors.encode(type, bind, snapshotAt, last.id)
                        : null,
            },
            snapshotAt,
        };
    }

    private bind(admin: AuthenticatedAdmin, type: string, query: object): string {
        const copy = { ...query } as Record<string, unknown>;
        delete copy.cursor;
        return this.crypto.hash(JSON.stringify({ actorId: admin.actorId, role: admin.role, type, query: copy }));
    }

    private ageFilter(age: string | undefined, snapshotAt: string): Prisma.DateTimeFilter {
        const snapshot = new Date(snapshotAt);
        const hour = 3_600_000;
        const day = 24 * hour;
        if (age === 'LT_1_HOUR') return { lte: snapshot, gt: new Date(snapshot.getTime() - hour) };
        if (age === 'H1_24')
            return { lte: new Date(snapshot.getTime() - hour), gt: new Date(snapshot.getTime() - day) };
        if (age === 'D1_7')
            return { lte: new Date(snapshot.getTime() - day), gt: new Date(snapshot.getTime() - 7 * day) };
        if (age === 'D8_30')
            return { lte: new Date(snapshot.getTime() - 7 * day), gt: new Date(snapshot.getTime() - 30 * day) };
        if (age === 'GT_30_DAYS') return { lte: new Date(snapshot.getTime() - 30 * day) };
        return { lte: snapshot };
    }

    private caseSummary(
        row: {
            id: string;
            category: string;
            state: string;
            priority: string;
            assignedModeratorId: string | null;
            createdAt: Date;
            revision: number;
        },
        actorId: string
    ): object {
        return {
            caseId: row.id,
            kind: row.category,
            state: row.state,
            priority: row.priority,
            assignmentState:
                row.assignedModeratorId === null
                    ? 'UNASSIGNED'
                    : row.assignedModeratorId === actorId
                      ? 'ASSIGNED_TO_ME'
                      : 'ASSIGNED_TO_OTHER',
            actionableAt: row.createdAt.toISOString(),
            revision: row.revision,
        };
    }

    private venueSummary(row: {
        id: string;
        state: string;
        locality: string;
        createdAt: Date;
        sources: { kind: string }[];
    }): object {
        const age = this.clock.now().getTime() - row.createdAt.getTime();
        return {
            itemId: row.id,
            kind: 'CANDIDATE',
            state: row.state,
            sourceClass: row.sources.some(({ kind }) => kind === VenueSourceKind.OPENSTREETMAP)
                ? 'OSM'
                : row.sources.some(({ kind }) => kind === VenueSourceKind.GEOCODER)
                  ? 'PROVIDER'
                  : 'PLAYER',
            locality: row.locality,
            ageBucket:
                age < 3_600_000
                    ? 'LT_1_HOUR'
                    : age < 86_400_000
                      ? 'H1_24'
                      : age < 7 * 86_400_000
                        ? 'D1_7'
                        : age < 30 * 86_400_000
                          ? 'D8_30'
                          : 'GT_30_DAYS',
            revision: 0,
            createdAt: row.createdAt.toISOString(),
        };
    }

    private roleGrant(grant: {
        id: string;
        subjectUserId: string;
        role: PlatformRole;
        revision: number;
        validUntil: Date | null;
        reviewAt: Date;
        revokedAt: Date | null;
    }): object {
        return {
            grantId: grant.id,
            subjectUserId: grant.subjectUserId,
            role: grant.role,
            revision: grant.revision,
            validUntil: grant.validUntil?.toISOString() ?? null,
            reviewAt: grant.reviewAt.toISOString(),
            revokedAt: grant.revokedAt?.toISOString() ?? null,
        };
    }

    private restriction(row: {
        id: string;
        userId: string;
        decisionId: string;
        scope: AdminRestrictionScope;
        state: AdminRestrictionState;
        revision: number;
        expiresAt: Date | null;
        createdAt: Date;
        revokedAt: Date | null;
    }): object {
        return {
            restrictionId: row.id,
            userId: row.userId,
            decisionId: row.decisionId,
            scope: row.scope,
            state: row.state,
            revision: row.revision,
            expiresAt: row.expiresAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
            revokedAt: row.revokedAt?.toISOString() ?? null,
        };
    }

    private breakGlass(row: {
        id: string;
        caseId: string;
        incidentReference: string;
        expiresAt: Date;
        revokedAt: Date | null;
        revision: number;
    }): object {
        return {
            grantId: row.id,
            caseId: row.caseId,
            incidentReference: row.incidentReference,
            expiresAt: row.expiresAt.toISOString(),
            revokedAt: row.revokedAt?.toISOString() ?? null,
            revision: row.revision,
        };
    }

    private mask(value: string): string {
        if (value.includes('@')) {
            const [local = '', domain = ''] = value.split('@');
            return `${local.slice(0, 1)}***@${domain}`;
        }
        return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }
}
