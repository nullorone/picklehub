import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { IdentityProvider, NotificationChannel, NotificationDeliveryStatus, type Prisma } from '@prisma/client';
import { Worker } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { RedisService } from '../common/redis/redis.service';
import { CommunicationMetricsService } from './communication-metrics.service';
import type { NotificationDeliveryJob } from './notification-delivery-queue.service';
import { EmailNotificationProvider, TelegramNotificationProvider, type ProviderResult } from './notification-provider';

type Delivery = Prisma.NotificationDeliveryGetPayload<{
    include: { notification: { include: { recipient: { include: { identities: true } } } } };
}>;

@Injectable()
export class NotificationDeliveryWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private worker: Worker<NotificationDeliveryJob> | undefined;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly redis: RedisService,
        private readonly prisma: PrismaService,
        private readonly telegram: TelegramNotificationProvider,
        private readonly email: EmailNotificationProvider,
        private readonly logger: ApplicationLogger,
        private readonly metrics: CommunicationMetricsService
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE !== 'worker') return;
        this.worker = new Worker<NotificationDeliveryJob>(
            `${this.environment.REDIS_NAMESPACE}-notification-delivery-v1`,
            async (job) => this.process(job.data.deliveryId),
            {
                connection: this.redis.client,
                concurrency: 4,
                limiter: { max: 20, duration: 1000 },
            }
        );
        this.worker.on('failed', (_job, error) => {
            this.metrics.increment('notification_delivery_worker_failure_total');
            this.logger.error(error, undefined, NotificationDeliveryWorkerService.name);
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
    }

    async process(deliveryId: string): Promise<void> {
        const now = new Date();
        const claimed = await this.prisma.notificationDelivery.updateMany({
            where: {
                id: deliveryId,
                status: { in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.DEFERRED] },
                notBefore: { lte: now },
                expiresAt: { gt: now },
            },
            data: {
                status: NotificationDeliveryStatus.PROCESSING,
                claimedAt: now,
                attempts: { increment: 1 },
                lastErrorCode: null,
            },
        });
        if (claimed.count === 0) return;
        const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({
            where: { id: deliveryId },
            include: { notification: { include: { recipient: { include: { identities: true } } } } },
        });
        const allowed = await this.prisma.notificationPreferenceChannel.findUnique({
            where: {
                userId_category_channel: {
                    userId: delivery.notification.recipientId,
                    category: delivery.notification.category,
                    channel: delivery.channel,
                },
            },
        });
        if (allowed?.enabled !== true) {
            await this.suppress(deliveryId, 'PREFERENCE_DISABLED');
            return;
        }
        const identityProvider =
            delivery.channel === NotificationChannel.TELEGRAM ? IdentityProvider.TELEGRAM : IdentityProvider.EMAIL;
        const identity = delivery.notification.recipient.identities.find((item) => item.provider === identityProvider);
        if (identity === undefined) {
            await this.suppress(deliveryId, 'IDENTITY_UNBOUND');
            return;
        }
        const preference = await this.prisma.notificationPreference.findUniqueOrThrow({
            where: { userId: delivery.notification.recipientId },
        });
        const provider = delivery.channel === NotificationChannel.TELEGRAM ? this.telegram : this.email;
        if (!provider.enabled) {
            await this.suppress(deliveryId, 'PROVIDER_DISABLED');
            return;
        }
        try {
            const result = await provider.send({
                recipient: identity.subjectCiphertext,
                notificationType: delivery.notification.type,
                locale: preference.locale,
                idempotencyKey: delivery.idempotencyKey,
            });
            await this.accept(delivery, result);
        } catch (error) {
            await this.retry(delivery, this.safeError(error));
        }
    }

    private async accept(delivery: Delivery, result: ProviderResult): Promise<void> {
        await this.prisma.notificationDelivery.updateMany({
            where: { id: delivery.id, status: NotificationDeliveryStatus.PROCESSING },
            data: {
                status: NotificationDeliveryStatus.ACCEPTED,
                providerCode: result.providerCode,
                ...(result.providerMessageKey === undefined ? {} : { providerMessageKey: result.providerMessageKey }),
                acceptedAt: new Date(),
                terminalAt: new Date(),
                claimedAt: null,
            },
        });
        this.metrics.increment('notification_delivery_total', { channel: delivery.channel, outcome: 'accepted' });
    }

    private async retry(delivery: Delivery, errorCode: string): Promise<void> {
        const terminal = delivery.attempts >= this.environment.COMMUNICATION_DELIVERY_MAX_ATTEMPTS;
        const delay = Math.min(6 * 60 * 60_000, 2 ** Math.min(delivery.attempts, 12) * 1000);
        await this.prisma.notificationDelivery.updateMany({
            where: { id: delivery.id, status: NotificationDeliveryStatus.PROCESSING },
            data: {
                status: terminal ? NotificationDeliveryStatus.FAILED : NotificationDeliveryStatus.DEFERRED,
                notBefore: terminal
                    ? delivery.notBefore
                    : new Date(Date.now() + delay + Math.floor(Math.random() * 1000)),
                lastErrorCode: errorCode,
                claimedAt: null,
                terminalAt: terminal ? new Date() : null,
            },
        });
        this.metrics.increment('notification_delivery_total', {
            channel: delivery.channel,
            outcome: terminal ? 'failed' : 'deferred',
        });
        if (terminal) {
            this.logger.warn(
                {
                    event: 'notification.delivery.dead-lettered',
                    channel: delivery.channel,
                    attempt: delivery.attempts,
                    errorCode,
                },
                NotificationDeliveryWorkerService.name
            );
        }
    }

    private async suppress(deliveryId: string, errorCode: string): Promise<void> {
        await this.prisma.notificationDelivery.updateMany({
            where: { id: deliveryId, status: NotificationDeliveryStatus.PROCESSING },
            data: {
                status: NotificationDeliveryStatus.SUPPRESSED,
                lastErrorCode: errorCode,
                claimedAt: null,
                terminalAt: new Date(),
            },
        });
        this.metrics.increment('notification_delivery_total', { outcome: 'suppressed' });
    }

    private safeError(error: unknown): string {
        if (!(error instanceof Error)) return 'PROVIDER_FAILED';
        if (error.name === 'TimeoutError') return 'PROVIDER_TIMEOUT';
        const matched = /^(?:TELEGRAM|EMAIL)_(\d{3})$/u.exec(error.message);
        return matched === null ? 'PROVIDER_FAILED' : `PROVIDER_HTTP_${String(matched[1])}`;
    }
}
