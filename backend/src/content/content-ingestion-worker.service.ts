import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { RedisService } from '../common/redis/redis.service';
import { ContentIngestionQueueService } from './content-ingestion-queue.service';
import { ContentIngestionService } from './content-ingestion.service';

@Injectable()
export class ContentIngestionWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private worker: Worker | undefined;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly redis: RedisService,
        private readonly queue: ContentIngestionQueueService,
        private readonly ingestion: ContentIngestionService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE !== 'worker') return;
        this.worker = new Worker(this.queue.name, () => this.ingestion.pollEnabledSources(), {
            connection: this.redis.client,
            concurrency: 1,
        });
        this.worker.on('failed', () => {
            this.logger.warn({ event: 'content.ingestion.failed' }, ContentIngestionWorkerService.name);
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
    }
}
