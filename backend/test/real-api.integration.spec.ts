import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { createApiClient } from '../../frontend/packages/api/src/index.ts';

const botToken = '123456:synthetic-integration-token';

function initData(id: number): string {
    const entries = [
        ['auth_date', String(Math.floor(Date.now() / 1000))],
        ['user', JSON.stringify({ id, first_name: `Test ${id}` })],
    ];
    const check = entries
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = createHmac('sha256', secret).update(check).digest('hex');
    return new URLSearchParams([...entries, ['hash', hash]]).toString();
}

test(
    'generated client shares durable games between two signed accounts',
    { skip: !process.env.S15_INTEGRATION },
    async () => {
        const prior = process.env.TELEGRAM_BOT_TOKEN;
        process.env.TELEGRAM_BOT_TOKEN = botToken;
        const { AppModule } = await import('../dist/app.module.js');
        const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
        let closed = false;
        try {
            await app.listen(0, '127.0.0.1');
            const address = app.getHttpServer().address() as { port: number };
            const baseUrl = `http://127.0.0.1:${address.port}`;
            const anonymous = createApiClient(baseUrl);
            const firstResponse = await anonymous.POST('/sessions/telegram', { body: { initData: initData(9915001) } });
            const secondResponse = await anonymous.POST('/sessions/telegram', {
                body: { initData: initData(9915002) },
            });
            assert.ok(firstResponse.data, `first login: ${firstResponse.response.status} ${firstResponse.error?.code}`);
            assert.ok(
                secondResponse.data,
                `second login: ${secondResponse.response.status} ${secondResponse.error?.code}`
            );
            const first = firstResponse.data;
            const second = secondResponse.data;
            const organizer = createApiClient(baseUrl, first.accessToken);
            const player = createApiClient(baseUrl, second.accessToken);
            const created = await organizer.POST('/games', {
                params: { header: { 'Idempotency-Key': randomUUID() } },
                body: {
                    venueName: 'Synthetic integration court',
                    venueAddress: 'Synthetic integration address',
                    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
                    durationMinutes: 90,
                    participantLimit: 2,
                    organizerParticipates: true,
                },
            });
            assert.equal(created.response.status, 201);
            assert.ok(created.data);
            const gameId = created.data.id;
            assert.ok((await player.GET('/games')).data?.items.some((game) => game.id === gameId));
            const join = await player.PUT('/games/{gameId}/participation', {
                params: { path: { gameId }, header: { 'Idempotency-Key': randomUUID() } },
            });
            assert.equal(join.data?.participantCount, 2);
            assert.equal(
                (await organizer.GET('/games/{gameId}', { params: { path: { gameId } } })).data?.participantCount,
                2
            );
            const leave = await player.DELETE('/games/{gameId}/participation', {
                params: { path: { gameId }, header: { 'Idempotency-Key': randomUUID() } },
            });
            assert.equal(leave.data?.participantCount, 1);
            const rejoined = await player.PUT('/games/{gameId}/participation', {
                params: { path: { gameId }, header: { 'Idempotency-Key': randomUUID() } },
            });
            assert.equal(rejoined.data?.participantCount, 2);
            const removed = await organizer.DELETE('/games/{gameId}/participants/{userId}', {
                params: {
                    path: { gameId, userId: second.user.id },
                    header: { 'Idempotency-Key': randomUUID() },
                },
            });
            assert.equal(removed.data?.participantCount, 1);
            const update = await organizer.PATCH('/games/{gameId}', {
                params: { path: { gameId }, header: { 'Idempotency-Key': randomUUID() } },
                body: { venueName: 'Updated synthetic court' },
            });
            assert.equal(update.data?.venueName, 'Updated synthetic court');
            const cancellation = await organizer.POST('/games/{gameId}/cancellation', {
                params: { path: { gameId }, header: { 'Idempotency-Key': randomUUID() } },
            });
            assert.equal(cancellation.data?.status, 'CANCELLED');
            await app.close();
            closed = true;
            const restarted = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
            try {
                await restarted.listen(address.port, '127.0.0.1');
                const persisted = await player.GET('/games/{gameId}', { params: { path: { gameId } } });
                assert.equal(persisted.data?.status, 'CANCELLED');
                assert.equal(persisted.data?.venueName, 'Updated synthetic court');
            } finally {
                await restarted.close();
                await assert.rejects(player.GET('/games/{gameId}', { params: { path: { gameId } } }));
            }
        } finally {
            if (!closed) await app.close();
            if (prior === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
            else process.env.TELEGRAM_BOT_TOKEN = prior;
        }
    }
);
