import { NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';

import type { Environment } from '../../src/common/config/environment';
import type { PrismaService } from '../../src/common/database/prisma.service';
import type { ApplicationLogger } from '../../src/common/logging/application-logger.service';
import type { RedisService } from '../../src/common/redis/redis.service';
import type { CommunicationMetricsService } from '../../src/communications/communication-metrics.service';
import { NotificationDeliveryDispatcherService } from '../../src/communications/notification-delivery-dispatcher.service';
import type { NotificationDeliveryQueueService } from '../../src/communications/notification-delivery-queue.service';
import { NotificationDeliveryWorkerService } from '../../src/communications/notification-delivery-worker.service';
import type {
    EmailNotificationProvider,
    TelegramNotificationProvider,
} from '../../src/communications/notification-provider';

const deliveryId = '11111111-1111-4111-8111-111111111111';
const notificationId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

interface UpdateArguments {
    data: Record<string, unknown>;
    where: Record<string, unknown>;
}

function metrics() {
    const increment = (name: string): void => {
        void name;
    };
    return { increment: jest.fn(increment) };
}

function logger() {
    return { error: jest.fn(), warn: jest.fn() };
}

function updateMock(updates: UpdateArguments[]) {
    const update = (args: UpdateArguments): Promise<{ count: number }> => {
        updates.push(args);
        return Promise.resolve({ count: 1 });
    };
    return jest.fn(update);
}

describe('notification delivery recovery', () => {
    it('keeps a due database delivery pending when Redis publish fails and publishes it after recovery', async () => {
        const query = jest.fn().mockResolvedValue([{ id: deliveryId }]);
        const publish = jest
            .fn()
            .mockRejectedValueOnce(new Error('redis unavailable'))
            .mockResolvedValueOnce(undefined);
        const applicationLogger = logger();
        const service = new NotificationDeliveryDispatcherService(
            { $queryRaw: query } as unknown as PrismaService,
            { publish } as unknown as NotificationDeliveryQueueService,
            applicationLogger as unknown as ApplicationLogger,
            metrics() as unknown as CommunicationMetricsService
        );

        await expect(service.dispatchBatch()).resolves.toBe(1);
        await expect(service.dispatchBatch()).resolves.toBe(1);

        expect(publish).toHaveBeenCalledTimes(2);
        expect(applicationLogger.warn).toHaveBeenCalledWith(
            { errorCode: 'REDIS_UNAVAILABLE', event: 'notification.queue.publish.failed' },
            NotificationDeliveryDispatcherService.name
        );
    });

    it('requeues an unexpired terminal delivery without changing its provider idempotency key', async () => {
        const updates: UpdateArguments[] = [];
        const updateMany = updateMock(updates);
        const counters = metrics();
        const service = new NotificationDeliveryDispatcherService(
            { notificationDelivery: { updateMany } } as unknown as PrismaService,
            {} as unknown as NotificationDeliveryQueueService,
            logger() as unknown as ApplicationLogger,
            counters as unknown as CommunicationMetricsService
        );

        await expect(service.retryFailed(deliveryId)).resolves.toBe(true);
        const retried = updates[0];
        expect(retried?.data.attempts).toBe(0);
        expect(retried?.data.status).toBe(NotificationDeliveryStatus.PENDING);
        expect(retried?.where.id).toBe(deliveryId);
        expect(retried?.data).not.toHaveProperty('idempotencyKey');
        expect(counters.increment).toHaveBeenCalledWith('notification_delivery_retried_total');
    });

    it('defers a provider timeout, then records an observable failure after the bounded final attempt', async () => {
        const updates: UpdateArguments[] = [];
        const updateMany = updateMock(updates);
        const findUniqueOrThrow = jest.fn().mockResolvedValueOnce(delivery(1)).mockResolvedValueOnce(delivery(3));
        const send = jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
        const applicationLogger = logger();
        const service = worker(
            { notificationDelivery: { updateMany, findUniqueOrThrow } } as unknown as PrismaService,
            send,
            applicationLogger as unknown as ApplicationLogger
        );

        await service.process(deliveryId);
        await service.process(deliveryId);

        const deferred = updates[1]?.data;
        const failed = updates[3]?.data;
        expect(deferred).toMatchObject({
            lastErrorCode: 'PROVIDER_TIMEOUT',
            status: NotificationDeliveryStatus.DEFERRED,
        });
        expect(failed).toMatchObject({
            lastErrorCode: 'PROVIDER_TIMEOUT',
            status: NotificationDeliveryStatus.FAILED,
        });
        expect(applicationLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: 3,
                channel: NotificationChannel.EMAIL,
                errorCode: 'PROVIDER_TIMEOUT',
                event: 'notification.delivery.dead-lettered',
            }),
            NotificationDeliveryWorkerService.name
        );
    });

    it('ignores a duplicate job once the database claim is no longer eligible', async () => {
        const updateMany = updateMock([]).mockResolvedValue({ count: 0 });
        const findUniqueOrThrow = jest.fn();
        const send = jest.fn();
        const service = worker(
            { notificationDelivery: { updateMany, findUniqueOrThrow } } as unknown as PrismaService,
            send,
            logger() as unknown as ApplicationLogger
        );

        await service.process(deliveryId);

        expect(findUniqueOrThrow).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });
});

function worker(prisma: PrismaService, send: jest.Mock, applicationLogger: ApplicationLogger) {
    const preferenceChannel = { findUnique: jest.fn().mockResolvedValue({ enabled: true }) };
    const preference = { findUniqueOrThrow: jest.fn().mockResolvedValue({ locale: 'ru-RU' }) };
    Object.assign(prisma as object, {
        notificationPreferenceChannel: preferenceChannel,
        notificationPreference: preference,
    });
    return new NotificationDeliveryWorkerService(
        { APP_ROLE: 'api', COMMUNICATION_DELIVERY_MAX_ATTEMPTS: 3 } as Environment,
        {} as RedisService,
        prisma,
        { enabled: true, send: jest.fn() } as unknown as TelegramNotificationProvider,
        { enabled: true, send } as unknown as EmailNotificationProvider,
        applicationLogger,
        metrics() as unknown as CommunicationMetricsService
    );
}

function delivery(attempts: number) {
    return {
        attempts,
        channel: NotificationChannel.EMAIL,
        id: deliveryId,
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
        notBefore: new Date('2026-09-10T10:00:00.000Z'),
        notification: {
            category: 'CHAT',
            id: notificationId,
            recipient: {
                identities: [{ provider: 'EMAIL', subjectCiphertext: Buffer.from('encrypted-contact') }],
            },
            recipientId: userId,
            type: 'CHAT_MESSAGE',
        },
    };
}
