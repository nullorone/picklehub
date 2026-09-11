import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { RedisService } from '../common/redis/redis.service';
import type { OutboxJobData } from '../outbox/outbox-queue.service';
import { ProfileProjectionService } from './profile-projection.service';

interface MatchEventPayload {
    data?: { matchId?: unknown; aggregateVersion?: unknown };
}

@Injectable()
export class ProfileProjectionWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private worker: Worker<OutboxJobData> | undefined;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly redis: RedisService,
        private readonly prisma: PrismaService,
        private readonly projection: ProfileProjectionService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE !== 'worker') return;
        this.worker = new Worker<OutboxJobData>(
            `${this.environment.REDIS_NAMESPACE}-profile-statistics-v1`,
            async (job) => this.process(job.data),
            { connection: this.redis.client, concurrency: 4 }
        );
        this.worker.on('failed', (_job, error) => {
            this.logger.error(error, undefined, ProfileProjectionWorkerService.name);
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
    }

    async process(job: OutboxJobData): Promise<void> {
        if (!job.type.startsWith('match.') || job.schemaVersion !== 1) return;
        const event = await this.prisma.outboxEvent.findUniqueOrThrow({ where: { id: job.eventId } });
        const payload = event.payload as MatchEventPayload;
        const matchId = payload.data?.matchId;
        const revision = payload.data?.aggregateVersion;
        if (typeof matchId !== 'string' || (typeof revision !== 'number' && typeof revision !== 'string')) return;
        await this.projection.consume(job.eventId, 'profile.statistics.source.changed.v1', matchId, BigInt(revision));
    }
}
