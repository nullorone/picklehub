import { Injectable } from '@nestjs/common';
import {
    GamificationScopeKind,
    Prisma,
    type AchievementAwardState,
    type XpLedgerEntry,
    type XpSourceKind,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { OutboxService } from '../outbox/outbox.service';
import { eventDisposition, GamificationRuleEngine } from './gamification.domain';
import { GamificationMetricsService } from './gamification-metrics.service';

interface Scope {
    readonly kind: GamificationScopeKind;
    readonly clubId: string | null;
}

interface DesiredAward {
    readonly userId: string;
    readonly sourceKind: XpSourceKind;
    readonly sourceEventId: string;
    readonly occurredAt: Date;
    readonly scope: Scope;
    readonly heldForReview?: boolean;
}

@Injectable()
export class GamificationProjectionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly rules: GamificationRuleEngine,
        private readonly outbox: OutboxService,
        private readonly metrics: GamificationMetricsService
    ) {}

    async reconcileMatch(
        messageId: string,
        sourceEventId: string,
        revision: number,
        payloadHash: string
    ): Promise<void> {
        await this.consume(
            messageId,
            'match.gamification.source.v1',
            sourceEventId,
            revision,
            payloadHash,
            async (tx) => {
                const marker = await tx.matchMetricMarker.findFirst({
                    where: { matchId: sourceEventId, metricType: 'CONFIRMED_MATCH' },
                });
                const match = await tx.match.findUnique({
                    where: { id: sourceEventId },
                    include: { participants: { where: { state: 'PLAYED' }, select: { userId: true } } },
                });
                if (match === null) return [];
                if (marker === null) {
                    await this.reverseSource(tx, sourceEventId, 'SOURCE_NO_LONGER_VALID');
                    return [];
                }
                const desired: DesiredAward[] = match.participants.map((participant) => ({
                    userId: participant.userId,
                    sourceKind: 'CONFIRMED_PLAY',
                    sourceEventId,
                    occurredAt: marker.confirmedAt,
                    scope: { kind: 'GLOBAL', clubId: null },
                }));
                if (
                    match.recurringRuleId === null &&
                    match.participants.some((participant) => participant.userId !== match.organizerId)
                ) {
                    desired.push({
                        userId: match.organizerId,
                        sourceKind: 'CONFIRMED_MATCH_ORGANIZED',
                        sourceEventId,
                        occurredAt: marker.confirmedAt,
                        scope: { kind: 'GLOBAL', clubId: null },
                    });
                }
                if (match.clubId !== null) {
                    const club = await tx.club.findUnique({ where: { id: match.clubId }, select: { state: true } });
                    if (club?.state === 'ACTIVE') {
                        for (const award of [...desired]) {
                            const membership = await tx.clubMembership.findFirst({
                                where: {
                                    clubId: match.clubId,
                                    userId: award.userId,
                                    joinedAt: { lte: marker.confirmedAt },
                                    OR: [{ endedAt: null }, { endedAt: { gt: marker.confirmedAt } }],
                                },
                            });
                            if (membership !== null)
                                desired.push({ ...award, scope: { kind: 'CLUB', clubId: match.clubId } });
                        }
                    }
                }
                return desired;
            }
        );
    }

    async reconcileReview(messageId: string, reviewId: string, revision: number, payloadHash: string): Promise<void> {
        await this.consume(messageId, 'review.gamification.source.v1', reviewId, revision, payloadHash, async (tx) => {
            const review = await tx.review.findUnique({ where: { id: reviewId } });
            if (review === null) return [];
            const representative = await tx.review.findFirst({
                where: { authorId: review.authorId, matchId: review.matchId, state: 'ACTIVE' },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            if (representative === null) {
                await this.reverseSource(tx, review.matchId, 'REVIEW_WITHDRAWN_OR_INELIGIBLE', {
                    userId: review.authorId,
                    sourceKind: 'ELIGIBLE_STRUCTURED_REVIEW',
                });
                return [];
            }
            const latest = await tx.reviewRevision.findUnique({
                where: {
                    reviewId_revision: {
                        reviewId: representative.id,
                        revision: representative.currentRevision,
                    },
                },
            });
            if (latest?.kind !== 'SUBMITTED' || latest.experienceRating === null) {
                await this.reverseSource(tx, representative.matchId, 'REVIEW_WITHDRAWN_OR_INELIGIBLE', {
                    userId: representative.authorId,
                    sourceKind: 'ELIGIBLE_STRUCTURED_REVIEW',
                });
                return [];
            }
            const marker = await tx.matchMetricMarker.findFirst({
                where: { matchId: representative.matchId, metricType: 'CONFIRMED_MATCH' },
            });
            if (marker === null || latest.createdAt > representative.editableUntil) {
                await this.reverseSource(tx, representative.matchId, 'REVIEW_WITHDRAWN_OR_INELIGIBLE', {
                    userId: representative.authorId,
                    sourceKind: 'ELIGIBLE_STRUCTURED_REVIEW',
                });
                return [];
            }
            const match = await tx.match.findUnique({
                where: { id: representative.matchId },
                select: { clubId: true },
            });
            const desired: DesiredAward[] = [
                {
                    userId: representative.authorId,
                    sourceKind: 'ELIGIBLE_STRUCTURED_REVIEW',
                    sourceEventId: representative.matchId,
                    occurredAt: latest.createdAt,
                    scope: { kind: 'GLOBAL', clubId: null },
                },
            ];
            if (match?.clubId !== null && match?.clubId !== undefined) {
                const [club, membership] = await Promise.all([
                    tx.club.findUnique({ where: { id: match.clubId }, select: { state: true } }),
                    tx.clubMembership.findFirst({
                        where: {
                            clubId: match.clubId,
                            userId: representative.authorId,
                            joinedAt: { lte: latest.createdAt },
                            OR: [{ endedAt: null }, { endedAt: { gt: latest.createdAt } }],
                        },
                    }),
                ]);
                const globalAward = desired[0];
                if (club?.state === 'ACTIVE' && membership !== null && globalAward !== undefined)
                    desired.push({ ...globalAward, scope: { kind: 'CLUB', clubId: match.clubId } });
            }
            return desired;
        });
    }

    async freezeClubMember(userId: string, clubId: string, frozenAt: Date | null): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await tx.xpBalance.updateMany({
                where: { userId, scopeKind: 'CLUB', clubId },
                data: { frozenAt, updatedAt: new Date() },
            });
            if (frozenAt !== null) {
                const seasons = await tx.leaderboardSeason.findMany({
                    where: { scopeKind: 'CLUB', clubId, state: { not: 'CLOSED' } },
                    select: { id: true },
                });
                await tx.leaderboardEntry.deleteMany({
                    where: { userId, seasonId: { in: seasons.map((season) => season.id) } },
                });
            }
        });
    }

    async rebuildAll(): Promise<number> {
        const owners = await this.prisma.xpLedgerEntry.findMany({
            distinct: ['userId', 'scopeKind', 'clubId'],
            select: { userId: true, scopeKind: true, clubId: true },
        });
        for (const owner of owners) {
            await this.prisma.$transaction((tx) =>
                this.rebuildOwner(tx, owner.userId, { kind: owner.scopeKind, clubId: owner.clubId })
            );
        }
        await this.rebuildLeaderboards();
        this.metrics.increment('projection.rebuilt', owners.length);
        return owners.length;
    }

    async rebuildLeaderboards(now = new Date()): Promise<void> {
        const seasons = await this.prisma.leaderboardSeason.findMany({ where: { state: { not: 'CLOSED' } } });
        for (const season of seasons) {
            await this.prisma.$transaction(async (tx) => {
                const targetState = now < season.startsAt ? 'SCHEDULED' : now >= season.endsAt ? 'CLOSED' : 'ACTIVE';
                if (targetState !== season.state)
                    await tx.leaderboardSeason.update({ where: { id: season.id }, data: { state: targetState } });
                if (targetState === 'SCHEDULED') return;
                const consents = await tx.$queryRaw<{ userId: string; revision: number }[]>(Prisma.sql`
                    SELECT DISTINCT ON (user_id) user_id AS "userId", revision
                    FROM leaderboard_consents
                    WHERE season_id = ${season.id}::uuid AND opted_in IS TRUE
                    ORDER BY user_id, revision DESC
                `);
                const rows: { userId: string; seasonalNetXp: bigint; revision: number }[] = [];
                for (const consent of consents) {
                    const newer = await tx.leaderboardConsent.findFirst({
                        where: { seasonId: season.id, userId: consent.userId, revision: { gt: consent.revision } },
                    });
                    if (newer !== null) continue;
                    const eligible = await this.leaderboardEligible(
                        tx,
                        consent.userId,
                        season.scopeKind,
                        season.clubId,
                        now
                    );
                    if (!eligible) continue;
                    const entries = await tx.xpLedgerEntry.findMany({
                        where: {
                            userId: consent.userId,
                            scopeKind: season.scopeKind,
                            clubId: season.clubId,
                            sourceOccurredAt: { gte: season.startsAt, lt: season.endsAt },
                            status: 'POSTED',
                        },
                    });
                    const xp = this.net(entries);
                    rows.push({ userId: consent.userId, seasonalNetXp: xp, revision: consent.revision });
                }
                const ranks = this.rules.competitionRanks(rows);
                await tx.leaderboardEntry.deleteMany({ where: { seasonId: season.id } });
                for (const row of rows) {
                    const level = await this.levelFor(
                        tx,
                        season.scopeKind,
                        season.clubId,
                        season.ruleVersion,
                        row.seasonalNetXp
                    );
                    const rank = ranks.get(row.userId);
                    if (rank === undefined) throw new Error('Leaderboard rank projection is incomplete');
                    await tx.leaderboardEntry.create({
                        data: {
                            seasonId: season.id,
                            userId: row.userId,
                            consentRevision: row.revision,
                            rank,
                            seasonalNetXp: row.seasonalNetXp,
                            levelDefinitionId: level.id,
                            projectionRevision: BigInt(entriesRevision(rows)),
                        },
                    });
                }
                const correlationId = uuidV7();
                await this.outbox.enqueue(tx, {
                    type: 'gamification.leaderboard-projection.changed.v1',
                    schemaVersion: 1,
                    payload: {
                        messageId: uuidV7(),
                        type: 'gamification.leaderboard-projection.changed.v1',
                        occurredAt: now.toISOString(),
                        correlationId,
                        causationId: null,
                        data: {
                            seasonId: season.id,
                            projectionRevision: rows.length,
                            outcome: targetState === 'CLOSED' ? 'CLOSED' : 'REBUILT',
                        },
                    },
                    correlationId,
                    occurredAt: now,
                });
            });
        }
    }

    private async consume(
        messageId: string,
        eventType: string,
        sourceEventId: string,
        revision: number,
        payloadHash: string,
        resolve: (tx: Prisma.TransactionClient) => Promise<DesiredAward[]>
    ): Promise<void> {
        await this.prisma.$transaction(
            async (tx) => {
                await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${sourceEventId}, 0))`);
                const [message, exactRevision, newest] = await Promise.all([
                    tx.processedGamificationEvent.findUnique({ where: { messageId } }),
                    tx.processedGamificationEvent.findFirst({ where: { sourceEventId, sourceRevision: revision } }),
                    tx.processedGamificationEvent.findFirst({
                        where: { sourceEventId },
                        orderBy: { sourceRevision: 'desc' },
                    }),
                ]);
                const disposition = eventDisposition(
                    message !== null || exactRevision !== null,
                    newest?.sourceRevision ?? null,
                    revision
                );
                if (disposition === 'DUPLICATE') {
                    this.metrics.increment('event.duplicate');
                    return;
                }
                if (disposition === 'STALE') {
                    await this.receipt(tx, messageId, eventType, sourceEventId, revision, payloadHash, 'STALE');
                    this.metrics.increment('event.stale');
                    return;
                }
                const desired = await resolve(tx);
                const owners = new Map<string, { userId: string; scope: Scope }>();
                for (const award of desired) {
                    await this.ensureAward(tx, award);
                    owners.set(`${award.userId}:${award.scope.kind}:${award.scope.clubId ?? '-'}`, {
                        userId: award.userId,
                        scope: award.scope,
                    });
                }
                const existing = await tx.xpLedgerEntry.findMany({
                    where: { sourceEventId },
                    select: { userId: true, scopeKind: true, clubId: true },
                });
                for (const row of existing)
                    owners.set(`${row.userId}:${row.scopeKind}:${row.clubId ?? '-'}`, {
                        userId: row.userId,
                        scope: { kind: row.scopeKind, clubId: row.clubId },
                    });
                for (const owner of owners.values()) await this.rebuildOwner(tx, owner.userId, owner.scope);
                await this.receipt(tx, messageId, eventType, sourceEventId, revision, payloadHash, 'APPLIED');
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    private async ensureAward(tx: Prisma.TransactionClient, award: DesiredAward): Promise<void> {
        const rule = await tx.xpRuleDefinition.findFirst({
            where: {
                scopeKind: award.scope.kind,
                clubId: award.scope.clubId,
                sourceKind: award.sourceKind,
                enabled: true,
                effectiveFrom: { lte: award.occurredAt },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: award.occurredAt } }],
            },
            orderBy: { effectiveFrom: 'desc' },
        });
        if (rule === null) return;
        const entries = await tx.xpLedgerEntry.findMany({
            where: {
                userId: award.userId,
                scopeKind: award.scope.kind,
                clubId: award.scope.clubId,
                sourceKind: award.sourceKind,
                sourceEventId: award.sourceEventId,
                ruleVersion: rule.version,
            },
            orderBy: { createdAt: 'asc' },
        });
        if (entries.some((entry) => entry.kind === 'AWARD') && !entries.some((entry) => entry.kind === 'REVERSAL'))
            return;
        const reversal = entries.find((entry) => entry.kind === 'REVERSAL');
        if (reversal !== undefined && !entries.some((entry) => entry.kind === 'REINSTATEMENT')) {
            await this.appendCompensation(tx, reversal, 'REINSTATEMENT', 'SOURCE_REVALIDATED');
            this.metrics.increment('award.posted');
            return;
        }
        if (entries.length > 0) return;
        const [dailyCount, weeklyCount] = await Promise.all([
            this.capCount(tx, award, startOfUtcDay(award.occurredAt), endOfUtcDay(award.occurredAt)),
            this.capCount(tx, award, startOfUtcWeek(award.occurredAt), endOfUtcWeek(award.occurredAt)),
        ]);
        const status = this.rules.awardStatus(rule, dailyCount, weeklyCount, award.heldForReview ?? false);
        const amount = status === 'CAPPED' ? 0 : this.rules.calculateAmount(rule);
        const entry = await tx.xpLedgerEntry.create({
            data: {
                id: uuidV7(),
                userId: award.userId,
                scopeKind: award.scope.kind,
                clubId: award.scope.clubId,
                sourceKind: award.sourceKind,
                sourceEventId: award.sourceEventId,
                sourceOccurredAt: award.occurredAt,
                ruleDefinitionId: rule.id,
                ruleVersion: rule.version,
                kind: 'AWARD',
                status,
                amount,
                reasonCode:
                    status === 'CAPPED' ? 'SOURCE_TIME_CAP_REACHED' : status === 'PENDING' ? 'AUTOMATED_REVIEW' : null,
            },
        });
        this.metrics.increment(
            status === 'CAPPED' ? 'award.capped' : status === 'PENDING' ? 'award.held' : 'award.posted'
        );
        await this.emitLedger(tx, entry.id, award.occurredAt);
    }

    private async reverseSource(
        tx: Prisma.TransactionClient,
        sourceEventId: string,
        reasonCode: string,
        filter?: { userId: string; sourceKind: XpSourceKind }
    ): Promise<void> {
        const entries = await tx.xpLedgerEntry.findMany({
            where: {
                sourceEventId,
                kind: 'AWARD',
                status: 'POSTED',
                ...(filter ?? {}),
            },
        });
        const owners = new Map<string, { userId: string; scope: Scope }>();
        for (const entry of entries) {
            const existing = await tx.xpLedgerEntry.findFirst({
                where: { compensationOfEntryId: entry.id, kind: 'REVERSAL' },
            });
            if (existing === null) {
                await this.appendCompensation(tx, entry, 'REVERSAL', reasonCode);
                this.metrics.increment('award.reversed');
            }
            owners.set(`${entry.userId}:${entry.scopeKind}:${entry.clubId ?? '-'}`, {
                userId: entry.userId,
                scope: { kind: entry.scopeKind, clubId: entry.clubId },
            });
        }
        for (const owner of owners.values()) await this.rebuildOwner(tx, owner.userId, owner.scope);
    }

    private async appendCompensation(
        tx: Prisma.TransactionClient,
        source: XpLedgerEntry,
        kind: 'REVERSAL' | 'REINSTATEMENT',
        reasonCode: string
    ): Promise<void> {
        const entry = await tx.xpLedgerEntry.create({
            data: {
                id: uuidV7(),
                userId: source.userId,
                scopeKind: source.scopeKind,
                clubId: source.clubId,
                sourceKind: source.sourceKind,
                sourceEventId: source.sourceEventId,
                sourceOccurredAt: source.sourceOccurredAt,
                ruleDefinitionId: source.ruleDefinitionId,
                ruleVersion: source.ruleVersion,
                kind,
                status: 'POSTED',
                amount: source.amount,
                compensationOfEntryId: source.id,
                reasonCode,
            },
        });
        await this.emitLedger(tx, entry.id, source.sourceOccurredAt);
    }

    private async rebuildOwner(tx: Prisma.TransactionClient, userId: string, scope: Scope): Promise<void> {
        const rebuiltAt = new Date();
        const ledger = await tx.xpLedgerEntry.findMany({
            where: { userId, scopeKind: scope.kind, clubId: scope.clubId },
            orderBy: [{ sourceOccurredAt: 'asc' }, { id: 'asc' }],
        });
        const net = this.net(ledger);
        const checksum = createHash('sha256')
            .update(JSON.stringify(ledger.map((entry) => [entry.id, entry.kind, entry.status, entry.amount])))
            .digest('hex');
        const frozen =
            scope.kind === 'CLUB' && scope.clubId !== null
                ? (await tx.clubMembership.findFirst({ where: { userId, clubId: scope.clubId, state: 'ACTIVE' } })) ===
                  null
                : false;
        const existing = await tx.xpBalance.findFirst({
            where: { userId, scopeKind: scope.kind, clubId: scope.clubId },
        });
        if (existing === null)
            await tx.xpBalance.create({
                data: {
                    id: uuidV7(),
                    userId,
                    scopeKind: scope.kind,
                    clubId: scope.clubId,
                    lifetimeNetXp: net,
                    projectionRevision: BigInt(ledger.length),
                    checksum,
                    frozenAt: frozen ? rebuiltAt : null,
                    updatedAt: rebuiltAt,
                },
            });
        else
            await tx.xpBalance.update({
                where: { id: existing.id },
                data: {
                    lifetimeNetXp: net,
                    projectionRevision: BigInt(ledger.length),
                    checksum,
                    frozenAt: frozen ? (existing.frozenAt ?? rebuiltAt) : null,
                    updatedAt: rebuiltAt,
                },
            });
        await this.rebuildAchievements(tx, userId, scope, ledger);
    }

    private async rebuildAchievements(
        tx: Prisma.TransactionClient,
        userId: string,
        scope: Scope,
        ledger: XpLedgerEntry[]
    ): Promise<void> {
        const definitions = await tx.achievementDefinition.findMany({ where: { scopeKind: scope.kind } });
        for (const definition of definitions) {
            const count = netValidCount(ledger.filter((entry) => entry.sourceKind === definition.sourceKind));
            const latest = await tx.achievementAward.findFirst({
                where: { userId, clubId: scope.clubId, achievementDefinitionId: definition.id },
                orderBy: { createdAt: 'desc' },
            });
            const desired: AchievementAwardState | null =
                count >= definition.thresholdCount
                    ? latest?.state === 'REVOKED'
                        ? 'REINSTATED'
                        : latest === null
                          ? 'EARNED'
                          : null
                    : latest !== null && latest.state !== 'REVOKED'
                      ? 'REVOKED'
                      : null;
            if (desired === null) continue;
            const source = [...ledger]
                .reverse()
                .find((entry) => entry.sourceKind === definition.sourceKind && entry.status === 'POSTED');
            if (source === undefined) continue;
            const created = await tx.achievementAward.create({
                data: {
                    id: uuidV7(),
                    userId,
                    clubId: scope.clubId,
                    achievementDefinitionId: definition.id,
                    state: desired,
                    qualifyingCount: Math.max(1, count),
                    sourceLedgerEntryId: source.id,
                    supersedesAwardId: latest?.id ?? null,
                },
            });
            await this.outbox.enqueue(tx, {
                type: 'gamification.achievement-award.changed.v1',
                schemaVersion: 1,
                payload: {
                    messageId: uuidV7(),
                    type: 'gamification.achievement-award.changed.v1',
                    occurredAt: created.createdAt.toISOString(),
                    correlationId: uuidV7(),
                    causationId: null,
                    data: { achievementAwardId: created.id, state: created.state },
                },
                correlationId: uuidV7(),
                occurredAt: created.createdAt,
            });
        }
    }

    private async capCount(
        tx: Prisma.TransactionClient,
        award: DesiredAward,
        from: Date,
        until: Date
    ): Promise<number> {
        return tx.xpLedgerEntry.count({
            where: {
                userId: award.userId,
                scopeKind: award.scope.kind,
                clubId: award.scope.clubId,
                sourceKind: award.sourceKind,
                kind: 'AWARD',
                status: { not: 'CAPPED' },
                sourceOccurredAt: { gte: from, lt: until },
            },
        });
    }
    private net(entries: readonly XpLedgerEntry[]): bigint {
        const value = entries.reduce(
            (sum, entry) =>
                entry.status !== 'POSTED'
                    ? sum
                    : sum + BigInt(entry.kind === 'REVERSAL' ? -entry.amount : entry.amount),
            0n
        );
        return value < 0n ? 0n : value;
    }
    private async levelFor(
        tx: Prisma.TransactionClient,
        scopeKind: GamificationScopeKind,
        clubId: string | null,
        version: string,
        xp: bigint
    ) {
        const levels = await tx.levelDefinition.findMany({
            where: { scopeKind, clubId, version },
            orderBy: { ordinal: 'asc' },
        });
        const level = [...levels].reverse().find((item) => item.thresholdXp <= xp);
        if (level === undefined) throw new Error('Season level snapshot is missing');
        return level;
    }

    private async leaderboardEligible(
        tx: Prisma.TransactionClient,
        userId: string,
        scopeKind: GamificationScopeKind,
        clubId: string | null,
        now: Date
    ): Promise<boolean> {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
        if (user?.status !== 'ACTIVE') return false;
        const restricted = await tx.userRestriction.count({
            where: {
                userId,
                state: 'ACTIVE',
                scope: 'PLATFORM_ACCESS',
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
        });
        if (restricted > 0) return false;
        if (scopeKind === 'GLOBAL' || clubId === null) return true;
        const [membership, blocked] = await Promise.all([
            tx.clubMembership.count({ where: { clubId, userId, state: 'ACTIVE' } }),
            tx.clubBlock.count({ where: { clubId, userId, state: 'ACTIVE' } }),
        ]);
        return membership > 0 && blocked === 0;
    }
    private async receipt(
        tx: Prisma.TransactionClient,
        messageId: string,
        eventType: string,
        sourceEventId: string,
        sourceRevision: number,
        payloadHash: string,
        outcome: string
    ): Promise<void> {
        await tx.processedGamificationEvent.create({
            data: { messageId, eventType, sourceEventId, sourceRevision, payloadHash, outcome },
        });
    }
    private async emitLedger(tx: Prisma.TransactionClient, ledgerEntryId: string, occurredAt: Date): Promise<void> {
        const correlationId = uuidV7();
        const entry = await tx.xpLedgerEntry.findUniqueOrThrow({ where: { id: ledgerEntryId } });
        const outcome =
            entry.kind === 'REVERSAL' ? 'REVERSED' : entry.kind === 'REINSTATEMENT' ? 'REINSTATED' : entry.status;
        await this.outbox.enqueue(tx, {
            type: 'gamification.xp-ledger-entry.recorded.v1',
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type: 'gamification.xp-ledger-entry.recorded.v1',
                occurredAt: occurredAt.toISOString(),
                correlationId,
                causationId: null,
                data: { ledgerEntryId, projectionRevision: occurredAt.getTime(), outcome },
            },
            correlationId,
            occurredAt,
        });
    }
}

function startOfUtcDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
function startOfUtcWeek(value: Date): Date {
    const day = startOfUtcDay(value);
    const offset = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - offset);
    return day;
}
function endOfUtcDay(value: Date): Date {
    const end = startOfUtcDay(value);
    end.setUTCDate(end.getUTCDate() + 1);
    return end;
}
function endOfUtcWeek(value: Date): Date {
    const end = startOfUtcWeek(value);
    end.setUTCDate(end.getUTCDate() + 7);
    return end;
}
function netValidCount(entries: readonly XpLedgerEntry[]): number {
    const bySource = new Map<string, number>();
    for (const entry of entries) {
        if (entry.status !== 'POSTED') continue;
        bySource.set(
            entry.sourceEventId,
            (bySource.get(entry.sourceEventId) ?? 0) + (entry.kind === 'REVERSAL' ? -1 : 1)
        );
    }
    return [...bySource.values()].filter((value) => value > 0).length;
}
function entriesRevision(rows: readonly unknown[]): number {
    return rows.length;
}
