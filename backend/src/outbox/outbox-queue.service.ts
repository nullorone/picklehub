import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';

export interface OutboxJobData {
    eventId: string;
    type: string;
    schemaVersion: number;
}

@Injectable()
export class OutboxQueueService implements OnModuleDestroy {
    private readonly queue: Queue<OutboxJobData>;

    constructor(@Inject(ENVIRONMENT) environment: Environment, redis: RedisService) {
        this.queue = new Queue<OutboxJobData>(`${environment.REDIS_NAMESPACE}-platform-outbox-v1`, {
            connection: redis.client,
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: { age: 86_400, count: 100_000 },
                removeOnFail: { age: 604_800, count: 100_000 },
            },
        });
    }

    async publish(data: OutboxJobData): Promise<void> {
        await this.queue.add('dispatch-outbox-event.v1', data, { jobId: data.eventId });
    }

    async isReady(): Promise<boolean> {
        await (await this.queue.client).ping();
        return true;
    }

    async onModuleDestroy(): Promise<void> {
        await this.queue.close();
    }
}
