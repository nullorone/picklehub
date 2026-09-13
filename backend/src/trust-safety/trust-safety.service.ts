import { Inject, Injectable } from '@nestjs/common';
import {
    MatchParticipantState,
    MatchState,
    Prisma,
    SafetyReportSourceKind,
    SafetyReviewRevisionKind,
    SafetyReviewState,
    SafetySignalKind,
    SafetySignalState,
} from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { Clock } from '../identity/clock';
import { OutboxService } from '../outbox/outbox.service';
import { TrustSafetyCryptoService } from './trust-safety-crypto.service';
import { TrustSafetyCursorService } from './trust-safety-cursor.service';
import {
    ContentReasonDto,
    ReportKindDto,
    ReportSourceKindDto,
    ResultReasonDto,
    SafetyReasonDto,
    VenueReasonDto,
    type AppealDto,
    type CaseResponseDto,
    type NoShowSubmissionDto,
    type ReportSubmissionDto,
    type ReviewSubmissionDto,
} from './trust-safety.dto';
import { trustSafetyError } from './trust-safety.errors';
import { TrustSafetyMetricsService } from './trust-safety-metrics.service';

type Transaction = Prisma.TransactionClient;
const REVIEW_WINDOW_MS = 14 * 86_400_000;
const NO_SHOW_DELAY_MS = 30 * 60_000;
const NO_SHOW_WINDOW_MS = 7 * 86_400_000;
const REPORT_WINDOW_MS = 90 * 86_400_000;
const APPEAL_WINDOW_MS = 14 * 86_400_000;

