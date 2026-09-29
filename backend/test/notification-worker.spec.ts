import assert from 'node:assert/strict';
import test from 'node:test';
import type { Job } from '@prisma/client';
import { messageFor, reminderIsCurrent, sendTelegramMessage } from '../src/notification-worker.js';

test('reminder threshold and late window use an injected instant', () => {
    const start = new Date('2030-01-01T12:00:00.000Z');
    const due = new Date('2030-01-01T10:00:00.000Z');
    assert.equal(reminderIsCurrent(start, due, new Date(due.getTime() - 1)), false);
    assert.equal(reminderIsCurrent(start, due, due), true);
    assert.equal(reminderIsCurrent(start, due, new Date(due.getTime() + 900_000)), true);
    assert.equal(reminderIsCurrent(start, due, new Date(due.getTime() + 900_001)), false);
    assert.equal(reminderIsCurrent(start, new Date(due.getTime() + 1), due), false);
    assert.equal(reminderIsCurrent(start, due, start), false);
});

const gameId = '11111111-1111-4111-8111-111111111111';
const base = {
    id: gameId,
    gameId,
    eventVersion: 2,
    deduplicationKey: 'event',
    payload: {
        recipientUserIds: ['organizer', 'player', 'organizer'],
        game: { venueName: 'Площадка', address: 'Адрес', startsAt: '2026-10-01T15:00:00.000Z' },
    },
} as Job;

test('event messages retain the event snapshot, recipients, Moscow time and game link', () => {
    const update = messageFor({ ...base, type: 'GAME_UPDATED' }, 'https://example.test/app/');
    assert.deepEqual(update.recipients, ['organizer', 'player']);
    assert.match(update.text, /18:00.*Москва/);
    assert.match(update.text, /Площадка, Адрес/);
    assert.match(update.text, /#\/matches\/11111111-1111-4111-8111-111111111111/);
    assert.match(messageFor({ ...base, type: 'GAME_CANCELLED' }, 'https://example.test/app/').text, /отменена/);
    const removed = messageFor(
        {
            ...base,
            type: 'PARTICIPANT_REMOVED',
            payload: {
                ...(base.payload as object),
                recipientUserId: 'removed',
            },
        },
        'https://example.test/app/'
    );
    assert.deepEqual(removed.recipients, ['removed']);
    assert.match(removed.text, /удалены/);
});

test('Telegram responses distinguish success, rate limits, permanent refusal and unknown result', async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    try {
        globalThis.fetch = async (url, init) => {
            calls.push(String(url));
            assert.equal(JSON.parse(String(init?.body)).chat_id, '42');
            return { ok: true, status: 200 } as Response;
        };
        assert.deepEqual(await sendTelegramMessage('synthetic-token', 42n, 'test'), { kind: 'sent', code: 'SENT' });
        globalThis.fetch = async () =>
            ({ ok: false, status: 429, headers: new Headers({ 'retry-after': '7' }) }) as Response;
        assert.deepEqual(await sendTelegramMessage('synthetic-token', 42n, 'test'), {
            kind: 'retry',
            code: 'TELEGRAM_RATE_LIMIT',
            retryAfterMs: 7000,
        });
        globalThis.fetch = async () =>
            ({
                ok: false,
                status: 429,
                headers: new Headers(),
                json: async () => ({ parameters: { retry_after: 9 } }),
            }) as Response;
        assert.deepEqual(await sendTelegramMessage('synthetic-token', 42n, 'test'), {
            kind: 'retry',
            code: 'TELEGRAM_RATE_LIMIT',
            retryAfterMs: 9000,
        });
        globalThis.fetch = async () => ({ ok: false, status: 403 }) as Response;
        assert.deepEqual(await sendTelegramMessage('synthetic-token', 42n, 'test'), {
            kind: 'permanent',
            code: 'TELEGRAM_FORBIDDEN',
        });
        globalThis.fetch = async () => {
            throw new Error('sensitive provider response');
        };
        assert.deepEqual(await sendTelegramMessage('synthetic-token', 42n, 'test'), {
            kind: 'retry',
            code: 'TELEGRAM_RESULT_UNKNOWN',
        });
        assert.equal(calls.length, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
