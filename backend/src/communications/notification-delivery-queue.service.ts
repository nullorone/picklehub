import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';

export interface NotificationDeliveryJob {
    readonly deliveryId: string;
}

@Injectable()
export class NotificationDeliveryQueueService implements OnModuleDestroy {
    private readonly queue: Queue<NotificationDeliveryJob>;

    constructor(@Inject(ENVIRONMENT) environment: Environment, redis: RedisService) {
        this.queue = new Queue(`${environment.REDIS_NAMESPACE}-notification-delivery-v1`, {
            connection: redis.client,
            defaultJobOptions: {
                attempts: environment.COMMUNICATION_DELIVERY_MAX_ATTEMPTS,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: true,
                removeOnFail: { age: 604_800, count: 100_000 },
            },
        });
    }

    async publish(deliveryId: string): Promise<void> {
        await this.queue.add('notification.delivery.requested.v1', { deliveryId }, { jobId: deliveryId });
    }

    async onModuleDestroy(): Promise<void> {
        await this.queue.close();
    }
}