@Injectable()
export class TrustSafetyService {
    private readonly policyVersion: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly clock: Clock,
        private readonly crypto: TrustSafetyCryptoService,
        private readonly cursors: TrustSafetyCursorService,
        private readonly outbox: OutboxService,
        private readonly audit: AuditService,
        private readonly context: RequestContextService,
        private readonly metrics: TrustSafetyMetricsService,
        @Inject(ENVIRONMENT) environment: Environment
    ) {
        this.policyVersion = environment.SAFETY_POLICY_VERSION;
    }

    async submitReview(
        authorId: string,
        matchId: string,
        subjectId: string,
        body: ReviewSubmissionDto,
        tx: Transaction
    ): Promise<object> {
        const marker = await this.reviewEligibility(tx, authorId, matchId, subjectId);
        const editableUntil = new Date(marker.confirmedAt.getTime() + REVIEW_WINDOW_MS);
        if (this.clock.now() > editableUntil) throw trustSafetyError('SUBMISSION_WINDOW_CLOSED', 400);
        const current = await tx.review.findUnique({
            where: { authorId_subjectId_matchId: { authorId, subjectId, matchId } },
        });
        const reviewId = current?.id ?? uuidV7();
        const revision = (current?.currentRevision ?? 0) + 1;
        const normalizedTags = [...new Set(body.tags)].sort();
        const checksum = this.crypto.hash(
            JSON.stringify({ experienceRating: body.experienceRating, tags: normalizedTags, text: body.text ?? null })
        );
        if (current === null) {
            await tx.review.create({
                data: {
                    id: reviewId,
                    authorId,
                    subjectId,
                    matchId,
                    currentRevision: revision,
                    eligibilityRevision: marker.revision,
                    policyVersion: this.policyVersion,
                    editableUntil,
                    createdAt: this.clock.now(),
                    updatedAt: this.clock.now(),
                },
            });
        } else {
            await tx.review.update({
                where: { id: reviewId },
                data: {
                    state: SafetyReviewState.ACTIVE,
                    currentRevision: revision,
                    updatedAt: this.clock.now(),
                },
            });
        }
        await tx.reviewRevision.create({
            data: {
                reviewId,
                revision,
                kind: SafetyReviewRevisionKind.SUBMITTED,
                experienceRating: body.experienceRating,
                tags: normalizedTags,
                textCiphertext:
                    body.text === undefined ? null : this.crypto.encrypt(body.text, this.reviewAad(reviewId, revision)),
                encryptionKeyVersion: body.text === undefined ? null : 1,
                payloadChecksum: checksum,
                createdAt: this.clock.now(),
            },
        });
        await this.projectReview(
            tx,
            reviewId,
            authorId,
            subjectId,
            matchId,
            revision,
            body.experienceRating,
            true,
            checksum
        );
        await this.auditEntry(
            tx,
            authorId,
            current === null ? 'safety.review.created' : 'safety.review.revised',
            'REVIEW',
            reviewId,
            ['state', 'revision']
        );
        await this.reviewEvent(tx, reviewId, revision);
        return this.ownReview(
            reviewId,
            matchId,
            subjectId,
            revision,
            body.experienceRating,
            normalizedTags,
            body.text ?? null,
            null,
            editableUntil
        );
    }

    async withdrawReview(authorId: string, matchId: string, subjectId: string, tx: Transaction): Promise<void> {
        await tx.$executeRaw`SELECT id FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`;
        const review = await tx.review.findUnique({
            where: { authorId_subjectId_matchId: { authorId, subjectId, matchId } },
        });
        if (review === null) throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        if (this.clock.now() > review.editableUntil) throw trustSafetyError('SUBMISSION_WINDOW_CLOSED', 400);
        if (review.state === SafetyReviewState.WITHDRAWN) return;
        const revision = review.currentRevision + 1;
        await tx.review.update({
            where: { id: review.id },
            data: { state: SafetyReviewState.WITHDRAWN, currentRevision: revision, updatedAt: this.clock.now() },
        });
        await tx.reviewRevision.create({
            data: {
                reviewId: review.id,
                revision,
                kind: SafetyReviewRevisionKind.WITHDRAWN,
                tags: [],
                payloadChecksum: this.crypto.hash(`WITHDRAWN:${review.id}:${String(revision)}`),
                createdAt: this.clock.now(),
            },
        });
        await tx.reviewReputationContribution.updateMany({
            where: { reviewId: review.id },
            data: { eligible: false, reviewRevision: revision, appliedAt: this.clock.now() },
        });
        await this.rebuildReputation(tx, subjectId);
        await this.auditEntry(tx, authorId, 'safety.review.withdrawn', 'REVIEW', review.id, ['state', 'revision']);
        await this.reviewEvent(tx, review.id, revision);
    }

    async submitNoShow(
        reporterId: string,
        matchId: string,
        body: NoShowSubmissionDto,
        tx: Transaction
    ): Promise<object> {
        const match = await tx.match.findUnique({
            where: { id: matchId },
            select: { state: true, startsAt: true, version: true },
        });
        if (
            match?.startsAt === null ||
            match === null ||
            match.state === MatchState.CANCELLED ||
            match.state === MatchState.VOIDED
        ) {
            throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        }
        const participants = await tx.matchParticipant.findMany({
            where: {
                matchId,
                userId: { in: [reporterId, body.subjectPlayerId] },
                state: { in: [MatchParticipantState.ACTIVE, MatchParticipantState.PLAYED] },
            },
            select: { userId: true },
        });
        if (reporterId === body.subjectPlayerId || new Set(participants.map((item) => item.userId)).size !== 2) {
            throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        }
        const opens = new Date(match.startsAt.getTime() + NO_SHOW_DELAY_MS);
        const closes = new Date(match.startsAt.getTime() + NO_SHOW_WINDOW_MS);
        if (this.clock.now() < opens || this.clock.now() > closes)
            throw trustSafetyError('SUBMISSION_WINDOW_CLOSED', 400);
        const uniqueness = this.crypto.hash(`NO_SHOW:${matchId}:${body.subjectPlayerId}`);
        return this.createSignal(
            reporterId,
            body.subjectPlayerId,
            SafetySignalKind.NO_SHOW,
            uniqueness,
            body.evidence,
            tx,
            async (signalId) => {
                await tx.noShowReport.create({
                    data: {
                        signalId,
                        matchId,
                        subjectPlayerId: body.subjectPlayerId,
                        reason: body.reason,
                        sourceRevision: BigInt(match.version),
                        eligibilityEnds: closes,
                    },
                });
            }
        );
    }

    async submitReport(reporterId: string, body: ReportSubmissionDto, tx: Transaction): Promise<object> {
        this.validateCategory(body);
        const source = await this.validateSource(reporterId, body, tx);
        const subjectId = body.subjectPlayerId ?? source.subjectId;
        if (subjectId === reporterId) throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        const uniqueness = this.crypto.hash(
            `${body.kind}:${body.sourceKind}:${body.sourceId}:${String(body.sourceRevision)}:${subjectId ?? ''}`
        );
        return this.createSignal(
            reporterId,
            subjectId,
            body.kind as SafetySignalKind,
            uniqueness,
            body.evidence,
            tx,
            async (signalId) => {
                await tx.report.create({
                    data: {
                        signalId,
                        sourceKind: body.sourceKind as SafetyReportSourceKind,
                        sourceId: body.sourceId,
                        sourceRevision: BigInt(body.sourceRevision),
                        reasonCode: body.reason,
                        timeBucket: body.timeBucket ?? null,
                    },
                });
            }
        );
    }

    async listOwn(userId: string, limit: number, cursor?: string): Promise<object> {
        const decoded = cursor === undefined ? undefined : this.cursors.decode(cursor, 'safety-receipts', userId);
        const snapshotAt = decoded?.snapshotAt ?? this.clock.now().toISOString();
        const rows = await this.prisma.safetySignal.findMany({
            where: {
                reporterId: userId,
                createdAt: { lte: new Date(snapshotAt) },
                ...(decoded === undefined
                    ? {}
                    : {
                          OR: [
                              { createdAt: { lt: new Date(decoded.lastCreatedAt) } },
                              { createdAt: new Date(decoded.lastCreatedAt), id: { lt: decoded.lastId } },
                          ],
                      }),
            },
            include: {
                caseLink: { include: { case: { include: { decisions: { orderBy: { revision: 'desc' }, take: 1 } } } } },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
        });
        const hasNext = rows.length > limit;
        const items = rows.slice(0, limit).map((row) => this.receipt(row));
        const last = rows[Math.min(rows.length, limit) - 1];
        return {
            items,
            pageInfo: {
                hasNext,
                nextCursor:
                    hasNext && last !== undefined
                        ? this.cursors.encode({
                              type: 'safety-receipts',
                              userId,
                              snapshotAt,
                              lastCreatedAt: last.createdAt.toISOString(),
                              lastId: last.id,
                          })
                        : null,
            },
            snapshotAt,
        };
    }

    async getOwn(userId: string, receiptId: string): Promise<object> {
        const signal = await this.partySignal(userId, receiptId, this.prisma);
        const appeal = signal.caseLink?.case.decisions
            .flatMap((decision) => decision.appeals)
            .find((item) => item.appellantId === userId);
        return {
            receipt: this.receipt(signal),
            submittedEvidence:
                signal.reporterId !== userId || signal.evidence === null || signal.evidence.cryptoshreddedAt !== null
                    ? null
                    : this.crypto.decrypt(signal.evidence.ciphertext, this.evidenceAad(signal.id)),
            ownResponses: signal.responses
                .filter((item) => item.authorId === userId)
                .map((item) => ({
                    entryId: item.id,
                    text: this.crypto.decrypt(
                        item.ciphertext,
                        this.responseAad(item.id, item.caseId, item.signalId, item.authorId)
                    ),
                    createdAt: item.createdAt.toISOString(),
                })),
            ownAppeal:
                appeal === undefined
                    ? null
                    : {
                          entryId: appeal.id,
                          text:
                              appeal.textCiphertext === null
                                  ? appeal.reasonCode
                                  : this.crypto.decrypt(
                                        appeal.textCiphertext,
                                        this.appealAad(appeal.id, appeal.decisionId, userId)
                                    ),
                          createdAt: appeal.createdAt.toISOString(),
                      },
        };
    }

    async requestWithdrawal(userId: string, receiptId: string, tx: Transaction): Promise<object> {
        const signal = await this.ownedSignal(userId, receiptId, tx);
        if (signal.state !== SafetySignalState.RESOLVED) {
            await tx.safetySignal.update({
                where: { id: receiptId },
                data: {
                    state: SafetySignalState.WITHDRAW_REQUESTED,
                    version: { increment: 1 },
                    updatedAt: this.clock.now(),
                },
            });
        }
        await this.auditEntry(tx, userId, 'safety.signal.withdrawal.requested', 'SAFETY_SIGNAL', receiptId, ['state']);
        return this.receipt(await this.ownedSignal(userId, receiptId, tx));
    }

    async respond(userId: string, receiptId: string, body: CaseResponseDto, tx: Transaction): Promise<object> {
        const signal = await this.partySignal(userId, receiptId, tx);
        const linked = signal.caseLink;
        if (linked === null || linked.case.state === 'CLOSED') throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        const existing = await tx.safetyCaseResponse.count({
            where: { signalId: signal.id, authorId: userId },
        });
        if (existing > 0) throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        if (signal.subjectId === userId) {
            const notice = await tx.notification.findFirst({
                where: {
                    recipientId: userId,
                    sourceEventId: linked.caseId,
                    type: 'SAFETY_RESPONSE_REQUESTED',
                },
            });
            if (notice === null || this.clock.now().getTime() > notice.createdAt.getTime() + 7 * 86_400_000) {
                throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
            }
        }
        const id = uuidV7();
        await tx.safetyCaseResponse.create({
            data: {
                id,
                caseId: linked.caseId,
                signalId: signal.id,
                authorId: userId,
                partyRole: signal.reporterId === userId ? 'REPORTER' : 'SUBJECT',
                disposition: body.noShowDisposition ?? null,
                ciphertext: this.crypto.encrypt(body.text, this.responseAad(id, linked.caseId, signal.id, userId)),
                encryptionKeyVersion: 1,
                aadVersion: 1,
                retentionExpiresAt: new Date(this.clock.now().getTime() + 365 * 86_400_000),
            },
        });
        await this.auditEntry(tx, userId, 'safety.case.response.created', 'MODERATION_CASE', linked.caseId, [
            'response',
        ]);
        return this.receipt(await this.ownedSignal(signal.reporterId ?? userId, receiptId, tx));
    }

    async appeal(userId: string, receiptId: string, body: AppealDto, tx: Transaction): Promise<object> {
        const signal = await this.partySignal(userId, receiptId, tx);
        const decision = signal.caseLink?.case.decisions[0];
        if (decision === undefined || this.clock.now().getTime() > decision.createdAt.getTime() + APPEAL_WINDOW_MS) {
            throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        }
        const id = uuidV7();
        try {
            await tx.moderationAppeal.create({
                data: {
                    id,
                    decisionId: decision.id,
                    appellantId: userId,
                    reasonCode: body.reason,
                    textCiphertext:
                        body.text === undefined
                            ? null
                            : this.crypto.encrypt(body.text, this.appealAad(id, decision.id, userId)),
                    encryptionKeyVersion: body.text === undefined ? null : 1,
                    retentionExpiresAt: new Date(this.clock.now().getTime() + 365 * 86_400_000),
                },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                throw trustSafetyError('APPEAL_ALREADY_SUBMITTED', 409);
            throw error;
        }
        await this.auditEntry(tx, userId, 'safety.appeal.created', 'MODERATION_DECISION', decision.id, ['appeal']);
        return this.receipt(await this.ownedSignal(signal.reporterId ?? userId, receiptId, tx));
    }

    async publicReputation(playerId: string, viewerId?: string): Promise<object> {
        if (viewerId !== undefined && (await this.isBlocked(this.prisma, viewerId, playerId)))
            throw trustSafetyError('PROFILE_NOT_AVAILABLE', 404);
        const player = await this.prisma.user.findUnique({ where: { id: playerId }, select: { status: true } });
        if (player?.status !== 'ACTIVE') throw trustSafetyError('PROFILE_NOT_AVAILABLE', 404);
        const aggregate = await this.prisma.reviewReputationAggregate.findUnique({ where: { subjectId: playerId } });
        const available = aggregate !== null && aggregate.reviewCount >= 5n;
        return {
            available,
            averageRating: available ? Number(aggregate.ratingSum) / Number(aggregate.reviewCount) : null,
            reviewCount: available ? aggregate.reviewCount.toString() : null,
            calculatedAt: (aggregate?.calculatedAt ?? this.clock.now()).toISOString(),
        };
    }

    async listBlocks(userId: string, limit: number, cursor?: string): Promise<object> {
        const decoded = cursor === undefined ? undefined : this.cursors.decode(cursor, 'safety-blocks', userId);
        const snapshotAt = decoded?.snapshotAt ?? this.clock.now().toISOString();
        const rows = await this.prisma.communicationBlock.findMany({
            where: {
                blockerId: userId,
                createdAt: { lte: new Date(snapshotAt) },
                ...(decoded === undefined
                    ? {}
                    : {
                          OR: [
                              { createdAt: { lt: new Date(decoded.lastCreatedAt) } },
                              { createdAt: new Date(decoded.lastCreatedAt), blockedUserId: { lt: decoded.lastId } },
                          ],
                      }),
            },
            orderBy: [{ createdAt: 'desc' }, { blockedUserId: 'desc' }],
            take: limit + 1,
        });
        const hasNext = rows.length > limit;
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
            items: page.map((row) => ({ blockedUserId: row.blockedUserId, createdAt: row.createdAt.toISOString() })),
            pageInfo: {
                hasNext,
                nextCursor:
                    hasNext && last !== undefined
                        ? this.cursors.encode({
                              type: 'safety-blocks',
                              userId,
                              snapshotAt,
                              lastCreatedAt: last.createdAt.toISOString(),
                              lastId: last.blockedUserId,
                          })
                        : null,
            },
            snapshotAt,
        };
    }

    private async createSignal(
        reporterId: string,
        subjectId: string | undefined,
        kind: SafetySignalKind,
        uniquenessKey: string,
        evidence: string | undefined,
        tx: Transaction,
        createSubtype: (signalId: string) => Promise<void>
    ): Promise<object> {
        const existing = await tx.safetySignal.findUnique({
            where: { reporterId_uniquenessKey: { reporterId, uniquenessKey } },
            include: {
                caseLink: { include: { case: { include: { decisions: { orderBy: { revision: 'desc' }, take: 1 } } } } },
            },
        });
        if (existing !== null) return this.receipt(existing);
        const now = this.clock.now();
        const signalId = uuidV7();
        const caseId = uuidV7();
        await tx.safetySignal.create({
            data: {
                id: signalId,
                reporterId,
                subjectId: subjectId ?? null,
                kind,
                policyVersion: this.policyVersion,
                uniquenessKey,
                receiptExpiresAt: new Date(now.getTime() + 365 * 86_400_000),
                createdAt: now,
                updatedAt: now,
            },
        });
        await createSubtype(signalId);
        if (evidence !== undefined)
            await tx.safetyEvidence.create({
                data: {
                    signalId,
                    ciphertext: this.crypto.encrypt(evidence, this.evidenceAad(signalId)),
                    encryptionKeyVersion: 1,
                    aadVersion: 1,
                    contentChecksum: this.crypto.hash(evidence),
                    retentionExpiresAt: new Date(now.getTime() + 365 * 86_400_000),
                    createdAt: now,
                },
            });
        await tx.moderationCase.create({
            data: {
                id: caseId,
                category: kind,
                retentionExpiresAt: new Date(now.getTime() + 3 * 365 * 86_400_000),
                createdAt: now,
                updatedAt: now,
            },
        });
        await tx.moderationCaseSignal.create({ data: { caseId, signalId, linkedAt: now } });
        await tx.safetySignal.update({
            where: { id: signalId },
            data: { state: SafetySignalState.LINKED, version: 1, updatedAt: now },
        });
        await this.event(tx, 'safety.signal.received.v1', 'signalId', signalId, kind);
        await this.event(tx, 'safety.case.status.changed.v1', 'caseId', caseId, kind);
        await this.auditEntry(tx, reporterId, 'safety.signal.created', 'SAFETY_SIGNAL', signalId, ['kind', 'state']);
        this.metrics.increment('safety_signal_received_total', { category: kind });
        return this.receipt(await this.ownedSignal(reporterId, signalId, tx));
    }

    private async reviewEligibility(tx: Transaction, authorId: string, matchId: string, subjectId: string) {
        await tx.$executeRaw`SELECT id FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`;
        if (authorId === subjectId) throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        const match = await tx.match.findUnique({
            where: { id: matchId },
            include: {
                metricMarkers: { where: { metricType: 'CONFIRMED_MATCH' }, take: 1 },
                participants: {
                    where: { userId: { in: [authorId, subjectId] }, state: MatchParticipantState.PLAYED },
                    select: { userId: true },
                },
            },
        });
        const marker = match?.metricMarkers[0];
        if (
            match?.state !== MatchState.COMPLETED ||
            marker === undefined ||
            new Set(match.participants.map((item) => item.userId)).size !== 2
        )
            throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        return { confirmedAt: marker.confirmedAt, revision: BigInt(match.version) };
    }

    private validateCategory(body: ReportSubmissionDto): void {
        const allowed: Record<ReportKindDto, readonly string[]> = {
            SAFETY: Object.values(SafetyReasonDto),
            CONTENT: Object.values(ContentReasonDto),
            VENUE: Object.values(VenueReasonDto),
            RESULT: Object.values(ResultReasonDto),
        };
        const sources: Record<ReportKindDto, readonly ReportSourceKindDto[]> = {
            SAFETY: Object.values(ReportSourceKindDto),
            CONTENT: [ReportSourceKindDto.CHAT_MESSAGE, ReportSourceKindDto.MATCH, ReportSourceKindDto.PROFILE],
            VENUE: [ReportSourceKindDto.VENUE],
            RESULT: [ReportSourceKindDto.MATCH_RESULT],
        };
        if (!allowed[body.kind].includes(body.reason) || !sources[body.kind].includes(body.sourceKind))
            throw trustSafetyError('VALIDATION_FAILED', 400);
        if (body.kind === ReportKindDto.SAFETY && body.timeBucket === undefined)
            throw trustSafetyError('VALIDATION_FAILED', 400);
    }

    private async validateSource(
        reporterId: string,
        body: ReportSubmissionDto,
        tx: Transaction
    ): Promise<{ subjectId?: string }> {
        if (body.sourceKind === ReportSourceKindDto.MATCH) {
            const match = await tx.match.findUnique({
                where: { id: body.sourceId },
                include: { participants: { where: { userId: reporterId } } },
            });
            if (match === null || match.version !== body.sourceRevision || match.participants.length === 0)
                throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
            if (match.startsAt !== null && this.clock.now().getTime() > match.startsAt.getTime() + REPORT_WINDOW_MS)
                throw trustSafetyError('SUBMISSION_WINDOW_CLOSED', 400);
            return { subjectId: match.organizerId };
        }
        if (body.sourceKind === ReportSourceKindDto.CHAT_MESSAGE) {
            const message = await tx.chatMessage.findUnique({
                where: { id: body.sourceId },
                include: {
                    conversation: { include: { memberships: { where: { userId: reporterId } } } },
                    revisions: { where: { revision: body.sourceRevision } },
                },
            });
            if (message === null || message.revisions.length === 0 || message.conversation.memberships.length === 0)
                throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
            return message.authorId === null ? {} : { subjectId: message.authorId };
        }
        if (body.sourceKind === ReportSourceKindDto.PROFILE) {
            const profile = await tx.playerProfile.findUnique({ where: { userId: body.sourceId } });
            if (profile === null || body.sourceRevision !== profile.version)
                throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
            return { subjectId: body.sourceId };
        }
        if (body.sourceKind === ReportSourceKindDto.VENUE) {
            const venue = await tx.venue.findUnique({ where: { id: body.sourceId } });
            if (venue === null || BigInt(body.sourceRevision) !== BigInt(venue.version))
                throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
            return {};
        }
        const result = await tx.matchResult.findUnique({
            where: { id: body.sourceId },
            include: { match: { include: { participants: { where: { userId: reporterId } } } } },
        });
        if (result === null || result.version !== body.sourceRevision || result.match.participants.length === 0)
            throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
        return { subjectId: result.proposedBy };
    }

    private async projectReview(
        tx: Transaction,
        reviewId: string,
        authorId: string,
        subjectId: string,
        matchId: string,
        revision: number,
        rating: number,
        eligible: boolean,
        checksum: string
    ): Promise<void> {
        await tx.reviewReputationContribution.upsert({
            where: { reviewId },
            create: {
                reviewId,
                subjectId,
                matchId,
                authorKey: this.crypto.hash(`REVIEW_AUTHOR:${authorId}`),
                reviewRevision: revision,
                rating,
                eligible,
                sourceChecksum: checksum,
            },
            update: {
                reviewRevision: revision,
                rating,
                eligible,
                sourceChecksum: checksum,
                appliedAt: this.clock.now(),
            },
        });
        await this.rebuildReputation(tx, subjectId);
    }

    private async rebuildReputation(tx: Transaction, subjectId: string): Promise<void> {
        const rows = await tx.reviewReputationContribution.findMany({
            where: { subjectId, eligible: true },
            orderBy: { reviewId: 'asc' },
        });
        const digest = this.crypto.hash(
            rows.map((row) => `${row.reviewId}:${String(row.reviewRevision)}:${row.sourceChecksum}`).join(',')
        );
        await tx.reviewReputationAggregate.upsert({
            where: { subjectId },
            create: {
                subjectId,
                ratingSum: rows.reduce((sum, row) => sum + BigInt(row.rating), 0n),
                reviewCount: BigInt(rows.length),
                sourceDigest: digest,
                calculatedAt: this.clock.now(),
            },
            update: {
                ratingSum: rows.reduce((sum, row) => sum + BigInt(row.rating), 0n),
                reviewCount: BigInt(rows.length),
                sourceDigest: digest,
                calculatedAt: this.clock.now(),
            },
        });
    }

    private async ownedSignal(userId: string, id: string, database: Transaction | PrismaService = this.prisma) {
        const signal = await database.safetySignal.findFirst({
            where: { id, reporterId: userId },
            include: {
                evidence: true,
                responses: true,
                caseLink: {
                    include: {
                        case: { include: { decisions: { orderBy: { revision: 'desc' }, include: { appeals: true } } } },
                    },
                },
            },
        });
        if (signal === null) throw trustSafetyError('SAFETY_RECEIPT_NOT_FOUND', 404);
        return signal;
    }

    private async partySignal(userId: string, id: string, database: Transaction | PrismaService) {
        const signal = await database.safetySignal.findFirst({
            where: { id, OR: [{ reporterId: userId }, { subjectId: userId }] },
            include: {
                evidence: true,
                responses: true,
                caseLink: {
                    include: {
                        case: { include: { decisions: { orderBy: { revision: 'desc' }, include: { appeals: true } } } },
                    },
                },
            },
        });
        if (signal === null) throw trustSafetyError('SAFETY_RECEIPT_NOT_FOUND', 404);
        return signal;
    }

    private receipt(signal: {
        id: string;
        kind: SafetySignalKind;
        state: SafetySignalState;
        reporterId?: string | null;
        createdAt: Date;
        updatedAt: Date;
        caseLink: null | { case: { decisions: { outcome: string; createdAt: Date }[] } };
    }): object {
        const decision = signal.caseLink?.case.decisions[0];
        const outcome =
            decision === undefined
                ? null
                : decision.outcome === 'NO_VIOLATION'
                  ? 'NO_ACTION'
                  : decision.outcome === 'VENUE_ROUTED'
                    ? 'ROUTED'
                    : 'ACTION_TAKEN';
        return {
            receiptId: signal.id,
            kind: signal.kind,
            status:
                signal.state === 'RESOLVED'
                    ? 'RESOLVED'
                    : signal.state === 'RECEIVED' || signal.state === 'LINKED'
                      ? 'RECEIVED'
                      : 'IN_REVIEW',
            outcome,
            outcomeReason: outcome === null ? null : 'Рассмотрение завершено по правилам сообщества.',
            canWithdraw: signal.state !== 'RESOLVED' && signal.state !== 'WITHDRAW_REQUESTED',
            canRespond: signal.caseLink !== null && signal.state !== 'RESOLVED',
            canAppeal:
                decision !== undefined && this.clock.now().getTime() <= decision.createdAt.getTime() + APPEAL_WINDOW_MS,
            appealDeadline:
                decision === undefined ? null : new Date(decision.createdAt.getTime() + APPEAL_WINDOW_MS).toISOString(),
            createdAt: signal.createdAt.toISOString(),
            updatedAt: signal.updatedAt.toISOString(),
        };
    }

    private ownReview(
        reviewId: string,
        matchId: string,
        subjectPlayerId: string,
        revision: number,
        experienceRating: number,
        tags: string[],
        text: string | null,
        withdrawnAt: string | null,
        editableUntil: Date
    ): object {
        return {
            reviewId,
            matchId,
            subjectPlayerId,
            revision,
            experienceRating,
            tags,
            text,
            withdrawnAt,
            editableUntil: editableUntil.toISOString(),
            updatedAt: this.clock.now().toISOString(),
        };
    }

    private async isBlocked(database: Transaction | PrismaService, left: string, right: string): Promise<boolean> {
        return left === right
            ? false
            : (await database.communicationBlock.count({
                  where: {
                      OR: [
                          { blockerId: left, blockedUserId: right },
                          { blockerId: right, blockedUserId: left },
                      ],
                  },
              })) > 0;
    }

    private async event(
        tx: Transaction,
        type: string,
        idField: string,
        id: string,
        category: SafetySignalKind
    ): Promise<void> {
        const now = this.clock.now();
        const context = this.context.get();
        await this.outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: now.toISOString(),
                correlationId: context?.correlationId ?? uuidV7(),
                causationId: null,
                data: { [idField]: id, category },
            },
            correlationId: context?.correlationId ?? uuidV7(),
            occurredAt: now,
        });
    }

    private async reviewEvent(tx: Transaction, reviewId: string, reviewRevision: number): Promise<void> {
        const now = this.clock.now();
        const context = this.context.get();
        const correlationId = context?.correlationId ?? uuidV7();
        await this.outbox.enqueue(tx, {
            type: 'review.eligibility.changed.v1',
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type: 'review.eligibility.changed.v1',
                occurredAt: now.toISOString(),
                correlationId,
                causationId: null,
                data: { reviewId, reviewRevision },
            },
            correlationId,
            occurredAt: now,
        });
    }

    private async auditEntry(
        tx: Transaction,
        actorId: string,
        action: string,
        targetType: string,
        targetId: string,
        fields: string[]
    ): Promise<void> {
        const context = this.context.get();
        const requestId = context?.requestId ?? uuidV7();
        await this.audit.append(tx, {
            actorType: 'USER',
            actorId,
            action,
            targetType,
            targetId,
            outcome: 'SUCCEEDED',
            changedFields: { fields },
            requestId,
            correlationId: context?.correlationId ?? requestId,
            source: 'API',
        });
    }

    private reviewAad(id: string, revision: number): string {
        return `safety-review:v1:${id}:${String(revision)}`;
    }
    private evidenceAad(id: string): string {
        return `safety-evidence:v1:${id}`;
    }
    private responseAad(id: string, caseId: string, signalId: string, authorId: string): string {
        return `safety-response:v1:${id}:${caseId}:${signalId}:${authorId}`;
    }
    private appealAad(id: string, decisionId: string, userId: string): string {
        return `safety-appeal:v1:${id}:${decisionId}:${userId}`;
    }
}
