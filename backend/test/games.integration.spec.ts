import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { GamesController } from '../src/games.controller.js';

test('participation transactions on PostgreSQL', { skip: !process.env.S13_INTEGRATION }, async () => {
    const prisma = new PrismaClient();
    const controller = new GamesController(prisma as never);
    const users = Array.from({ length: 4 }, () => randomUUID());
    const [organizer, first, second] = users as [string, string, string, string];
    const request = (userId: string, key = randomUUID()) => ({
        userId,
        header: (name: string) => (name.toLowerCase() === 'idempotency-key' ? key : 'synthetic-request-id'),
    });
    const createGame = async (options: { startsAt?: Date; status?: 'OPEN' | 'CANCELLED' } = {}) => {
        return prisma.game.create({
            data: {
                organizerId: organizer,
                venueName: 'Synthetic court',
                address: 'Synthetic address',
                startsAt: options.startsAt ?? new Date(Date.now() + 3_600_000),
                durationMinutes: 60,
                participantLimit: 2,
                status: options.status ?? 'OPEN',
                participants: { create: { userId: organizer } },
            },
        });
    };

    try {
        await prisma.$connect();
        await prisma.user.createMany({ data: users.map((id) => ({ id, displayName: 'Synthetic player' })) });

        const game = await createGame();
        const [one, two] = await Promise.allSettled([
            controller.join(game.id, request(first) as never),
            controller.join(game.id, request(second) as never),
        ]);
        const results = [one, two];
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
        const rejected = results.find((result) => result.status === 'rejected');
        assert.equal(rejected?.reason.getStatus(), 409);
        assert.equal(rejected?.reason.getResponse().code, 'GAME_FULL');
        assert.equal(await prisma.gameParticipant.count({ where: { gameId: game.id } }), 2);

        const winner = one.status === 'fulfilled' ? first : second;
        const loser = winner === first ? second : first;
        const retryKey = randomUUID();
        const retry = await controller.join(game.id, request(winner, retryKey) as never);
        assert.equal(retry.participantCount, 2);
        assert.deepEqual(await controller.join(game.id, request(winner, retryKey) as never), retry);
        assert.equal(await prisma.gameParticipant.count({ where: { gameId: game.id, userId: winner } }), 1);

        const leaveKey = randomUUID();
        const left = await controller.leave(game.id, request(winner, leaveKey) as never);
        assert.equal(left.participantCount, 1);
        assert.deepEqual(await controller.leave(game.id, request(winner, leaveKey) as never), left);
        assert.equal((await controller.leave(game.id, request(winner) as never)).participantCount, 1);
        assert.equal((await controller.join(game.id, request(loser) as never)).participantCount, 2);
        assert.equal((await controller.leave(game.id, request(organizer) as never)).organizerId, organizer);
        assert.equal((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).organizerId, organizer);

        const duplicateGame = await createGame();
        const duplicateRequests = await Promise.all([
            controller.join(duplicateGame.id, request(first) as never),
            controller.join(duplicateGame.id, request(first) as never),
        ]);
        assert.equal(duplicateRequests[0].participantCount, 2);
        assert.equal(duplicateRequests[1].participantCount, 2);
        assert.equal(await prisma.gameParticipant.count({ where: { gameId: duplicateGame.id, userId: first } }), 1);
        const reusedKey = randomUUID();
        await controller.leave(duplicateGame.id, request(first, reusedKey) as never);
        await assert.rejects(
            controller.join(duplicateGame.id, request(first, reusedKey) as never),
            (error: any) => error.getStatus() === 409 && error.getResponse().code === 'IDEMPOTENCY_KEY_REUSED'
        );

        const otherGame = await createGame();
        const sharedKey = randomUUID();
        const crossGame = await Promise.allSettled([
            controller.join(duplicateGame.id, request(second, sharedKey) as never),
            controller.join(otherGame.id, request(second, sharedKey) as never),
        ]);
        assert.equal(crossGame.filter((result) => result.status === 'fulfilled').length, 1);
        const reused = crossGame.find((result) => result.status === 'rejected');
        assert.equal(reused?.reason.getStatus(), 409);
        assert.equal(reused?.reason.getResponse().code, 'IDEMPOTENCY_KEY_REUSED');

        const cancelled = await createGame({ status: 'CANCELLED' });
        await assert.rejects(
            controller.join(cancelled.id, request(first) as never),
            (error: any) => error.getStatus() === 410 && error.getResponse().code === 'GAME_CANCELLED'
        );
        await assert.rejects(
            controller.leave(cancelled.id, request(organizer) as never),
            (error: any) => error.getStatus() === 410 && error.getResponse().code === 'GAME_CANCELLED'
        );
        const started = await createGame({ startsAt: new Date(Date.now() - 60_000) });
        await assert.rejects(
            controller.join(started.id, request(first) as never),
            (error: any) => error.getStatus() === 409 && error.getResponse().code === 'GAME_CONFLICT'
        );
        await assert.rejects(
            controller.leave(started.id, request(organizer) as never),
            (error: any) => error.getStatus() === 409 && error.getResponse().code === 'GAME_CONFLICT'
        );
    } finally {
        await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: users } } });
        await prisma.game.deleteMany({ where: { organizerId: organizer } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
        await prisma.$disconnect();
    }
});
