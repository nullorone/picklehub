import { Injectable } from '@nestjs/common';
import { NotificationDeliveryStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { CommunicationMetricsService } from './communication-metrics.service';
import { NotificationDeliveryQueueService } from './notification-delivery-queue.service';

@Injectable()
export class NotificationDeliveryDispatcherService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly queue: NotificationDeliveryQueueService,
        private readonly logger: ApplicationLogger,
        private readonly metrics: CommunicationMetricsService
    ) {}

    async dispatchBatch(limit = 50): Promise<number> {
        const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM notification_deliveries
            WHERE status IN ('PENDING', 'DEFERRED') AND not_before <= CURRENT_TIMESTAMP
            ORDER BY not_before, id
            LIMIT ${limit}`);
        await Promise.all(
            rows.map(async ({ id }) => {
                try {
                    await this.queue.publish(id);
                } catch {
                    this.metrics.increment('notification_queue_publish_failure_total');
                    this.logger.warn(
                        { event: 'notification.queue.publish.failed', errorCode: 'REDIS_UNAVAILABLE' },
                        NotificationDeliveryDispatcherService.name
                    );
                }
            })
        );
        return rows.length;
    }

    async quarantineExpired(): Promise<number> {
        const result = await this.prisma.notificationDelivery.updateMany({
            where: {
                status: { in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.DEFERRED] },
                expiresAt: { lte: new Date() },
            },
            data: {
                status: NotificationDeliveryStatus.QUARANTINED,
                terminalAt: new Date(),
                lastErrorCode: 'DELIVERY_EXPIRED',
            },
        });
        if (result.count > 0) this.metrics.increment('notification_delivery_quarantined_total');
        return result.count;
    }
}
