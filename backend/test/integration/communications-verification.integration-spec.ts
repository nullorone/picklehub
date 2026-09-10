import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IdentityProvider, NotificationCategory, NotificationChannel, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ENVIRONMENT } from '../../src/common/config/config.module';
import type { Environment } from '../../src/common/config/environment';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { RedisService } from '../../src/common/redis/redis.service';
import { CommunicationCryptoService } from '../../src/communications/communication-crypto.service';
import { ChatReportReasonDto } from '../../src/communications/communication.dto';
import { CommunicationEventWorkerService } from '../../src/communications/communication-event-worker.service';
import { CommunicationIdempotencyService } from '../../src/communications/communication-idempotency.service';
import { CommunicationService } from '../../src/communications/communication.service';
import { NotificationDeliveryDispatcherService } from '../../src/communications/notification-delivery-dispatcher.service';
import { NotificationDeliveryQueueService } from '../../src/communications/notification-delivery-queue.service';
import { NotificationDeliveryWorkerService } from '../../src/communications/notification-delivery-worker.service';
import { EmailNotificationProvider } from '../../src/communications/notification-provider';
import { OutboxService } from '../../src/outbox/outbox.service';

interface MessagePage {
    catchUpCursor: string;
    items: { id: string; sequence: number; text: string | null }[];
    pageInfo: { hasNext: boolean; nextCursor: string | null };
}

interface Snapshot {
    backwardCursor: string | null;
    catchUpCursor: string;
    conversation: { unreadCount: number };
    messages: { id: string; sequence: number; text: string | null }[];
}

