import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Worker } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { RedisService } from '../common/redis/redis.service';
import type { OutboxJobData } from '../outbox/outbox-queue.service';
import { GamificationProjectionService } from './gamification-projection.service';

interface EventPayload {
    messageId?: unknown;
    data?: {
        matchId?: unknown;
        aggregateVersion?: unknown;
        reviewId?: unknown;
        reviewRevision?: unknown;
        membershipId?: unknown;
        grantId?: unknown;
    };
}

@Injectable()
export class GamificationEventWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private worker: Worker<OutboxJobData> | undefined;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly redis: RedisService,
        private readonly prisma: PrismaService,
        private readonly projection: GamificationProjectionService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE !== 'worker') return;
        this.worker = new Worker<OutboxJobData>(
            `${this.environment.REDIS_NAMESPACE}-gamification-events-v1`,
            async (job) => this.process(job.data),
            { connection: this.redis.client, concurrency: 4 }
        );
        this.worker.on('failed', (_job, error) => {
            this.logger.error(error, undefined, GamificationEventWorkerService.name);
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
    }

    async process(job: OutboxJobData): Promise<void> {
        if (job.schemaVersion !== 1) return;
        const event = await this.prisma.outboxEvent.findUniqueOrThrow({ where: { id: job.eventId } });
        const payload = event.payload as EventPayload;
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : job.eventId;
        const hash = createHash('sha256').update(JSON.stringify(event.payload)).digest('hex');
        if (job.type.startsWith('match.')) {
            const matchId = payload.data?.matchId;
            const revision = number(payload.data?.aggregateVersion);
            if (typeof matchId === 'string' && revision !== null)
                await this.projection.reconcileMatch(messageId, matchId, revision, hash);
            return;
        }
        if (job.type.startsWith('review.')) {
            const reviewId = payload.data?.reviewId;
            const revision = number(payload.data?.reviewRevision);
            if (typeof reviewId === 'string' && revision !== null)
                await this.projection.reconcileReview(messageId, reviewId, revision, hash);
            return;
        }
        if (job.type === 'club.membership.changed.v1' && typeof payload.data?.membershipId === 'string') {
            const membership = await this.prisma.clubMembership.findUnique({
                where: { id: payload.data.membershipId },
            });
            if (membership !== null)
                await this.projection.freezeClubMember(
                    membership.userId,
                    membership.clubId,
                    membership.state === 'ACTIVE' ? null : (membership.endedAt ?? new Date())
                );
            return;
        }
        if (job.type === 'mini-game.reward-grant.changed.v1' && typeof payload.data?.grantId === 'string') {
            await this.projection.reconcileMiniGameGrant(messageId, payload.data.grantId, hash);
        }
    }
}

function number(value: unknown): number | null {
    const result = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
    return Number.isInteger(result) && result >= 0 ? result : null;
}
