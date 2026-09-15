import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class ContentIngestionQueueService implements OnApplicationBootstrap, OnModuleDestroy {
    readonly name: string;
    private readonly queue: Queue<Record<string, never>> | undefined;
    private readonly environment: Environment;

    constructor(@Inject(ENVIRONMENT) environment: Environment, redis: RedisService) {
        this.environment = environment;
        this.name = `${environment.REDIS_NAMESPACE}-content-ingestion-v1`;
        if (environment.APP_ROLE === 'worker') {
            this.queue = new Queue(this.name, {
                connection: redis.client,
                defaultJobOptions: {
                    attempts: 5,
                    backoff: { type: 'exponential', delay: 5000 },
                    removeOnComplete: true,
                    removeOnFail: { age: 604_800, count: 1000 },
                },
            });
        }
    }

    async onApplicationBootstrap(): Promise<void> {
        if (this.environment.APP_ROLE !== 'worker') return;
        if (this.queue === undefined) throw new Error('Content ingestion queue is not configured for the worker');
        await this.queue.upsertJobScheduler(
            'content-source-poll-v1',
            { every: this.environment.CONTENT_FETCH_INTERVAL_MS ?? 900_000 },
            { name: 'content.source.poll.v1', data: {} }
        );
    }

    async onModuleDestroy(): Promise<void> {
        await this.queue?.close();
    }
}
