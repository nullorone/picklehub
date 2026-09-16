import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type GameMode, type PrismaClient } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { OutboxService } from '../outbox/outbox.service';
import type { MiniGameActor } from './mini-game-auth.service';
import { MiniGameMode, type CreateGameSessionDto, type SubmitGameResultDto } from './mini-game.dto';
import { miniGameError } from './mini-game.errors';
import { MiniGameCryptoService } from './mini-game-crypto.service';
import { MiniGameMetricsService } from './mini-game-metrics.service';
import { plus, startOfUtcDay, validateGameResult } from './mini-game-policy';

type Transaction = Prisma.TransactionClient;

interface ChallengeClaims {
    v: number;
    s: string;
    t: string;
    u: string;
    c: string;
    q: string;
    e: string;
    m: GameMode;
    i: number;
    x: number;
    n: string;
}

interface ResultClaims {
    v: number;
    r: string;
    u: string;
    e: string;
    q: string;
    a: number;
    x: number;
}

const RETENTION_MS = 114 * 86_400_000;

@Injectable()
export class MiniGameService {
    private rewardsEnabled: boolean;

    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: MiniGameCryptoService,
        private readonly outbox: OutboxService,
        private readonly metrics: MiniGameMetricsService,
        private readonly audit: AuditService,
        private readonly requestContext: RequestContextService,
        @Inject(ENVIRONMENT) private readonly environment: Environment
    ) {
        this.rewardsEnabled = environment.MINI_GAME_REWARDS_ENABLED === 'true';
    }

    async createSession(actor: MiniGameActor, input: CreateGameSessionDto, tx: Transaction): Promise<object> {
        this.assertEligible(actor);
        this.assertRewardsEnabled();
        const now = new Date();
        const day = startOfUtcDay(now);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.userId}:${day.toISOString()}:issue`}, 0))`;
        const issued = await tx.gameSession.count({ where: { userId: actor.userId, dailyWindowStartedAt: day } });
        if (issued >= this.environment.MINI_GAME_DAILY_SESSION_LIMIT) throw miniGameError('RATE_LIMITED', 429);
        const [configuration, season] = await Promise.all([
            tx.gameConfiguration.findUnique({
                where: { version_mode: { version: input.configurationVersion, mode: input.mode } },
            }),
            tx.gameSeason.findFirst({ where: { startsAt: { lte: now }, endsAt: { gt: now } } }),
        ]);
        if (configuration === null || season === null || season.configurationVersion !== input.configurationVersion) {
            throw miniGameError('GAME_SEASON_NOT_FOUND', 404);
        }
        const sessionId = uuidV7();
        const taskId = uuidV7();
        const expiresAt = plus(now, 15 * 60_000);
        const challengeProof = this.crypto.sign('mgc1_', {
            v: 1,
            s: compactId(sessionId),
            t: compactId(taskId),
            u: compactId(actor.userId),
            c: compactId(configuration.id),
            q: configuration.version,
            e: compactId(season.id),
            m: configuration.mode,
            i: now.getTime(),
            x: expiresAt.getTime(),
            n: this.crypto.secret(),
        } satisfies ChallengeClaims);
        await tx.gameSession.create({
            data: {
                id: sessionId,
                userId: actor.userId,
                configurationId: configuration.id,
                seasonId: season.id,
                taskId,
                mode: configuration.mode,
                challengeHash: this.crypto.hash('CHALLENGE', challengeProof),
                signatureKeyVersion: 1,
                dailyWindowStartedAt: day,
                issuedAt: now,
                expiresAt,
            },
        });
        return {
            id: sessionId,
            state: 'ISSUED',
            task: {
                id: taskId,
                configurationId: configuration.id,
                configurationVersion: configuration.version,
                seasonId: season.id,
                mode: configuration.mode,
                dailyWindowStartedAt: day.toISOString(),
                dailyWindowEndsAt: plus(day, 86_400_000).toISOString(),
            },
            configuration: this.configuration(configuration),
            challengeProof,
            issuedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            resultSubmissionLimit: 1,
        };
    }

    async submitResult(
        actor: MiniGameActor,
        sessionId: string,
        input: SubmitGameResultDto,
        tx: Transaction
    ): Promise<object> {
        this.assertEligible(actor);
        this.assertRewardsEnabled();
        const claims = this.crypto.verify('mgc1_', input.challengeProof) as ChallengeClaims | null;
        if (
            claims === null ||
            claims.v !== 1 ||
            claims.s !== compactId(sessionId) ||
            claims.u !== compactId(actor.userId)
        ) {
            this.metrics.increment('result.impossible');
            throw miniGameError('GAME_CHALLENGE_INVALID', 422);
        }
        const now = new Date();
        await tx.$queryRaw`SELECT id FROM game_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
        const session = await tx.gameSession.findUnique({ where: { id: sessionId } });
        if (
            session === null ||
            session.userId !== actor.userId ||
            compactId(session.taskId) !== claims.t ||
            compactId(session.configurationId) !== claims.c ||
            compactId(session.seasonId) !== claims.e ||
            configurationBindingMismatch(session.mode, claims.m) ||
            session.challengeHash !== this.crypto.hash('CHALLENGE', input.challengeProof)
        ) {
            this.metrics.increment('result.impossible');
            throw miniGameError('GAME_CHALLENGE_INVALID', 422);
        }
        if (session.state !== 'ISSUED') throw miniGameError('GAME_SESSION_TERMINAL', 409);
        if (session.expiresAt < now || claims.x < now.getTime()) {
            await tx.gameSession.update({ where: { id: session.id }, data: { state: 'EXPIRED', terminalAt: now } });
            throw miniGameError('GAME_CHALLENGE_EXPIRED', 410);
        }
        const nonceHash = this.crypto.hash('RESULT_NONCE', input.nonce);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mini-game:nonce:${nonceHash}`}, 0))`;
        if ((await tx.processedGameNonce.findUnique({ where: { nonceHash } })) !== null) {
            throw miniGameError('RESULT_NONCE_REUSED', 409);
        }
        const configuration = await tx.gameConfiguration.findUniqueOrThrow({ where: { id: session.configurationId } });
        if (
            claims.q !== configuration.version ||
            claims.i !== session.issuedAt.getTime() ||
            claims.x !== session.expiresAt.getTime()
        ) {
            this.metrics.increment('result.impossible');
            throw miniGameError('GAME_CHALLENGE_INVALID', 422);
        }
        const invalidReason = validateGameResult(input, {
            mode: session.mode as MiniGameMode,
            configurationVersion: configuration.version,
        });
        if (invalidReason === null) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.userId}:${session.dailyWindowStartedAt.toISOString()}:accepted`}, 0))`;
            const accepted = await tx.gameResult.count({
                where: {
                    userId: actor.userId,
                    outcome: 'ACCEPTED',
                    acceptedAt: {
                        gte: session.dailyWindowStartedAt,
                        lt: plus(session.dailyWindowStartedAt, 86_400_000),
                    },
                },
            });
            if (accepted >= this.environment.MINI_GAME_DAILY_RESULT_LIMIT) throw miniGameError('RATE_LIMITED', 429);
        }
        const receiptId = uuidV7();
        const acceptedAt = invalidReason === null ? now : null;
        const claimExpiresAt = acceptedAt === null ? null : plus(acceptedAt, 24 * 60 * 60_000);
        const resultProof =
            acceptedAt === null || claimExpiresAt === null
                ? null
                : this.crypto.sign('mgr1_', {
                      v: 1,
                      r: compactId(receiptId),
                      u: compactId(actor.userId),
                      e: compactId(session.seasonId),
                      q: configuration.version,
                      a: acceptedAt.getTime(),
                      x: claimExpiresAt.getTime(),
                  } satisfies ResultClaims);
        const requestHash = this.crypto.hash('RESULT_REQUEST', JSON.stringify(this.resultFingerprint(input)));
        const stored =
            invalidReason === null
                ? input
                : {
                      mode: session.mode,
                      configurationVersion: configuration.version,
                      activeDurationMilliseconds:
                          session.mode === 'STANDARD' ? 90_000 : Math.max(1, input.activeDurationMilliseconds),
                      counters: {
                          attempts: session.mode === 'CALM' ? 20 : 1,
                          successfulReturns: 0,
                          targetHits: 0,
                          streakBonuses: 0,
                          leftTargetHits: 0,
                          centerTargetHits: 0,
                          rightTargetHits: 0,
                      },
                  };
        await tx.gameResult.create({
            data: {
                id: receiptId,
                sessionId,
                userId: actor.userId,
                taskId: session.taskId,
                outcome: invalidReason === null ? 'ACCEPTED' : 'REJECTED',
                reasonCode: invalidReason ?? 'NONE',
                mode: stored.mode,
                configurationVersion: stored.configurationVersion,
                activeDurationMilliseconds: stored.activeDurationMilliseconds,
                pausedDurationMilliseconds: input.pausedDurationMilliseconds,
                attempts: stored.counters.attempts,
                successfulReturns: stored.counters.successfulReturns,
                targetHits: stored.counters.targetHits,
                streakBonuses: stored.counters.streakBonuses,
                leftTargetHits: stored.counters.leftTargetHits,
                centerTargetHits: stored.counters.centerTargetHits,
                rightTargetHits: stored.counters.rightTargetHits,
                resultProofHash: resultProof === null ? null : this.crypto.hash('RESULT_PROOF', resultProof),
                acceptedAt,
                rewardClaimExpiresAt: claimExpiresAt,
                retentionExpiresAt: plus(now, RETENTION_MS),
                createdAt: now,
            },
        });
        await Promise.all([
            tx.processedGameTask.create({
                data: {
                    taskId: session.taskId,
                    sessionId,
                    receiptId,
                    payloadHash: requestHash,
                    processedAt: now,
                    expiresAt: plus(now, 24 * 60 * 60_000),
                },
            }),
            tx.processedGameNonce.create({
                data: {
                    nonceHash,
                    sessionId,
                    receiptId,
                    requestHash,
                    processedAt: now,
                    expiresAt: plus(now, 24 * 60 * 60_000),
                },
            }),
            tx.gameSession.update({
                where: { id: sessionId },
                data: { state: invalidReason === null ? 'COMPLETED' : 'REJECTED', terminalAt: now },
            }),
        ]);
        await this.emit(tx, 'mini-game.result.recorded.v1', now, {
            receiptId,
            outcome: invalidReason === null ? 'ACCEPTED' : 'REJECTED',
        });
        this.metrics.increment(invalidReason === null ? 'result.accepted' : 'result.impossible');
        return {
            id: receiptId,
            sessionId,
            taskId: session.taskId,
            outcome: invalidReason === null ? 'ACCEPTED' : 'REJECTED',
            reason: invalidReason ?? 'NONE',
            mode: session.mode,
            configurationVersion: configuration.version,
            resultProof,
            acceptedAt: acceptedAt?.toISOString() ?? null,
            rewardClaimExpiresAt: claimExpiresAt?.toISOString() ?? null,
        };
    }

    async progress(userId: string): Promise<object> {
        const now = new Date();
        const season = await this.prisma.gameSeason.findFirst({
            where: { startsAt: { lte: now }, endsAt: { gt: now } },
        });
        if (season === null) throw miniGameError('GAME_SEASON_NOT_FOUND', 404);
        return this.progressFor(this.prisma, userId, season.id, now);
    }

    async setRewardsEnabled(enabled: boolean, actorId: string, reasonCode: string): Promise<void> {
        if (this.rewardsEnabled === enabled) return;
        await this.prisma.$transaction(async (tx) => {
            const context = this.requestContext.get();
            await this.audit.append(tx, {
                actorType: 'ADMIN',
                actorId,
                action: enabled ? 'MINI_GAME_REWARDS_ENABLED' : 'MINI_GAME_REWARDS_DISABLED',
                targetType: 'MINI_GAME_REWARD_POLICY',
                outcome: 'APPLIED',
                reasonCode,
                policyVersion: '1.0.0',
                changedFields: { rewardsEnabled: enabled },
                requestId: context?.requestId ?? uuidV7(),
                correlationId: context?.correlationId ?? uuidV7(),
                source: 'BACKEND',
            });
        });
        this.rewardsEnabled = enabled;
    }

    async progressFor(
        db: Transaction | PrismaClient | PrismaService,
        userId: string,
        seasonId: string,
        now: Date
    ): Promise<object> {
        const season = await db.gameSeason.findUniqueOrThrow({ where: { id: seasonId } });
        const day = startOfUtcDay(now);
        const [grants, unlocks] = await Promise.all([
            db.rewardGrant.findMany({ where: { userId, seasonId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
            db.cosmeticUnlock.findMany({
                where: { userId, seasonId },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            }),
        ]);
        const activeGrants = grants.filter((grant) => grant.state === 'GRANTED' || grant.state === 'REINSTATED');
        const reversed = new Set(
            grants.filter((grant) => grant.state === 'REVERSED').map((grant) => grant.compensationOfGrantId)
        );
        const marks = activeGrants.filter((grant) => grant.kind === 'PRACTICE_MARK' && !reversed.has(grant.id));
        const distinctDays = new Set(
            marks
                .filter((grant) => grant.goalCode === 'DAILY_WARM_UP')
                .map((grant) => grant.windowStartedAt.toISOString())
        ).size;
        const goals = ['DAILY_WARM_UP', 'DAILY_ACCURACY', 'DAILY_DIRECTIONS'].map((code) => {
            const current = marks.filter((grant) => grant.goalCode === code && grant.windowStartedAt >= day).length;
            return {
                code,
                state: current > 0 ? 'COMPLETED' : 'INCOMPLETE',
                current,
                target: 1,
                practiceMarksGranted: current,
            };
        });
        const cosmeticRules = [
            ['SEASON_CARD_BACKGROUND', 'DISTINCT_COMPLETION_DAYS', distinctDays, 5],
            ['BALL_COLOR', 'PRACTICE_MARKS', marks.length, 30],
            ['BALL_TRAIL', 'DISTINCT_COMPLETION_DAYS', distinctDays, 20],
            ['GAME_PROFILE_FRAME', 'PRACTICE_MARKS', marks.length, 60],
        ] as const;
        return {
            season: {
                id: season.id,
                version: season.version,
                startsAt: season.startsAt.toISOString(),
                endsAt: season.endsAt.toISOString(),
                state: now < season.startsAt ? 'SCHEDULED' : now >= season.endsAt ? 'CLOSED' : 'ACTIVE',
            },
            distinctCompletionDays: distinctDays,
            practiceMarks: marks.length,
            goals,
            cosmetics: cosmeticRules.map(([code, criterion, current, target]) => {
                const unlock = [...unlocks].reverse().find((item) => item.cosmeticCode === code);
                return {
                    code,
                    criterion,
                    current,
                    target,
                    state: unlock === undefined ? 'LOCKED' : unlock.state === 'REVOKED' ? 'REVOKED' : 'UNLOCKED',
                    unlock: unlock === undefined ? null : this.unlock(unlock),
                };
            }),
        };
    }

    resultClaims(proof: string): ResultClaims | null {
        return this.crypto.verify('mgr1_', proof) as ResultClaims | null;
    }

    private assertEligible(actor: MiniGameActor): void {
        if (actor.identity.session.user.completedAt === null) throw miniGameError('ONBOARDING_REQUIRED', 403);
    }

    private assertRewardsEnabled(): void {
        if (!this.rewardsEnabled) {
            this.metrics.increment('reward.unavailable');
            throw miniGameError('GAME_REWARDS_UNAVAILABLE', 503);
        }
    }

    private configuration(configuration: {
        id: string;
        version: string;
        mode: GameMode;
        activeDurationMilliseconds: number | null;
        turnCount: number | null;
        pauseResumeTtlSeconds: number;
        publishedAt: Date;
    }): object {
        return {
            id: configuration.id,
            version: configuration.version,
            mode: configuration.mode,
            activeDurationMilliseconds: configuration.activeDurationMilliseconds,
            turnCount: configuration.turnCount,
            pauseResumeTtlSeconds: configuration.pauseResumeTtlSeconds,
            directions: ['LEFT', 'CENTER', 'RIGHT'],
            scoreFormula: {
                successfulReturnPoints: 10,
                targetDirectionPoints: 5,
                streakLength: 5,
                streakBonusPoints: 10,
            },
            publishedAt: configuration.publishedAt.toISOString(),
        };
    }

    private resultFingerprint(input: SubmitGameResultDto): object {
        return {
            configurationVersion: input.configurationVersion,
            mode: input.mode,
            activeDurationMilliseconds: input.activeDurationMilliseconds,
            pausedDurationMilliseconds: input.pausedDurationMilliseconds,
            counters: input.counters,
        };
    }

    private unlock(unlock: {
        id: string;
        seasonId: string;
        cosmeticCode: string;
        state: string;
        sourceGrantId: string;
        createdAt: Date;
    }): object {
        return {
            id: unlock.id,
            seasonId: unlock.seasonId,
            code: unlock.cosmeticCode,
            state: unlock.state,
            unlockedByGrantId: unlock.sourceGrantId,
            changedAt: unlock.createdAt.toISOString(),
        };
    }

    async emit(tx: Transaction, type: string, occurredAt: Date, data: Prisma.InputJsonObject): Promise<void> {
        const correlationId = uuidV7();
        await this.outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: occurredAt.toISOString(),
                correlationId,
                causationId: null,
                data,
            },
            correlationId,
            occurredAt,
        });
    }
}

function compactId(value: string): string {
    return value.replaceAll('-', '');
}

function configurationBindingMismatch(actual: GameMode, claimed: GameMode): boolean {
    return actual !== claimed;
}
