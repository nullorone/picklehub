import { Injectable } from '@nestjs/common';
import { ModerationCaseState, ModerationDecisionOutcome, Prisma, SafetySignalState } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { Clock } from '../identity/clock';
import { OutboxService } from '../outbox/outbox.service';
import { TrustSafetyCryptoService } from './trust-safety-crypto.service';
import { trustSafetyError } from './trust-safety.errors';

type Transaction = Prisma.TransactionClient;

@Injectable()
export class ModerationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly clock: Clock,
        private readonly crypto: TrustSafetyCryptoService,
        private readonly audit: AuditService,
        private readonly outbox: OutboxService,
        private readonly context: RequestContextService
    ) {}

    async triage(caseId: string, expectedRevision: number, priority: 'URGENT' | 'HIGH' | 'NORMAL'): Promise<void> {
        await this.prisma.$transaction((tx) =>
            this.transition(tx, caseId, expectedRevision, ModerationCaseState.OPEN, ModerationCaseState.TRIAGED, {
                priority,
            })
        );
    }

    async assign(caseId: string, moderatorId: string, expectedRevision: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const moderator = await tx.user.findUnique({ where: { id: moderatorId }, select: { status: true } });
            if (moderator?.status !== 'ACTIVE') throw trustSafetyError('INTERACTION_NOT_ALLOWED', 403);
            await this.transition(
                tx,
                caseId,
                expectedRevision,
                ModerationCaseState.TRIAGED,
                ModerationCaseState.ASSIGNED,
                {
                    assignedModeratorId: moderatorId,
                }
            );
        });
    }

    async beginInvestigation(caseId: string, moderatorId: string, expectedRevision: number): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await this.assertAssigned(tx, caseId, moderatorId);
            await this.transition(
                tx,
                caseId,
                expectedRevision,
                ModerationCaseState.ASSIGNED,
                ModerationCaseState.INVESTIGATING,
                {}
            );
            await tx.safetySignal.updateMany({
                where: {
                    caseLink: { caseId },
                    state: { in: [SafetySignalState.LINKED, SafetySignalState.WITHDRAW_REQUESTED] },
                },
                data: {
                    state: SafetySignalState.UNDER_REVIEW,
                    version: { increment: 1 },
                    updatedAt: this.clock.now(),
                },
            });
        });
    }

    async notifySubjectForResponse(caseId: string, moderatorId: string): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await this.assertAssigned(tx, caseId, moderatorId);
            const links = await tx.moderationCaseSignal.findMany({
                where: { caseId },
                include: { signal: { select: { subjectId: true } } },
            });
            const recipients = new Map<string, string>();
            for (const link of links) {
                if (link.signal.subjectId !== null && !recipients.has(link.signal.subjectId)) {
                    recipients.set(link.signal.subjectId, link.signalId);
                }
            }
            await tx.notification.createMany({
                data: [...recipients].map(([recipientId, signalId]) => ({
                    id: uuidV7(),
                    recipientId,
                    sourceEventId: caseId,
                    type: 'SAFETY_RESPONSE_REQUESTED',
                    category: 'MATCH_CRITICAL',
                    route: `/safety/${signalId}`,
                    groupKey: `safety-case:${caseId}`,
                })),
                skipDuplicates: true,
            });
            await this.auditEntry(tx, moderatorId, 'safety.subject.response.requested', 'MODERATION_CASE', caseId, [
                'notification',
            ]);
        });
    }

    async readAssignedEvidence(moderatorId: string, caseId: string): Promise<readonly object[]> {
        await this.ensureAssignedAccess(moderatorId, caseId);
        return this.prisma.$transaction(async (tx) => {
            await this.assertAssigned(tx, caseId, moderatorId);
            const links = await tx.moderationCaseSignal.findMany({
                where: { caseId },
                include: { signal: { include: { evidence: true, noShowReport: true, report: true } } },
            });
            await this.auditEntry(tx, moderatorId, 'safety.evidence.read', 'MODERATION_CASE', caseId, ['evidence']);
            return links.map(({ signal }) => ({
                signalId: signal.id,
                kind: signal.kind,
                reason: signal.noShowReport?.reason ?? signal.report?.reasonCode ?? null,
                evidence:
                    signal.evidence === null || signal.evidence.cryptoshreddedAt !== null
                        ? null
                        : this.crypto.decrypt(signal.evidence.ciphertext, `safety-evidence:v1:${signal.id}`),
            }));
        });
    }

    async recordDecision(
        moderatorId: string,
        caseId: string,
        expectedRevision: number,
        input: {
            outcome: ModerationDecisionOutcome;
            policyCode: string;
            policyVersion: string;
            scopeCode: string;
            basisChecksum: string;
            expiresAt?: Date;
        }
    ): Promise<string> {
        return this.prisma.$transaction(
            async (tx) => {
                const moderationCase = await this.assertAssigned(tx, caseId, moderatorId);
                if (
                    moderationCase.state !== ModerationCaseState.INVESTIGATING ||
                    moderationCase.revision !== expectedRevision
                ) {
                    throw trustSafetyError('REVIEW_REVISION_CONFLICT', 409);
                }
                const previous = await tx.moderationDecision.findFirst({
                    where: { caseId },
                    orderBy: { revision: 'desc' },
                });
                const decisionId = uuidV7();
                const decisionRevision = (previous?.revision ?? 0) + 1;
                const reviewDeadline =
                    input.expiresAt === undefined ? undefined : new Date(this.clock.now().getTime() + 72 * 3_600_000);
                await tx.moderationDecision.create({
                    data: {
                        id: decisionId,
                        caseId,
                        revision: decisionRevision,
                        supersedesDecisionId: previous?.id ?? null,
                        reviewerId: moderatorId,
                        outcome: input.outcome,
                        policyCode: input.policyCode,
                        policyVersion: input.policyVersion,
                        scopeCode: input.scopeCode,
                        basisChecksum: input.basisChecksum,
                        expiresAt: input.expiresAt ?? null,
                        reviewDeadline: reviewDeadline ?? null,
                    },
                });
                const linked = await tx.moderationCaseSignal.findFirst({
                    where: { caseId },
                    include: { signal: { include: { noShowReport: true } } },
                });
                if (linked === null) throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
                if (
                    input.outcome !== ModerationDecisionOutcome.NO_VIOLATION &&
                    linked.signal.subjectId !== null &&
                    moderationCase.priority !== 'URGENT'
                ) {
                    const [notice, response] = await Promise.all([
                        tx.notification.findFirst({
                            where: {
                                recipientId: linked.signal.subjectId,
                                sourceEventId: caseId,
                                type: 'SAFETY_RESPONSE_REQUESTED',
                            },
                        }),
                        tx.safetyCaseResponse.findFirst({
                            where: { caseId, authorId: linked.signal.subjectId },
                        }),
                    ]);
                    if (
                        notice === null ||
                        (response === null && this.clock.now().getTime() < notice.createdAt.getTime() + 7 * 86_400_000)
                    ) {
                        throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
                    }
                }
                const effectId = input.outcome === ModerationDecisionOutcome.NO_VIOLATION ? undefined : uuidV7();
                if (effectId !== undefined)
                    await tx.moderationEffect.create({
                        data: {
                            id: effectId,
                            decisionId,
                            kind: input.outcome,
                            logicalKey: this.crypto.hash(
                                `EFFECT:${caseId}:${input.outcome}:${String(decisionRevision)}`
                            ),
                            ownerReferenceId: linked.signal.id,
                            noShowMatchId: linked.signal.noShowReport?.matchId ?? null,
                            noShowSubjectId: linked.signal.noShowReport?.subjectPlayerId ?? null,
                            sourceRevision: BigInt(decisionRevision),
                        },
                    });
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
                        state: SafetySignalState.RESOLVED,
                        version: { increment: 1 },
                        resolvedAt: this.clock.now(),
                        updatedAt: this.clock.now(),
                    },
                });
                await this.event(tx, 'safety.decision.recorded.v1', 'decisionId', decisionId, moderationCase.category);
                if (effectId !== undefined)
                    await this.event(tx, 'safety.effect.requested.v1', 'effectId', effectId, moderationCase.category);
                await this.event(tx, 'safety.case.status.changed.v1', 'caseId', caseId, moderationCase.category);
                await this.notifyParties(tx, linked.signal.id, decisionId);
                await this.auditEntry(tx, moderatorId, 'safety.decision.recorded', 'MODERATION_CASE', caseId, [
                    'state',
                    'decisionRevision',
                ]);
                return decisionId;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    async retractEffect(moderatorId: string, effectId: string): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const effect = await tx.moderationEffect.findUnique({
                where: { id: effectId },
                include: { decision: { include: { case: true } } },
            });
            if (effect === null || effect.state !== 'APPLIED') throw trustSafetyError('REPORT_NOT_ELIGIBLE', 400);
            await this.assertAssigned(tx, effect.decision.caseId, moderatorId);
            await tx.moderationEffect.update({
                where: { id: effectId },
                data: { state: 'RETRACTION_PENDING' },
            });
            await this.event(tx, 'safety.effect.requested.v1', 'effectId', effectId, effect.decision.case.category);
            await this.auditEntry(
                tx,
                moderatorId,
                'safety.effect.retraction.requested',
                'MODERATION_EFFECT',
                effectId,
                ['state']
            );
        });
    }

    private async transition(
        tx: Transaction,
        caseId: string,
        expectedRevision: number,
        from: ModerationCaseState,
        to: ModerationCaseState,
        data: Prisma.ModerationCaseUpdateInput
    ): Promise<void> {
        const changed = await tx.moderationCase.updateMany({
            where: { id: caseId, state: from, revision: expectedRevision },
            data: { ...data, state: to, revision: { increment: 1 }, updatedAt: this.clock.now() },
        });
        if (changed.count !== 1) throw trustSafetyError('REVIEW_REVISION_CONFLICT', 409);
        const row = await tx.moderationCase.findUniqueOrThrow({ where: { id: caseId } });
        await this.event(tx, 'safety.case.status.changed.v1', 'caseId', caseId, row.category);
    }

    private async assertAssigned(tx: Transaction, caseId: string, moderatorId: string) {
        const moderationCase = await tx.moderationCase.findUnique({ where: { id: caseId } });
        if (
            moderationCase === null ||
            moderationCase.assignedModeratorId !== moderatorId ||
            moderationCase.conflictDetectedAt !== null
        ) {
            throw trustSafetyError('INTERACTION_NOT_ALLOWED', 403);
        }
        return moderationCase;
    }

    private async ensureAssignedAccess(moderatorId: string, caseId: string): Promise<void> {
        const moderationCase = await this.prisma.moderationCase.findUnique({ where: { id: caseId } });
        if (
            moderationCase !== null &&
            moderationCase.assignedModeratorId === moderatorId &&
            moderationCase.conflictDetectedAt === null
        ) {
            return;
        }
        await this.prisma.$transaction((tx) =>
            this.auditEntry(tx, moderatorId, 'safety.evidence.access.denied', 'MODERATION_CASE', caseId, [])
        );
        throw trustSafetyError('INTERACTION_NOT_ALLOWED', 403);
    }

    private async notifyParties(tx: Transaction, signalId: string, sourceEventId: string): Promise<void> {
        const signal = await tx.safetySignal.findUniqueOrThrow({ where: { id: signalId } });
        const recipients = [
            ...new Set([signal.reporterId, signal.subjectId].filter((id): id is string => id !== null)),
        ];
        await tx.notification.createMany({
            data: recipients.map((recipientId) => ({
                id: uuidV7(),
                recipientId,
                sourceEventId,
                type: 'SAFETY_STATUS_CHANGED',
                category: 'MATCH_CRITICAL',
                route: `/safety/${signalId}`,
                groupKey: `safety:${signalId}`,
            })),
            skipDuplicates: true,
        });
    }

    private async event(tx: Transaction, type: string, idField: string, id: string, category: string): Promise<void> {
        const now = this.clock.now();
        const correlationId = this.context.get()?.correlationId ?? uuidV7();
        await this.outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: now.toISOString(),
                correlationId,
                causationId: null,
                data: { [idField]: id, category },
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
        const requestId = this.context.get()?.requestId ?? uuidV7();
        await this.audit.append(tx, {
            actorType: 'MODERATOR',
            actorId,
            action,
            targetType,
            targetId,
            outcome: action.endsWith('.denied') ? 'DENIED' : 'SUCCEEDED',
            changedFields: { fields },
            requestId,
            correlationId: this.context.get()?.correlationId ?? requestId,
            source: 'MODERATION_REPOSITORY',
        });
    }
}
