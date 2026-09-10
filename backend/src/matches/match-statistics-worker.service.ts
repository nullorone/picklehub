import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Worker } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { RedisService } from '../common/redis/redis.service';
import type { OutboxJobData } from '../outbox/outbox-queue.service';

const CONSUMER = 'player-match-statistics-v1';

interface ConfirmedPayload {
    data?: { matchId?: unknown; resultId?: unknown };
}

@Injectable()
export class MatchStatisticsWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private worker: Worker<OutboxJobData> | undefined;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly redis: RedisService,
        private readonly prisma: PrismaService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE !== 'worker') return;
        this.worker = new Worker<OutboxJobData>(
            `${this.environment.REDIS_NAMESPACE}-match-statistics-v1`,
            async (job) => this.process(job.data),
            { connection: this.redis.client, concurrency: 4 }
        );
        this.worker.on('failed', (_job, error) => {
            this.logger.error(error, undefined, MatchStatisticsWorkerService.name);
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
    }

    async process(job: OutboxJobData): Promise<void> {
        if (job.type !== 'match.completed.confirmed.v1' || job.schemaVersion !== 1) return;
        await this.prisma.$transaction(
            async (tx) => {
                const receipt = await tx.$queryRaw<{ eventId: string }[]>(Prisma.sql`
                INSERT INTO match_statistics_receipts (consumer_key, event_id)
                VALUES (${CONSUMER}, ${job.eventId}::uuid) ON CONFLICT DO NOTHING
                RETURNING event_id AS "eventId"`);
                if (receipt.length === 0) return;
                const event = await tx.outboxEvent.findUniqueOrThrow({ where: { id: job.eventId } });
                const payload = event.payload as ConfirmedPayload;
                const matchId = payload.data?.matchId;
                const resultId = payload.data?.resultId;
                if (typeof matchId !== 'string' || typeof resultId !== 'string')
                    throw new Error('Invalid confirmed match event');
                const result = await tx.matchResult.findUniqueOrThrow({ where: { id: resultId } });
                const marker = await tx.matchMetricMarker.findUnique({
                    where: { resultId_metricType: { resultId, metricType: 'CONFIRMED_MATCH' } },
                });
                if (marker === null || marker.matchId !== matchId) throw new Error('Confirmed match marker is missing');
                const participants = await tx.matchParticipant.findMany({
                    where: { matchId, state: 'PLAYED' },
                    select: { userId: true, team: true },
                });
                for (const participant of participants) {
                    const won = result.winningTeam === participant.team;
                    const scored = result.winningTeam !== null;
                    await tx.$executeRaw(Prisma.sql`
                    INSERT INTO player_match_statistics (user_id, played_count, wins_count, losses_count, last_confirmed_at)
                    VALUES (${participant.userId}::uuid, 1, ${won ? 1 : 0}, ${scored && !won ? 1 : 0}, ${marker.confirmedAt})
                    ON CONFLICT (user_id) DO UPDATE SET
                        played_count = player_match_statistics.played_count + 1,
                        wins_count = player_match_statistics.wins_count + EXCLUDED.wins_count,
                        losses_count = player_match_statistics.losses_count + EXCLUDED.losses_count,
                        last_confirmed_at = greatest(player_match_statistics.last_confirmed_at, EXCLUDED.last_confirmed_at)`);
                }
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }
}