describe('chat and notification observable guarantees', () => {
    let application: INestApplication;
    let prisma: PrismaService;
    let communications: CommunicationService;
    let events: CommunicationEventWorkerService;
    let idempotency: CommunicationIdempotencyService;
    let outbox: OutboxService;

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        application = module.createNestApplication();
        configureApplication(application);
        await application.init();
        prisma = application.get(PrismaService);
        communications = application.get(CommunicationService);
        events = application.get(CommunicationEventWorkerService);
        idempotency = application.get(CommunicationIdempotencyService);
        outbox = application.get(OutboxService);
        await expect(application.get(RedisService).ping()).resolves.toBe(true);
    });

    afterAll(async () => {
        await application.close();
    });

    it('commits a message with its outbox record, rolls both back together and deduplicates the client key', async () => {
        const fixture = await conversationFixture(prisma, outbox, events);
        const canary = 'privacy-canary-chat-text';
        await expect(
            prisma.$transaction(async (tx) => {
                await communications.send(fixture.organizerId, fixture.matchId, 'Будет отменено', tx);
                throw new Error('rollback');
            })
        ).rejects.toThrow('rollback');
        await expect(
            prisma.chatMessage.count({ where: { conversation: { matchId: fixture.matchId }, kind: 'USER' } })
        ).resolves.toBe(0);

        const key = randomUUID();
        const run = () =>
            idempotency.execute(
                fixture.organizerId,
                key,
                'POST',
                `/v1/matches/${fixture.matchId}/conversation/messages`,
                { text: canary },
                201,
                (tx) => communications.send(fixture.organizerId, fixture.matchId, canary, tx)
            );
        const first = await run();
        const replay = await run();

        expect(first.replayed).toBe(false);
        expect(replay).toMatchObject({ replayed: true, value: first.value });
        await expect(
            prisma.chatMessage.count({ where: { conversation: { matchId: fixture.matchId }, kind: 'USER' } })
        ).resolves.toBe(1);
        const payloads = await prisma.outboxEvent.findMany({
            where: { type: 'communication.chat.stream.changed.v1' },
            orderBy: { occurredAt: 'desc' },
            take: 1,
            select: { payload: true },
        });
        expect(JSON.stringify(payloads)).not.toContain(canary);
    });

    it('keeps concurrent sends in database sequence order and closes reconnect and backward pagination gaps', async () => {
        const fixture = await conversationFixture(prisma, outbox, events);
        for (let index = 1; index <= 48; index += 1) {
            await prisma.$transaction((tx) =>
                communications.send(fixture.organizerId, fixture.matchId, `Сообщение ${String(index)}`, tx)
            );
        }
        await Promise.all(
            [49, 50, 51, 52].map((index) =>
                prisma.$transaction((tx) =>
                    communications.send(fixture.organizerId, fixture.matchId, `Параллельное ${String(index)}`, tx)
                )
            )
        );

        const snapshot = (await communications.snapshot(fixture.participantId, fixture.matchId)) as Snapshot;
        expect(snapshot.messages.map((message) => message.sequence)).toEqual(
            Array.from({ length: 50 }, (_, index) => index + 3)
        );
        expect(snapshot.backwardCursor).not.toBeNull();
        const older = (await communications.history(
            fixture.participantId,
            fixture.matchId,
            snapshot.backwardCursor ?? '',
            50
        )) as MessagePage;
        expect(older.items.map((message) => message.sequence)).toEqual([1, 2]);

        await prisma.$transaction((tx) =>
            communications.send(fixture.organizerId, fixture.matchId, 'После отключения 1', tx)
        );
        await prisma.$transaction((tx) =>
            communications.send(fixture.organizerId, fixture.matchId, 'После отключения 2', tx)
        );
        const catchUp = (await communications.history(
            fixture.participantId,
            fixture.matchId,
            snapshot.catchUpCursor,
            50
        )) as MessagePage;
        expect(catchUp.items.map((message) => message.sequence)).toEqual([53, 54]);
        expect(new Set([...older.items, ...snapshot.messages, ...catchUp.items].map((item) => item.id)).size).toBe(54);
    });

    it('hides blocked text, stores encrypted revision-bound evidence and denies writes after leaving', async () => {
        const fixture = await conversationFixture(prisma, outbox, events);
        const created = (await prisma.$transaction((tx) =>
            communications.send(fixture.organizerId, fixture.matchId, 'Текст для жалобы', tx)
        )) as { id: string; revision: number };
        await prisma.$transaction((tx) => communications.block(fixture.participantId, fixture.organizerId, tx));
        const blocked = (await communications.snapshot(fixture.participantId, fixture.matchId)) as Snapshot;
        expect(blocked.messages.at(-1)).toMatchObject({ id: created.id, text: null });
        expect(blocked.conversation.unreadCount).toBe(0);
        const operationId = uuidV7();
        await prisma.$transaction((tx) =>
            communications.report(
                fixture.participantId,
                fixture.matchId,
                created.id,
                created.revision,
                ChatReportReasonDto.HARASSMENT,
                operationId,
                tx
            )
        );
        const report = await prisma.chatMessageReport.findFirstOrThrow({ where: { operationId } });
        expect(Buffer.from(report.evidenceCiphertext).toString('utf8')).not.toContain('Текст для жалобы');

        await prisma.matchParticipant.updateMany({
            where: { matchId: fixture.matchId, userId: fixture.participantId },
            data: { resolvedAt: new Date(), state: 'LEFT' },
        });
        const eventId = await domainEvent(outbox, prisma, 'match.roster.changed.v1', fixture.matchId);
        await events.process({ eventId, schemaVersion: 1, type: 'match.roster.changed.v1' });
        await expect(
            prisma.$transaction((tx) =>
                communications.send(fixture.participantId, fixture.matchId, 'Запись после выхода', tx)
            )
        ).rejects.toMatchObject({ code: 'CONVERSATION_ACCESS_DENIED' });
    });

    it('survives queue outage, bounds provider retries, suppresses duplicate jobs and retries a terminal row', async () => {
        const fixture = await conversationFixture(prisma, outbox, events);
        const crypto = application.get(CommunicationCryptoService);
        await prisma.identity.create({
            data: {
                id: uuidV7(),
                encryptionKeyVersion: 1,
                linkedAt: new Date(),
                provider: IdentityProvider.EMAIL,
                subjectCiphertext: crypto.encrypt('nobody@example.invalid'),
                subjectKey: crypto.fingerprint(`email:${uuidV7()}`),
                userId: fixture.participantId,
            },
        });
        await prisma.notificationPreference.create({
            data: {
                channels: {
                    create: {
                        category: NotificationCategory.CHAT,
                        channel: NotificationChannel.EMAIL,
                        enabled: true,
                    },
                },
                tzdataVersion: 'test',
                userId: fixture.participantId,
            },
        });
        const notification = await prisma.notification.create({
            data: {
                category: NotificationCategory.CHAT,
                id: uuidV7(),
                recipientId: fixture.participantId,
                route: `/matches/${fixture.matchId}/chat`,
                sourceEventId: uuidV7(),
                type: 'CHAT_MESSAGE',
            },
        });
        const delivery = await prisma.notificationDelivery.create({
            data: {
                channel: NotificationChannel.EMAIL,
                id: uuidV7(),
                idempotencyKey: uuidV7(),
                notificationId: notification.id,
            },
        });
        const queue = application.get(NotificationDeliveryQueueService);
        const publish = jest.spyOn(queue, 'publish').mockRejectedValueOnce(new Error('redis unavailable'));
        const dispatcher = application.get(NotificationDeliveryDispatcherService);
        await dispatcher.dispatchBatch();
        await expect(
            prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
        ).resolves.toMatchObject({ attempts: 0, status: 'PENDING' });

        const provider = application.get(EmailNotificationProvider);
        Object.defineProperty(provider, 'enabled', { configurable: true, value: true });
        const send = jest
            .spyOn(provider, 'send')
            .mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
        const worker = application.get(NotificationDeliveryWorkerService);
        await worker.process(delivery.id);
        await expect(
            prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
        ).resolves.toMatchObject({ attempts: 1, lastErrorCode: 'PROVIDER_TIMEOUT', status: 'DEFERRED' });

        const environment = application.get<Environment>(ENVIRONMENT);
        await prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
                attempts: environment.COMMUNICATION_DELIVERY_MAX_ATTEMPTS - 1,
                notBefore: new Date(0),
                status: 'PENDING',
            },
        });
        await worker.process(delivery.id);
        const failed = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
        expect(failed).toMatchObject({
            attempts: environment.COMMUNICATION_DELIVERY_MAX_ATTEMPTS,
            lastErrorCode: 'PROVIDER_TIMEOUT',
            status: 'FAILED',
        });
        expect(failed.terminalAt).not.toBeNull();

        await expect(dispatcher.retryFailed(delivery.id)).resolves.toBe(true);
        send.mockResolvedValue({ providerCode: 'email-test' });
        await worker.process(delivery.id);
        await worker.process(delivery.id);
        await expect(
            prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
        ).resolves.toMatchObject({ attempts: 1, providerCode: 'email-test', status: 'ACCEPTED' });
        expect(send).toHaveBeenCalledTimes(3);
        expect(send.mock.calls.at(-1)?.[0].idempotencyKey).toBe(delivery.idempotencyKey);
        publish.mockRestore();
    });
});

