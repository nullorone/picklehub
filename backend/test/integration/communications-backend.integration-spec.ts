import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { RedisService } from '../../src/common/redis/redis.service';
import { CommunicationEventWorkerService } from '../../src/communications/communication-event-worker.service';
import type { CommunicationException } from '../../src/communications/communication.errors';
import { CommunicationService } from '../../src/communications/communication.service';
import { OutboxService } from '../../src/outbox/outbox.service';

describe('chat and notification backend workflows', () => {
    let application: INestApplication;
    let prisma: PrismaService;
    let communications: CommunicationService;
    let events: CommunicationEventWorkerService;
    let outbox: OutboxService;

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        application = module.createNestApplication();
        configureApplication(application);
        await application.init();
        prisma = application.get(PrismaService);
        communications = application.get(CommunicationService);
        events = application.get(CommunicationEventWorkerService);
        outbox = application.get(OutboxService);
        await expect(application.get(RedisService).ping()).resolves.toBe(true);
    });

    afterAll(async () => {
        await application.close();
    });

    it('projects committed roster events once and freezes a former participant sequence boundary', async () => {
        const now = new Date();
        const organizerId = uuidV7();
        const participantId = uuidV7();
        const matchId = uuidV7();
        await prisma.user.createMany({ data: [{ id: organizerId }, { id: participantId }] });
        await prisma.match.create({
            data: {
                id: matchId,
                organizerId,
                state: 'PUBLISHED',
                participants: {
                    create: [
                        { id: uuidV7(), userId: organizerId, team: 'TEAM_A', isOrganizer: true, joinedAt: now },
                        { id: uuidV7(), userId: participantId, team: 'TEAM_B', joinedAt: now },
                    ],
                },
            },
        });

        const publishedId = await domainEvent(outbox, prisma, 'match.published.v1', matchId, now);
        await events.process({ eventId: publishedId, type: 'match.published.v1', schemaVersion: 1 });
        await prisma.$transaction((tx) => communications.send(participantId, matchId, 'До выхода', tx));

        await prisma.matchParticipant.updateMany({
            where: { matchId, userId: participantId },
            data: { state: 'LEFT', resolvedAt: new Date() },
        });
        const rosterId = await domainEvent(outbox, prisma, 'match.roster.changed.v1', matchId, new Date());
        await events.process({ eventId: rosterId, type: 'match.roster.changed.v1', schemaVersion: 1 });
        await events.process({ eventId: rosterId, type: 'match.roster.changed.v1', schemaVersion: 1 });
        await prisma.$transaction((tx) => communications.send(organizerId, matchId, 'После выхода', tx));

        const snapshot = (await communications.snapshot(participantId, matchId)) as {
            conversation: { accessThroughSequence: number; latestSequence: number };
            messages: { sequence: number; systemType: string | null }[];
        };
        expect(snapshot.conversation).toMatchObject({ accessThroughSequence: 2, latestSequence: 3 });
        expect(snapshot.messages.map((message) => message.sequence)).toEqual([1, 2]);
        expect(snapshot.messages[1]?.systemType).toBe('ROSTER_LEFT');
        await expect(
            prisma.$transaction((tx) => communications.send(participantId, matchId, 'Недоступно', tx))
        ).rejects.toMatchObject<Partial<CommunicationException>>({ code: 'CONVERSATION_ACCESS_DENIED' });
        await expect(
            prisma.chatMessage.count({ where: { conversation: { matchId }, sourceEventId: rosterId } })
        ).resolves.toBe(1);
        await expect(prisma.notification.count({ where: { sourceEventId: rosterId } })).resolves.toBe(2);
    });
});

async function domainEvent(
    outbox: OutboxService,
    prisma: PrismaService,
    type: string,
    matchId: string,
    occurredAt: Date
): Promise<string> {
    return prisma.$transaction((tx: Prisma.TransactionClient) =>
        outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: occurredAt.toISOString(),
                correlationId: uuidV7(),
                data: { matchId, aggregateVersion: 1, rosterComplete: false, completionSequence: 1 },
            },
            correlationId: uuidV7(),
            occurredAt,
        })
    );
}
