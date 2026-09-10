import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { CommunicationMetricsService } from './communication-metrics.service';

@Injectable()
export class CommunicationMaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | undefined;
    private active: Promise<void> | undefined;
    private stopped = false;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly prisma: PrismaService,
        private readonly logger: ApplicationLogger,
        private readonly metrics: CommunicationMetricsService
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE === 'worker') this.schedule(60_000);
    }

    async onModuleDestroy(): Promise<void> {
        this.stopped = true;
        if (this.timer !== undefined) clearTimeout(this.timer);
        await this.active;
    }

    async run(now = new Date()): Promise<void> {
        const [closed, idempotency, notifications, deliveries, conversations] = await this.prisma.$transaction([
            this.prisma.conversation.updateMany({
                where: { state: 'WRITABLE', writeClosesAt: { lte: now } },
                data: { state: 'READ_ONLY', updatedAt: now },
            }),
            this.prisma.communicationIdempotencyRecord.deleteMany({ where: { expiresAt: { lte: now } } }),
            this.prisma.notification.deleteMany({ where: { expiresAt: { lte: now } } }),
            this.prisma.notificationDelivery.deleteMany({ where: { expiresAt: { lte: now } } }),
            this.prisma.conversation.deleteMany({ where: { retentionExpiresAt: { lte: now } } }),
        ]);
        if (closed.count > 0) this.metrics.increment('chat_closed_total');
        if (idempotency.count + notifications.count + deliveries.count + conversations.count > 0)
            this.metrics.increment('communication_retention_cleanup_total');
    }

    private schedule(delay: number): void {
        this.timer = setTimeout(() => {
            this.active = this.runOnce();
        }, delay);
        this.timer.unref();
    }

    private async runOnce(): Promise<void> {
        try {
            await this.run();
        } catch (error) {
            this.logger.error(
                error instanceof Error ? error : new Error('Communication maintenance failed'),
                undefined,
                CommunicationMaintenanceService.name
            );
        } finally {
            this.active = undefined;
            if (!this.stopped) this.schedule(60_000);
        }
    }
}
