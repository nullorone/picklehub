import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { MatchFormat, Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { Clock } from '../identity/clock';
import { OutboxService } from '../outbox/outbox.service';

type Transaction = Prisma.TransactionClient;
type Database = Transaction | PrismaService;

const EMPTY_CHECKSUM = createHash('sha256').update('').digest('hex');
const GLOBAL_PROJECTION_LOCK = 6_542_093_177;

interface SourceProjection {
    playerId: string;
    format: MatchFormat;
    outcome: 'PLAYED_WITHOUT_SCORE' | 'WON' | 'LOST' | 'EXCLUDED';
    gamesPlayed: number;
    pointsFor: number;
    pointsAgainst: number;
    markerId: string | null;
    confirmedAt: Date | null;
    checksum: string;
}

@Injectable()
export class ProfileProjectionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly clock: Clock,
        private readonly audit: AuditService,
        private readonly outbox: OutboxService,
        private readonly context: RequestContextService
    ) {}

    async consume(eventId: string, sourceType: string, sourceId: string, sourceRevision: bigint): Promise<void> {
        await this.withSerializableRetry(async () => {
            await this.prisma.$transaction(
                async (transaction) => {
                    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${GLOBAL_PROJECTION_LOCK})`;
                    const generationId = await this.ensureActiveGeneration(transaction);
                    await this.projectMatch(transaction, generationId, sourceId, sourceRevision);
                    await transaction.profileProjectionEventReceipt.createMany({
                        data: [{ consumerKey: 'profile-statistics-v1', eventId, sourceType, sourceId, sourceRevision }],
                        skipDuplicates: true,
                    });
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            );
        });
    }

    async consumeSafetyEffect(eventId: string, effectId: string): Promise<void> {
        await this.withSerializableRetry(() =>
            this.prisma.$transaction(
                async (transaction) => {
                    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${GLOBAL_PROJECTION_LOCK})`;
                    const alreadyProcessed = await transaction.profileProjectionEventReceipt.findUnique({
                        where: { consumerKey_eventId: { consumerKey: 'profile-statistics-v1', eventId } },
                    });
                    if (alreadyProcessed !== null) return;
                    const effect = await transaction.moderationEffect.findUnique({
                        where: { id: effectId },
                        include: { decision: true },
                    });
                    if (
                        effect === null ||
                        effect.kind !== 'NO_SHOW_CONFIRMED' ||
                        effect.noShowMatchId === null ||
                        effect.noShowSubjectId === null
                    ) {
                        return;
                    }
                    const generationId = await this.ensureActiveGeneration(transaction);
                    if (effect.state === 'RETRACTION_PENDING') {
                        await transaction.playerReliabilityContribution.deleteMany({
                            where: {
                                generationId,
                                matchId: effect.noShowMatchId,
                                playerId: effect.noShowSubjectId,
                                kind: 'CONFIRMED_NO_SHOW',
                            },
                        });
                    } else if (effect.state === 'PENDING') {
                        await transaction.playerReliabilityContribution.upsert({
                            where: {
                                generationId_matchId_playerId_kind: {
                                    generationId,
                                    matchId: effect.noShowMatchId,
                                    playerId: effect.noShowSubjectId,
                                    kind: 'CONFIRMED_NO_SHOW',
                                },
                            },
                            create: {
                                generationId,
                                matchId: effect.noShowMatchId,
                                playerId: effect.noShowSubjectId,
                                kind: 'CONFIRMED_NO_SHOW',
                                eligibilityRevision: effect.sourceRevision,
                                sourceDecisionId: effect.decisionId,
                                occurredAt: effect.decision.createdAt,
                            },
                            update: {
                                eligibilityRevision: effect.sourceRevision,
                                sourceDecisionId: effect.decisionId,
                                occurredAt: effect.decision.createdAt,
                                appliedAt: this.clock.now(),
                            },
                        });
                    } else {
                        return;
                    }
                    await this.recalculateReliability(transaction, generationId, effect.noShowSubjectId);
                    await transaction.moderationEffect.updateMany({
                        where: { id: effectId, state: effect.state },
                        data:
                            effect.state === 'RETRACTION_PENDING'
                                ? { state: 'RETRACTED', retractedAt: this.clock.now() }
                                : { state: 'APPLIED', appliedAt: this.clock.now() },
                    });
                    await transaction.profileProjectionEventReceipt.create({
                        data: {
                            consumerKey: 'profile-statistics-v1',
                            eventId,
                            sourceType: 'safety.effect.requested.v1',
                            sourceId: effectId,
                            sourceRevision: effect.sourceRevision,
                        },
                    });
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            )
        );
    }

    async rebuild(
        reason: 'MANUAL' | 'RECONCILIATION' | 'SCHEMA_CHANGE' | 'ACCOUNT_DELETION' = 'MANUAL'
    ): Promise<string> {
        const snapshotCutoff = this.clock.now();
        let generation = await this.prisma.profileProjectionGeneration.findFirst({
            where: { state: 'BUILDING' },
            orderBy: { createdAt: 'asc' },
        });
        if (generation === null) {
            const revision = await this.maximumMatchRevision(this.prisma);
            generation = await this.prisma.profileProjectionGeneration.create({
                data: {
                    id: uuidV7(),
                    snapshotCutoff,
                    snapshotRevision: revision,
                    contributionChecksum: EMPTY_CHECKSUM,
                },
            });
            await this.emitRebuildEvent('profile.statistics.rebuild.requested.v1', generation.id, revision, {
                reason,
            });
        }
        const activeGeneration = generation;
        const generationCutoff = activeGeneration.snapshotCutoff;

        try {
            let cursor = activeGeneration.checkpointMatchId ?? undefined;
            do {
                const matches = await this.prisma.match.findMany({
                    where: { updatedAt: { lte: generationCutoff } },
                    orderBy: { id: 'asc' },
                    take: 101,
                    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
                    select: { id: true, version: true },
                });
                const batch = matches.slice(0, 100);
                for (const match of batch) {
                    await this.projectMatchTransaction(activeGeneration.id, match.id, BigInt(match.version));
                }
                const checkpoint = batch.at(-1)?.id;
                if (checkpoint !== undefined) {
                    await this.prisma.profileProjectionGeneration.update({
                        where: { id: activeGeneration.id },
                        data: { checkpointMatchId: checkpoint },
                    });
                }
                cursor = matches.length > 100 ? matches[99]?.id : undefined;
            } while (cursor !== undefined);

            await this.prisma.$transaction(
                async (transaction) => {
                    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${GLOBAL_PROJECTION_LOCK})`;
                    const changed = await transaction.match.findMany({
                        where: { updatedAt: { gt: generationCutoff } },
                        orderBy: { id: 'asc' },
                        select: { id: true, version: true },
                    });
                    for (const match of changed) {
                        await this.projectMatch(transaction, activeGeneration.id, match.id, BigInt(match.version));
                    }
                    const noShows = await transaction.moderationEffect.findMany({
                        where: {
                            kind: 'NO_SHOW_CONFIRMED',
                            state: 'APPLIED',
                            noShowMatchId: { not: null },
                            noShowSubjectId: { not: null },
                        },
                        include: { decision: true },
                    });
                    const affectedReliability = new Set<string>();
                    for (const effect of noShows) {
                        if (effect.noShowMatchId === null || effect.noShowSubjectId === null) continue;
                        await transaction.playerReliabilityContribution.upsert({
                            where: {
                                generationId_matchId_playerId_kind: {
                                    generationId: activeGeneration.id,
                                    matchId: effect.noShowMatchId,
                                    playerId: effect.noShowSubjectId,
                                    kind: 'CONFIRMED_NO_SHOW',
                                },
                            },
                            create: {
                                generationId: activeGeneration.id,
                                matchId: effect.noShowMatchId,
                                playerId: effect.noShowSubjectId,
                                kind: 'CONFIRMED_NO_SHOW',
                                eligibilityRevision: effect.sourceRevision,
                                sourceDecisionId: effect.decisionId,
                                occurredAt: effect.decision.createdAt,
                            },
                            update: {
                                eligibilityRevision: effect.sourceRevision,
                                sourceDecisionId: effect.decisionId,
                                occurredAt: effect.decision.createdAt,
                            },
                        });
                        affectedReliability.add(effect.noShowSubjectId);
                    }
                    for (const playerId of affectedReliability) {
                        await this.recalculateReliability(transaction, activeGeneration.id, playerId);
                    }
                    const checksum = await transaction.$queryRaw<{ count: bigint; checksum: string }[]>(Prisma.sql`
                        SELECT count(*)::bigint AS count,
                            encode(digest(coalesce(string_agg(
                                match_id::text || ':' || player_id::text || ':' || eligibility_revision::text || ':' ||
                                source_checksum, ',' ORDER BY match_id, player_id), ''), 'sha256'), 'hex') AS checksum
                        FROM player_statistic_contributions
                        WHERE generation_id = ${activeGeneration.id}::uuid AND outcome <> 'EXCLUDED'`);
                    const calculated = checksum[0] ?? { count: 0n, checksum: EMPTY_CHECKSUM };
                    const now = this.clock.now();
                    await transaction.profileProjectionGeneration.update({
                        where: { id: activeGeneration.id },
                        data: {
                            contributionCount: calculated.count,
                            contributionChecksum: calculated.checksum,
                            state: 'READY',
                            readyAt: now,
                        },
                    });
                    await transaction.profileProjectionGeneration.updateMany({
                        where: { state: 'ACTIVE' },
                        data: { state: 'SUPERSEDED' },
                    });
                    await transaction.profileProjectionGeneration.update({
                        where: { id: activeGeneration.id },
                        data: { state: 'ACTIVE', activatedAt: now },
                    });
                    const request = this.context.get();
                    await this.audit.append(transaction, {
                        actorType: 'SYSTEM',
                        action: 'profile.statistics.rebuilt',
                        targetType: 'profile_projection_generation',
                        targetId: activeGeneration.id,
                        outcome: 'SUCCESS',
                        reasonCode: reason,
                        changedFields: { fields: ['state', 'snapshotRevision', 'contributionChecksum'] },
                        requestId: request?.requestId ?? uuidV7(),
                        correlationId: request?.correlationId ?? uuidV7(),
                        source: 'profile-rebuild',
                    });
                    await this.enqueueRebuildEvent(
                        transaction,
                        'profile.statistics.rebuild.completed.v1',
                        activeGeneration.id,
                        {
                            snapshotRevision: Number(activeGeneration.snapshotRevision),
                            outcome: 'ACTIVATED',
                        }
                    );
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            );
            return activeGeneration.id;
        } catch (error) {
            await this.prisma.profileProjectionGeneration.updateMany({
                where: { id: activeGeneration.id, state: { in: ['BUILDING', 'READY'] } },
                data: { state: 'FAILED', failedAt: this.clock.now(), failureCode: 'REBUILD_FAILED' },
            });
            throw error;
        }
    }

    private async projectMatchTransaction(generationId: string, matchId: string, revision: bigint): Promise<void> {
        await this.withSerializableRetry(() =>
            this.prisma.$transaction((transaction) => this.projectMatch(transaction, generationId, matchId, revision), {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            })
        );
    }

    private async projectMatch(
        transaction: Transaction,
        generationId: string,
        matchId: string,
        suppliedRevision: bigint
    ): Promise<void> {
        const match = await transaction.match.findUnique({
            where: { id: matchId },
            include: {
                participants: { select: { userId: true, team: true, state: true, isOrganizer: true } },
                results: { where: { state: 'CONFIRMED' }, include: { games: { orderBy: { gameNumber: 'asc' } } } },
                metricMarkers: { where: { metricType: 'CONFIRMED_MATCH' } },
            },
        });
        if (match === null) return;
        const revision = BigInt(match.version);
        if (revision < suppliedRevision)
            throw new Error('Projection event revision is ahead of the authoritative match');
        const existing = await transaction.playerStatisticContribution.findMany({
            where: { generationId, matchId },
        });
        const prior = new Map(existing.map((item) => [item.playerId, item]));
        const result = match.results[0];
        const marker =
            result === undefined ? undefined : match.metricMarkers.find((item) => item.resultId === result.id);
        const eligible =
            match.state === 'COMPLETED' && match.format !== null && result !== undefined && marker !== undefined;
        const players = new Set([
            ...existing.map((item) => item.playerId),
            ...match.participants.map((item) => item.userId),
        ]);
        const affected = new Set<string>();

        for (const playerId of players) {
            const participant = match.participants.find((item) => item.userId === playerId);
            const previous = prior.get(playerId);
            if (previous !== undefined && previous.eligibilityRevision > revision) continue;
            const included = eligible && participant?.state === 'PLAYED';
            const format = match.format ?? previous?.format;
            if (format === undefined) continue;
            const source = this.sourceProjection(
                playerId,
                format,
                included ? participant.team : undefined,
                result,
                marker
            );
            if (previous !== undefined && previous.eligibilityRevision === revision) {
                if (previous.sourceChecksum !== source.checksum) {
                    throw new Error('Same profile eligibility revision resolved to a different source payload');
                }
                continue;
            }
            await transaction.playerStatisticContribution.upsert({
                where: { generationId_matchId_playerId: { generationId, matchId, playerId } },
                create: {
                    generationId,
                    matchId,
                    playerId,
                    eligibilityRevision: revision,
                    markerId: source.markerId,
                    format: source.format,
                    outcome: source.outcome,
                    gamesPlayed: source.gamesPlayed,
                    pointsFor: source.pointsFor,
                    pointsAgainst: source.pointsAgainst,
                    confirmedAt: source.confirmedAt,
                    sourceChecksum: source.checksum,
                },
                update: {
                    eligibilityRevision: revision,
                    markerId: source.markerId,
                    format: source.format,
                    outcome: source.outcome,
                    gamesPlayed: source.gamesPlayed,
                    pointsFor: source.pointsFor,
                    pointsAgainst: source.pointsAgainst,
                    confirmedAt: source.confirmedAt,
                    sourceChecksum: source.checksum,
                },
            });
            affected.add(playerId);
        }
        for (const playerId of affected) await this.recalculate(transaction, generationId, playerId);
        const organizerContribution = await transaction.playerReliabilityContribution.findUnique({
            where: {
                generationId_matchId_playerId_kind: {
                    generationId,
                    matchId,
                    playerId: match.organizerId,
                    kind: 'ORGANIZED_SUCCESS',
                },
            },
        });
        const organizerPlayed = match.participants.some(
            (participant) => participant.userId === match.organizerId && participant.state === 'PLAYED'
        );
        if (eligible && organizerPlayed) {
            if (organizerContribution === null || organizerContribution.eligibilityRevision < revision) {
                await transaction.playerReliabilityContribution.upsert({
                    where: {
                        generationId_matchId_playerId_kind: {
                            generationId,
                            matchId,
                            playerId: match.organizerId,
                            kind: 'ORGANIZED_SUCCESS',
                        },
                    },
                    create: {
                        generationId,
                        matchId,
                        playerId: match.organizerId,
                        kind: 'ORGANIZED_SUCCESS',
                        eligibilityRevision: revision,
                        occurredAt: marker.confirmedAt,
                    },
                    update: { eligibilityRevision: revision, occurredAt: marker.confirmedAt },
                });
                await this.recalculateReliability(transaction, generationId, match.organizerId);
            }
        } else if (organizerContribution !== null && organizerContribution.eligibilityRevision <= revision) {
            await transaction.playerReliabilityContribution.delete({
                where: {
                    generationId_matchId_playerId_kind: {
                        generationId,
                        matchId,
                        playerId: match.organizerId,
                        kind: 'ORGANIZED_SUCCESS',
                    },
                },
            });
            await this.recalculateReliability(transaction, generationId, match.organizerId);
        }
    }

    private sourceProjection(
        playerId: string,
        format: MatchFormat,
        team: 'TEAM_A' | 'TEAM_B' | undefined,
        result:
            | {
                  mode: string;
                  winningTeam: 'TEAM_A' | 'TEAM_B' | null;
                  games: { teamAPoints: number; teamBPoints: number }[];
              }
            | undefined,
        marker: { id: string; confirmedAt: Date } | undefined
    ): SourceProjection {
        let outcome: SourceProjection['outcome'] = 'EXCLUDED';
        let pointsFor = 0;
        let pointsAgainst = 0;
        if (team !== undefined && result !== undefined && marker !== undefined) {
            outcome =
                result.mode === 'PLAYED_WITHOUT_SCORE'
                    ? 'PLAYED_WITHOUT_SCORE'
                    : result.winningTeam === team
                      ? 'WON'
                      : 'LOST';
            for (const game of result.games) {
                pointsFor += team === 'TEAM_A' ? game.teamAPoints : game.teamBPoints;
                pointsAgainst += team === 'TEAM_A' ? game.teamBPoints : game.teamAPoints;
            }
        }
        const value = {
            playerId,
            format,
            outcome,
            gamesPlayed: outcome === 'WON' || outcome === 'LOST' ? (result?.games.length ?? 0) : 0,
            pointsFor: outcome === 'WON' || outcome === 'LOST' ? pointsFor : 0,
            pointsAgainst: outcome === 'WON' || outcome === 'LOST' ? pointsAgainst : 0,
            markerId: outcome === 'EXCLUDED' ? null : (marker?.id ?? null),
            confirmedAt: outcome === 'EXCLUDED' ? null : (marker?.confirmedAt ?? null),
        };
        return { ...value, checksum: createHash('sha256').update(JSON.stringify(value)).digest('hex') };
    }

    private async recalculate(transaction: Transaction, generationId: string, playerId: string): Promise<void> {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${generationId}:${playerId}`}, 0))`;
        const contributions = await transaction.playerStatisticContribution.findMany({
            where: { generationId, playerId, outcome: { not: 'EXCLUDED' } },
        });
        const totals = (format?: MatchFormat) => {
            const rows = format === undefined ? contributions : contributions.filter((item) => item.format === format);
            return rows.reduce(
                (sum, item) => ({
                    played: sum.played + 1n,
                    wins: sum.wins + BigInt(item.outcome === 'WON' ? 1 : 0),
                    losses: sum.losses + BigInt(item.outcome === 'LOST' ? 1 : 0),
                    gamesPlayed: sum.gamesPlayed + BigInt(item.gamesPlayed),
                    pointsFor: sum.pointsFor + BigInt(item.pointsFor),
                    pointsAgainst: sum.pointsAgainst + BigInt(item.pointsAgainst),
                    lastConfirmedAt:
                        item.confirmedAt !== null &&
                        (sum.lastConfirmedAt === null || item.confirmedAt > sum.lastConfirmedAt)
                            ? item.confirmedAt
                            : sum.lastConfirmedAt,
                }),
                {
                    played: 0n,
                    wins: 0n,
                    losses: 0n,
                    gamesPlayed: 0n,
                    pointsFor: 0n,
                    pointsAgainst: 0n,
                    lastConfirmedAt: null as Date | null,
                }
            );
        };
        const now = this.clock.now();
        const slices = [
            { slice: 'SINGLES' as const, ...totals('SINGLES') },
            { slice: 'DOUBLES' as const, ...totals('DOUBLES') },
            { slice: 'ALL' as const, ...totals() },
        ];
        await transaction.playerStatisticAggregate.deleteMany({ where: { generationId, playerId } });
        await transaction.playerStatisticAggregate.createMany({
            data: slices.map((slice) => ({ generationId, playerId, ...slice, calculatedAt: now })),
        });
    }

    private async recalculateReliability(
        transaction: Transaction,
        generationId: string,
        playerId: string
    ): Promise<void> {
        const grouped = await transaction.playerReliabilityContribution.groupBy({
            by: ['kind'],
            where: { generationId, playerId },
            _count: { _all: true },
        });
        const count = (kind: string) => BigInt(grouped.find((item) => item.kind === kind)?._count._all ?? 0);
        await transaction.playerReliabilityAggregate.upsert({
            where: { generationId_playerId: { generationId, playerId } },
            create: {
                generationId,
                playerId,
                organizedSuccesses: count('ORGANIZED_SUCCESS'),
                organizedFailures: count('ORGANIZED_FAILURE'),
                confirmedNoShows: count('CONFIRMED_NO_SHOW'),
                calculatedAt: this.clock.now(),
            },
            update: {
                organizedSuccesses: count('ORGANIZED_SUCCESS'),
                organizedFailures: count('ORGANIZED_FAILURE'),
                confirmedNoShows: count('CONFIRMED_NO_SHOW'),
                calculatedAt: this.clock.now(),
            },
        });
    }

    private async ensureActiveGeneration(transaction: Transaction): Promise<string> {
        const active = await transaction.profileProjectionGeneration.findFirst({ where: { state: 'ACTIVE' } });
        if (active !== null) return active.id;
        const now = this.clock.now();
        return (
            await transaction.profileProjectionGeneration.create({
                data: {
                    id: uuidV7(),
                    state: 'ACTIVE',
                    snapshotCutoff: now,
                    snapshotRevision: 0n,
                    contributionChecksum: EMPTY_CHECKSUM,
                    readyAt: now,
                    activatedAt: now,
                },
            })
        ).id;
    }

    private async maximumMatchRevision(database: Database): Promise<bigint> {
        const row = await database.match.aggregate({ _max: { version: true } });
        return BigInt(row._max.version ?? 0);
    }

    private async emitRebuildEvent(
        type: string,
        generationId: string,
        revision: bigint,
        data: Record<string, string | number>
    ): Promise<void> {
        await this.prisma.$transaction((transaction) =>
            this.enqueueRebuildEvent(transaction, type, generationId, {
                snapshotRevision: Number(revision),
                ...data,
            })
        );
    }

    private async enqueueRebuildEvent(
        transaction: Transaction,
        type: string,
        generationId: string,
        data: Record<string, string | number>
    ): Promise<void> {
        const now = this.clock.now();
        await this.outbox.enqueue(transaction, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: now.toISOString(),
                correlationId: this.context.get()?.correlationId ?? uuidV7(),
                causationId: null,
                data: { generationId, ...data },
            },
            correlationId: this.context.get()?.correlationId ?? uuidV7(),
            occurredAt: now,
        });
    }

    private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await operation();
            } catch (error) {
                if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2)
                    throw error;
            }
        }
    }
}
