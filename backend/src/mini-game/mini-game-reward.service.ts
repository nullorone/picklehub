import { Injectable } from '@nestjs/common';
import type { GameRewardKind, Prisma, RewardGrant } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import type { MiniGameActor } from './mini-game-auth.service';
import { miniGameError } from './mini-game.errors';
import { MiniGameCryptoService } from './mini-game-crypto.service';
import { MiniGameMetricsService } from './mini-game-metrics.service';
import { plus, startOfUtcWeek } from './mini-game-policy';
import { MiniGameService } from './mini-game.service';

const RETENTION_MS = 114 * 86_400_000;

@Injectable()
export class MiniGameRewardService {
    constructor(
        private readonly game: MiniGameService,
        private readonly prisma: PrismaService,
        private readonly crypto: MiniGameCryptoService,
        private readonly metrics: MiniGameMetricsService,
        private readonly audit: AuditService,
        private readonly requestContext: RequestContextService
    ) {}

    async claim(actor: MiniGameActor, receiptId: string, proof: string, tx: Prisma.TransactionClient): Promise<object> {
        const claims = this.game.resultClaims(proof);
        const now = new Date();
        if (
            claims === null ||
            claims.v !== 1 ||
            claims.r !== receiptId.replaceAll('-', '') ||
            claims.u !== actor.userId.replaceAll('-', '')
        ) {
            throw miniGameError('GAME_CHALLENGE_INVALID', 422);
        }
        const result = await tx.gameResult.findUnique({ where: { id: receiptId } });
        if (
            result === null ||
            result.userId !== actor.userId ||
            result.outcome !== 'ACCEPTED' ||
            result.acceptedAt === null ||
            result.rewardClaimExpiresAt === null ||
            claims.q !== result.configurationVersion ||
            claims.a !== result.acceptedAt.getTime() ||
            result.resultProofHash !== this.crypto.hash('RESULT_PROOF', proof)
        ) {
            throw miniGameError('GAME_CHALLENGE_INVALID', 422);
        }
        if (result.rewardClaimExpiresAt <= now || claims.x <= now.getTime()) {
            throw miniGameError('REWARD_CLAIM_EXPIRED', 410);
        }
        const session = await tx.gameSession.findUniqueOrThrow({ where: { id: result.sessionId } });
        if (claims.e !== session.seasonId.replaceAll('-', '')) throw miniGameError('GAME_CHALLENGE_INVALID', 422);
        const day = session.dailyWindowStartedAt;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.userId}:${session.seasonId}:reward`}, 0))`;
        const grants: RewardGrant[] = [];
        const goals = [
            ['DAILY_WARM_UP', true],
            ['DAILY_ACCURACY', result.successfulReturns >= 12],
            [
                'DAILY_DIRECTIONS',
                result.leftTargetHits >= 2 && result.centerTargetHits >= 2 && result.rightTargetHits >= 2,
            ],
        ] as const;
        for (const [goalCode, eligible] of goals) {
            if (!eligible) continue;
            grants.push(await this.goalGrant(tx, result, session.seasonId, day, goalCode));
        }
        grants.push(await this.xpGrant(tx, result, session.seasonId, day));
        const cosmetics = await this.cosmetics(tx, actor.userId, result.id, session.seasonId, day);
        const progress = await this.game.progressFor(tx, actor.userId, session.seasonId, result.acceptedAt);
        return {
            receiptId,
            grants: grants.map((grant) => this.grant(grant)),
            cosmeticUnlocks: cosmetics,
            progress,
            claimedAt: now.toISOString(),
        };
    }

    async reverseGrant(grantId: string, actorId: string, reasonCode: string): Promise<string> {
        return this.compensate(grantId, actorId, reasonCode, 'REVERSED');
    }

    async reinstateGrant(reversalId: string, actorId: string, reasonCode: string): Promise<string> {
        return this.compensate(reversalId, actorId, reasonCode, 'REINSTATED');
    }

    private async compensate(
        sourceId: string,
        actorId: string,
        reasonCode: string,
        state: 'REVERSED' | 'REINSTATED'
    ): Promise<string> {
        return this.prisma.$transaction(async (tx) => {
            const source = await tx.rewardGrant.findUniqueOrThrow({ where: { id: sourceId } });
            if (
                (state === 'REVERSED' && source.state !== 'GRANTED') ||
                (state === 'REINSTATED' && source.state !== 'REVERSED')
            ) {
                throw miniGameError('GAME_SESSION_TERMINAL', 409);
            }
            const grant = await tx.rewardGrant.create({
                data: {
                    id: uuidV7(),
                    userId: source.userId,
                    receiptId: source.receiptId,
                    seasonId: source.seasonId,
                    kind: source.kind,
                    state,
                    semanticKey: source.semanticKey,
                    goalCode: source.goalCode,
                    cosmeticCode: source.cosmeticCode,
                    amount: source.amount,
                    windowStartedAt: source.windowStartedAt,
                    compensationOfGrantId: source.id,
                    reasonCode,
                    retentionExpiresAt: plus(new Date(), RETENTION_MS),
                },
            });
            await this.game.emit(tx, 'mini-game.reward-grant.changed.v1', grant.createdAt, {
                grantId: grant.id,
                kind: grant.kind,
                state: grant.state,
            });
            if (grant.kind === 'COSMETIC' && grant.cosmeticCode !== null) {
                const prior = await tx.cosmeticUnlock.findUnique({ where: { sourceGrantId: source.id } });
                if (prior === null) throw miniGameError('GAME_SESSION_TERMINAL', 409);
                const unlock = await tx.cosmeticUnlock.create({
                    data: {
                        id: uuidV7(),
                        userId: grant.userId,
                        seasonId: grant.seasonId,
                        cosmeticCode: grant.cosmeticCode,
                        state: state === 'REVERSED' ? 'REVOKED' : 'REINSTATED',
                        sourceGrantId: grant.id,
                        supersedesUnlockId: prior.id,
                    },
                });
                await this.game.emit(tx, 'mini-game.cosmetic-unlock.changed.v1', unlock.createdAt, {
                    unlockId: unlock.id,
                    state: unlock.state,
                });
            }
            const context = this.requestContext.get();
            await this.audit.append(tx, {
                actorType: 'ADMIN',
                actorId,
                action: state === 'REVERSED' ? 'MINI_GAME_REWARD_REVERSED' : 'MINI_GAME_REWARD_REINSTATED',
                targetType: 'MINI_GAME_REWARD_GRANT',
                targetId: grant.id,
                outcome: 'APPLIED',
                reasonCode,
                policyVersion: '1.0.0',
                changedFields: { state },
                requestId: context?.requestId ?? uuidV7(),
                correlationId: context?.correlationId ?? uuidV7(),
                source: 'BACKEND',
            });
            return grant.id;
        });
    }

    private async goalGrant(
        tx: Prisma.TransactionClient,
        result: { id: string; userId: string; createdAt: Date },
        seasonId: string,
        day: Date,
        goalCode: string
    ): Promise<RewardGrant> {
        const semanticKey = `GOAL:${goalCode}:${day.toISOString().slice(0, 10)}`;
        const existing = await tx.rewardGrant.findFirst({
            where: { userId: result.userId, seasonId, semanticKey },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        if (existing !== null) return existing;
        return this.createGrant(tx, {
            result,
            seasonId,
            day,
            kind: 'PRACTICE_MARK',
            semanticKey,
            goalCode,
            amount: 1,
            state: 'GRANTED',
        });
    }

    private async xpGrant(
        tx: Prisma.TransactionClient,
        result: { id: string; userId: string; createdAt: Date },
        seasonId: string,
        day: Date
    ): Promise<RewardGrant> {
        const semanticKey = `XP:MINI_GAME_DAILY_COMPLETION:${day.toISOString().slice(0, 10)}:2.0.0`;
        const existing = await tx.rewardGrant.findFirst({
            where: { userId: result.userId, seasonId, semanticKey },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        if (existing !== null) return existing;
        const week = startOfUtcWeek(day);
        const [weekly, seasonal] = await Promise.all([
            tx.rewardGrant.count({
                where: {
                    userId: result.userId,
                    kind: 'GLOBAL_XP',
                    state: { in: ['GRANTED', 'REINSTATED'] },
                    windowStartedAt: { gte: week, lt: plus(week, 7 * 86_400_000) },
                },
            }),
            tx.rewardGrant.count({
                where: { userId: result.userId, seasonId, kind: 'GLOBAL_XP', state: { in: ['GRANTED', 'REINSTATED'] } },
            }),
        ]);
        const capped = weekly >= 5 || seasonal >= 30;
        const grant = await this.createGrant(tx, {
            result,
            seasonId,
            day,
            kind: 'GLOBAL_XP',
            semanticKey,
            goalCode: null,
            amount: capped ? 0 : 10,
            state: capped ? 'CAPPED' : 'GRANTED',
        });
        this.metrics.increment(capped ? 'reward.capped' : 'reward.granted');
        return grant;
    }

    private async createGrant(
        tx: Prisma.TransactionClient,
        input: {
            result: { id: string; userId: string; createdAt: Date };
            seasonId: string;
            day: Date;
            kind: GameRewardKind;
            semanticKey: string;
            goalCode: string | null;
            cosmeticCode?: string | null;
            amount: number;
            state: 'GRANTED' | 'CAPPED';
        }
    ): Promise<RewardGrant> {
        const grant = await tx.rewardGrant.create({
            data: {
                id: uuidV7(),
                userId: input.result.userId,
                receiptId: input.result.id,
                seasonId: input.seasonId,
                kind: input.kind,
                state: input.state,
                semanticKey: input.semanticKey,
                goalCode: input.goalCode,
                cosmeticCode: input.cosmeticCode ?? null,
                amount: input.amount,
                windowStartedAt: input.day,
                retentionExpiresAt: plus(input.result.createdAt, RETENTION_MS),
            },
        });
        await this.game.emit(tx, 'mini-game.reward-grant.changed.v1', grant.createdAt, {
            grantId: grant.id,
            kind: grant.kind,
            state: grant.state,
        });
        return grant;
    }

    private async cosmetics(
        tx: Prisma.TransactionClient,
        userId: string,
        receiptId: string,
        seasonId: string,
        day: Date
    ): Promise<object[]> {
        const progress = (await this.game.progressFor(tx, userId, seasonId, day)) as {
            distinctCompletionDays: number;
            practiceMarks: number;
        };
        const rules = [
            ['SEASON_CARD_BACKGROUND', progress.distinctCompletionDays >= 5],
            ['BALL_COLOR', progress.practiceMarks >= 30],
            ['BALL_TRAIL', progress.distinctCompletionDays >= 20],
            ['GAME_PROFILE_FRAME', progress.practiceMarks >= 60],
        ] as const;
        const unlocks: object[] = [];
        for (const [code, eligible] of rules) {
            if (!eligible) continue;
            const existing = await tx.cosmeticUnlock.findFirst({
                where: { userId, seasonId, cosmeticCode: code },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            });
            if (existing !== null) {
                unlocks.push(this.unlock(existing));
                continue;
            }
            const result = await tx.gameResult.findUniqueOrThrow({ where: { id: receiptId } });
            const grant = await this.createGrant(tx, {
                result,
                seasonId,
                day,
                kind: 'COSMETIC',
                semanticKey: `COSMETIC:${code}:${seasonId}`,
                goalCode: null,
                cosmeticCode: code,
                amount: 1,
                state: 'GRANTED',
            });
            const unlock = await tx.cosmeticUnlock.create({
                data: {
                    id: uuidV7(),
                    userId,
                    seasonId,
                    cosmeticCode: code,
                    state: 'UNLOCKED',
                    sourceGrantId: grant.id,
                },
            });
            await this.game.emit(tx, 'mini-game.cosmetic-unlock.changed.v1', unlock.createdAt, {
                unlockId: unlock.id,
                state: unlock.state,
            });
            unlocks.push(this.unlock(unlock));
        }
        return unlocks;
    }

    private grant(grant: RewardGrant): object {
        return {
            id: grant.id,
            receiptId: grant.receiptId,
            kind: grant.kind,
            state: grant.state,
            goalCode: grant.goalCode,
            cosmeticCode: grant.cosmeticCode,
            amount: grant.amount,
            compensationOfGrantId: grant.compensationOfGrantId,
            grantedAt: grant.state === 'GRANTED' || grant.state === 'REINSTATED' ? grant.createdAt.toISOString() : null,
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
}
