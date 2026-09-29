import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { GamesController } from '../src/games.controller.js';

test(
    'organizer actions preserve rights, capacity, jobs and reminders',
    { skip: !process.env.S14_INTEGRATION },
    async () => {
        const prisma = new PrismaClient();
        const controller = new GamesController(prisma as never);
        const [organizer, player, contender] = [randomUUID(), randomUUID(), randomUUID()];
        const users = [organizer, player, contender];
        const request = (userId: string, key = randomUUID()) => ({
            userId,
            header: (name: string) => (name.toLowerCase() === 'idempotency-key' ? key : 'synthetic-request-id'),
        });
        const future = (hours: number) => new Date(Date.now() + hours * 3_600_000);
        const createGame = (limit = 2) =>
            prisma.game.create({
                data: {
                    organizerId: organizer,
                    venueName: 'Synthetic court',
                    address: 'Synthetic address',
                    startsAt: future(5),
                    durationMinutes: 60,
                    participantLimit: limit,
                    participants: { create: { userId: organizer } },
                },
            });
        const fails = (status: number, code: string) => (error: any) =>
            error.getStatus() === status && error.getResponse().code === code;

        try {
            await prisma.$connect();
            await prisma.user.createMany({ data: users.map((id) => ({ id, displayName: 'Synthetic player' })) });
            const created = await controller.create(
                {
                    venueName: 'Synthetic court',
                    venueAddress: 'Synthetic address',
                    startsAt: future(5).toISOString(),
                    durationMinutes: 60,
                    participantLimit: 2,
                    organizerParticipates: true,
                },
                request(organizer) as never
            );
            assert.equal(await prisma.job.count({ where: { gameId: created.id as string, type: 'GAME_REMINDER' } }), 1);
            const game = await createGame();
            await controller.join(game.id, request(player) as never);
            await assert.rejects(
                controller.update(game.id, { participantLimit: 3 }, request(player) as never),
                fails(403, 'FORBIDDEN')
            );
            await assert.rejects(
                controller.removeParticipant(game.id, organizer, request(player) as never),
                fails(403, 'FORBIDDEN')
            );
            await assert.rejects(controller.cancel(game.id, request(player) as never), fails(403, 'FORBIDDEN'));
            await controller.update(game.id, { participantLimit: 3 }, request(organizer) as never);
            await controller.join(game.id, request(contender) as never);
            await assert.rejects(
                controller.update(game.id, { participantLimit: 2 }, request(organizer) as never),
                fails(409, 'GAME_CONFLICT')
            );
            await controller.removeParticipant(game.id, contender, request(organizer) as never);
            await controller.update(game.id, { participantLimit: 2 }, request(organizer) as never);
            await assert.rejects(
                controller.update(
                    game.id,
                    { organizerParticipates: false, participantLimit: 0 },
                    request(organizer) as never
                ),
                fails(400, 'VALIDATION_ERROR')
            );

            const removed = await controller.removeParticipant(game.id, player, request(organizer) as never);
            assert.equal(removed.participantCount, 1);
            assert.equal(await prisma.job.count({ where: { gameId: game.id, type: 'PARTICIPANT_REMOVED' } }), 2);
            const switchedOff = await controller.update(
                game.id,
                { organizerParticipates: false },
                request(organizer) as never
            );
            assert.equal(switchedOff.organizerParticipates, false);
            assert.equal(switchedOff.organizerId, organizer);
            await controller.join(game.id, request(player) as never);
            await controller.join(game.id, request(contender) as never);
            await assert.rejects(
                controller.update(game.id, { organizerParticipates: true }, request(organizer) as never),
                fails(409, 'GAME_CONFLICT')
            );
            await controller.removeParticipant(game.id, contender, request(organizer) as never);
            assert.equal(
                (await controller.update(game.id, { organizerParticipates: true }, request(organizer) as never))
                    .participantCount,
                2
            );

            const initialTime = future(6);
            await prisma.job.create({
                data: {
                    gameId: game.id,
                    type: 'GAME_REMINDER',
                    eventVersion: 1,
                    deduplicationKey: `${game.id}:1:GAME_REMINDER`,
                    availableAt: future(3),
                },
            });
            const editKey = randomUUID();
            const edited = await controller.update(
                game.id,
                { startsAt: initialTime.toISOString(), venueName: 'New court' },
                request(organizer, editKey) as never
            );
            assert.equal(edited.venueName, 'New court');
            assert.deepEqual(
                await controller.update(
                    game.id,
                    { venueName: 'New court', startsAt: initialTime.toISOString() },
                    request(organizer, editKey) as never
                ),
                edited
            );
            await controller.update(game.id, { venueName: 'New court' }, request(organizer) as never);
            assert.equal(await prisma.job.count({ where: { gameId: game.id, type: 'GAME_UPDATED' } }), 3);
            const reminders = await prisma.job.findMany({ where: { gameId: game.id, type: 'GAME_REMINDER' } });
            assert.equal(reminders.length, 2);
            assert.equal(
                reminders.find((job) => job.status === 'PENDING')?.availableAt.getTime(),
                initialTime.getTime() - 7_200_000
            );
            assert.equal(reminders.find((job) => job.status === 'DEAD')?.lastErrorCode, 'REMINDER_STALE');

            const cancelKey = randomUUID();
            const cancelled = await controller.cancel(game.id, request(organizer, cancelKey) as never);
            assert.equal(cancelled.status, 'CANCELLED');
            assert.equal(cancelled.participantCount, 2);
            assert.deepEqual(await controller.cancel(game.id, request(organizer, cancelKey) as never), cancelled);
            assert.equal((await controller.cancel(game.id, request(organizer) as never)).status, 'CANCELLED');
            assert.equal(await prisma.job.count({ where: { gameId: game.id, type: 'GAME_CANCELLED' } }), 1);
            assert.equal(
                await prisma.job.count({ where: { gameId: game.id, type: 'GAME_REMINDER', status: 'PENDING' } }),
                0
            );
            await assert.rejects(controller.join(game.id, request(contender) as never), fails(410, 'GAME_CANCELLED'));

            const raceGame = await createGame(3);
            await controller.join(raceGame.id, request(player) as never);
            const race = await Promise.allSettled([
                controller.join(raceGame.id, request(contender) as never),
                controller.update(raceGame.id, { participantLimit: 2 }, request(organizer) as never),
            ]);
            assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
            const raceState = await prisma.game.findUniqueOrThrow({
                where: { id: raceGame.id },
                include: { participants: true },
            });
            assert.ok(raceState.participants.length <= raceState.participantLimit);

            const cancelRaceGame = await createGame();
            const cancelRace = await Promise.allSettled([
                controller.join(cancelRaceGame.id, request(player) as never),
                controller.cancel(cancelRaceGame.id, request(organizer) as never),
            ]);
            assert.equal(cancelRace.filter((result) => result.status === 'fulfilled').length >= 1, true);
            assert.equal(
                (await prisma.game.findUniqueOrThrow({ where: { id: cancelRaceGame.id } })).status,
                'CANCELLED'
            );
            assert.equal(await prisma.job.count({ where: { gameId: cancelRaceGame.id, type: 'GAME_CANCELLED' } }), 1);

            const rollbackGame = await createGame();
            await prisma.$executeRawUnsafe(
                `CREATE FUNCTION s14_reject_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type IN ('GAME_UPDATED', 'GAME_CANCELLED', 'PARTICIPANT_REMOVED') THEN RAISE EXCEPTION 'synthetic job failure'; END IF; RETURN NEW; END $$`
            );
            await prisma.$executeRawUnsafe(
                'CREATE TRIGGER s14_reject_job_trigger BEFORE INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION s14_reject_job()'
            );
            await assert.rejects(
                controller.update(rollbackGame.id, { venueName: 'Must roll back' }, request(organizer) as never)
            );
            assert.equal(
                (await prisma.game.findUniqueOrThrow({ where: { id: rollbackGame.id } })).venueName,
                'Synthetic court'
            );
            assert.equal(await prisma.job.count({ where: { gameId: rollbackGame.id } }), 0);
            await assert.rejects(controller.removeParticipant(rollbackGame.id, organizer, request(organizer) as never));
            assert.equal(await prisma.gameParticipant.count({ where: { gameId: rollbackGame.id } }), 1);
            await assert.rejects(controller.cancel(rollbackGame.id, request(organizer) as never));
            assert.equal((await prisma.game.findUniqueOrThrow({ where: { id: rollbackGame.id } })).status, 'OPEN');
        } finally {
            await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS s14_reject_job_trigger ON jobs');
            await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS s14_reject_job()');
            await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: users } } });
            await prisma.job.deleteMany({ where: { game: { organizerId: organizer } } });
            await prisma.game.deleteMany({ where: { organizerId: organizer } });
            await prisma.user.deleteMany({ where: { id: { in: users } } });
            await prisma.$disconnect();
        }
    }
);
