import assert from 'node:assert/strict';
import test from 'node:test';
import { GamesController } from '../src/games.controller.js';

const organizerId = '00000000-0000-4000-8000-000000000001';
const request = (key = 'synthetic-idempotency-key-1') => ({
    userId: organizerId,
    header: (name: string) => (name.toLowerCase() === 'idempotency-key' ? key : 'synthetic-request-id'),
});
const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const validBody = (organizerParticipates = true) => ({
    venueName: '  Court A  ',
    venueAddress: 'Moscow, Example street',
    startsAt: futureStart,
    durationMinutes: 120,
    participantLimit: 8,
    organizerParticipates,
});

function fixture() {
    const games = new Map<string, Record<string, any>>();
    const idempotency = new Map<string, { requestHash: string; response: Record<string, unknown> }>();
    let sequence = 1;
    const client = {
        idempotencyRecord: {
            findUnique: async ({ where }: any) =>
                idempotency.get(`${where.userId_key.userId}:${where.userId_key.key}`) ?? null,
            create: async ({ data }: any) => {
                idempotency.set(`${data.userId}:${data.key}`, {
                    requestHash: data.requestHash,
                    response: data.response,
                });
            },
        },
        game: {
            create: async ({ data, include }: any) => {
                const row = {
                    id: `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
                    organizerId: data.organizerId,
                    venueName: data.venueName,
                    address: data.address,
                    startsAt: data.startsAt,
                    durationMinutes: data.durationMinutes,
                    participantLimit: data.participantLimit,
                    level: data.level,
                    description: data.description,
                    status: 'OPEN',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    participants: data.participants
                        ? [
                              {
                                  userId: data.participants.create.userId,
                                  joinedAt: new Date(),
                                  user: { displayName: 'Player' },
                              },
                          ]
                        : [],
                };
                games.set(row.id, row);
                return row;
            },
            findMany: async () => [],
            findUnique: async ({ where }: any) => games.get(where.id) ?? null,
        },
        $transaction: async (callback: (tx: any) => unknown) => callback(client),
    };
    return { controller: new GamesController(client as never), games, idempotency };
}

test('creates a game with a participating organizer and replays an identical idempotent request', async () => {
    const { controller, games } = fixture();
    const created = await controller.create(validBody() as never, request() as never);
    const replay = await controller.create(validBody() as never, request() as never);
    assert.equal(games.size, 1);
    assert.deepEqual(replay, created);
    assert.equal(created.participantCount, 1);
    assert.equal(created.organizerParticipates, true);
    assert.equal((created.participants as unknown[]).length, 1);
});

test('creates an organizer-only game without a participant row', async () => {
    const { controller } = fixture();
    const created = await controller.create(validBody(false) as never, request() as never);
    assert.equal(created.participantCount, 0);
    assert.equal(created.organizerParticipates, false);
    assert.deepEqual(created.participants, []);
});

test('rejects idempotency key reuse with a different request', async () => {
    const { controller } = fixture();
    await controller.create(validBody() as never, request() as never);
    await assert.rejects(
        controller.create({ ...validBody(), venueName: 'Other venue' } as never, request() as never),
        (error: any) => error.getStatus() === 409 && error.getResponse().code === 'IDEMPOTENCY_KEY_REUSED'
    );
});

test('rejects invalid fields and a past start time', async () => {
    const { controller } = fixture();
    await assert.rejects(
        controller.create({ ...validBody(), participantLimit: 1 } as never, request() as never),
        (error: any) => error.getStatus() === 400
    );
    await assert.rejects(
        controller.create({ ...validBody(), startsAt: '2020-01-01T00:00:00Z' } as never, request() as never),
        (error: any) => error.getStatus() === 400
    );
});

test('returns a stable not found error for an unknown game', async () => {
    const { controller } = fixture();
    await assert.rejects(
        controller.get('00000000-0000-4000-8000-999999999999', { header: () => 'synthetic-request-id' } as never),
        (error: any) => error.getStatus() === 404 && error.getResponse().code === 'GAME_NOT_FOUND'
    );
});
