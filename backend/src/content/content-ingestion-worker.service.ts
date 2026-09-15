import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import Redis from 'ioredis';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { RedisService } from '../common/redis/redis.service';
import { ContentIngestionQueueService } from './content-ingestion-queue.service';
import { ContentIngestionService } from './content-ingestion.service';

@Injectable()
export class ContentIngestionWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private worker: Worker<Record<string, never>, { attempted: number; succeeded: number }> | undefined;
    private connection: Redis | undefined;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly redis: RedisService,
        private readonly queue: ContentIngestionQueueService,
        private readonly ingestion: ContentIngestionService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE !== 'worker') return;
        this.connection = this.redis.client.duplicate({ maxRetriesPerRequest: null });
        this.worker = new Worker<Record<string, never>, { attempted: number; succeeded: number }>(
            this.queue.name,
            (job: Job<Record<string, never>>) => this.process(job),
            {
                connection: this.connection,
                concurrency: 1,
            }
        );
        this.worker.on('failed', () => {
            this.logger.warn({ event: 'content.ingestion.failed' }, ContentIngestionWorkerService.name);
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
        this.connection?.disconnect(false);
    }

    private process(job: Job<Record<string, never>>): Promise<{ attempted: number; succeeded: number }> {
        if (job.name !== 'content.source.poll.v1' || Object.keys(job.data).length !== 0)
            return Promise.reject(new Error('CONTENT_INGESTION_JOB_REJECTED'));
        return this.ingestion.pollEnabledSources();
    }
}