async function conversationFixture(
    prisma: PrismaService,
    outbox: OutboxService,
    events: CommunicationEventWorkerService
) {
    const organizerId = uuidV7();
    const participantId = uuidV7();
    const matchId = uuidV7();
    const now = new Date();
    await prisma.user.createMany({ data: [{ id: organizerId }, { id: participantId }] });
    await prisma.match.create({
        data: {
            id: matchId,
            organizerId,
            participants: {
                create: [
                    { id: uuidV7(), isOrganizer: true, joinedAt: now, team: 'TEAM_A', userId: organizerId },
                    { id: uuidV7(), joinedAt: now, team: 'TEAM_B', userId: participantId },
                ],
            },
            state: 'PUBLISHED',
        },
    });
    const eventId = await domainEvent(outbox, prisma, 'match.published.v1', matchId);
    await events.process({ eventId, schemaVersion: 1, type: 'match.published.v1' });
    return { matchId, organizerId, participantId };
}

async function domainEvent(outbox: OutboxService, prisma: PrismaService, type: string, matchId: string) {
    const occurredAt = new Date();
    return prisma.$transaction((tx: Prisma.TransactionClient) =>
        outbox.enqueue(tx, {
            correlationId: uuidV7(),
            occurredAt,
            payload: {
                correlationId: uuidV7(),
                data: { aggregateVersion: 1, matchId, rosterComplete: false },
                messageId: uuidV7(),
                occurredAt: occurredAt.toISOString(),
                type,
            },
            schemaVersion: 1,
            type,
        })
    );
}
