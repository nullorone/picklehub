import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { NotificationWorker } from '../src/notification-worker.js';

test(
    'durable fanout, parallel claims, retries and stale lease recovery',
    { skip: !process.env.S17_INTEGRATION },
    async () => {
        const prisma = new PrismaClient();
        const [organizer, player, removed] = [randomUUID(), randomUUID(), randomUUID()];
        let gameId: string | undefined;
        const chatBase = BigInt(randomInt(1_000_000_000, 2_000_000_000));
        const chatIds = [chatBase, chatBase + 1n, chatBase + 2n] as const;
        const sent: bigint[] = [];
        let failure: 'none' | 'temporary' | 'permanent' = 'none';
        const sender = async (_token: string, chatId: bigint) => {
            sent.push(chatId);
            if (failure === 'temporary') return { kind: 'retry' as const, code: 'TELEGRAM_UNAVAILABLE' };
            if (failure === 'permanent') return { kind: 'permanent' as const, code: 'TELEGRAM_FORBIDDEN' };
            return { kind: 'sent' as const, code: 'SENT' };
        };
        const worker1 = new NotificationWorker(prisma, 'synthetic-token', 'https://example.test/app/', sender);
        const worker2 = new NotificationWorker(prisma, 'synthetic-token', 'https://example.test/app/', sender);
        try {
            await prisma.$connect();
            await prisma.user.createMany({ data: [organizer, player, removed].map((id) => ({ id })) });
            for (const [userId, chatId] of [
                [organizer, chatIds[0]],
                [player, chatIds[1]],
                [removed, chatIds[2]],
            ] as const) {
                await prisma.telegramIdentity.create({
                    data: {
                        userId,
                        telegramUserId: chatId,
                        privateChatId: chatId,
                        canMessage: true,
                    },
                });
            }
            const game = await prisma.game.create({
                data: {
                    organizerId: organizer,
                    venueName: 'Synthetic venue',
                    address: 'Synthetic address',
                    startsAt: new Date(Date.now() + 86_400_000),
                    durationMinutes: 90,
                    participantLimit: 8,
                },
            });
            gameId = game.id;
            const event = await prisma.job.create({
                data: {
                    gameId: game.id,
                    type: 'GAME_UPDATED',
                    eventVersion: 2,
                    deduplicationKey: `${game.id}:2:GAME_UPDATED`,
                    payload: {
                        recipientUserIds: [organizer, player],
                        game: {
                            venueName: game.venueName,
                            address: game.address,
                            startsAt: game.startsAt.toISOString(),
                        },
                    },
                },
            });
            await Promise.all([worker1.runOne(), worker2.runOne()]);
            assert.equal(await prisma.job.count({ where: { gameId, type: 'TELEGRAM_DELIVERY' } }), 2);
            assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: event.id } })).status, 'COMPLETED');
            await Promise.all([worker1.runOne(), worker2.runOne()]);
            await Promise.all([worker1.runOne(), worker2.runOne()]);
            assert.deepEqual(sent.sort(), [chatIds[0], chatIds[1]]);
            assert.equal(
                await prisma.job.count({ where: { gameId, type: 'TELEGRAM_DELIVERY', status: 'COMPLETED' } }),
                2
            );

            const removedJob = await prisma.job.create({
                data: {
                    gameId: game.id,
                    type: 'PARTICIPANT_REMOVED',
                    eventVersion: 3,
                    deduplicationKey: `${game.id}:3:PARTICIPANT_REMOVED`,
                    payload: {
                        recipientUserId: removed,
                        game: {
                            venueName: game.venueName,
                            address: game.address,
                            startsAt: game.startsAt.toISOString(),
                        },
                    },
                },
            });
            await worker1.runOne();
            const delivery = await prisma.job.findFirstOrThrow({
                where: {
                    deduplicationKey: `${removedJob.deduplicationKey}:${removed}`,
                },
            });
            failure = 'temporary';
            await worker1.runOne();
            assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: delivery.id } })).status, 'PENDING');
            await prisma.job.update({ where: { id: delivery.id }, data: { availableAt: new Date(0) } });
            failure = 'permanent';
            await worker2.runOne();
            assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: delivery.id } })).status, 'DEAD');
            assert.equal(
                (await prisma.telegramIdentity.findUniqueOrThrow({ where: { userId: removed } })).canMessage,
                false
            );

            const recovered = await prisma.job.create({
                data: {
                    gameId: game.id,
                    type: 'TELEGRAM_DELIVERY',
                    eventVersion: 4,
                    deduplicationKey: `${game.id}:4:recovery`,
                    status: 'PROCESSING',
                    attempts: 1,
                    lockedBy: 'crashed-worker',
                    lockedAt: new Date(Date.now() - 120_000),
                    payload: { recipientUserId: player, text: 'Synthetic recovery' },
                },
            });
            failure = 'none';
            await worker2.runOne();
            assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: recovered.id } })).status, 'COMPLETED');
            assert.equal(sent.at(-1), chatIds[1]);
        } finally {
            if (gameId) {
                await prisma.job.deleteMany({ where: { gameId } });
                await prisma.game.delete({ where: { id: gameId } });
            }
            await prisma.user.deleteMany({ where: { id: { in: [organizer, player, removed] } } });
            await prisma.$disconnect();
        }
    }
);
