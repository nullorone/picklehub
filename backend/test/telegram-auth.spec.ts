import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { hashSessionToken, validateTelegramInitData } from '../src/telegram-auth.js';
import { TelegramSessionsController } from '../src/telegram-sessions.controller.js';

const botToken = '123456:synthetic-test-token';
const now = 1_800_000_000;

function makeInitData(authDate = Math.floor(Date.now() / 1000)): string {
    const entries = [
        ['auth_date', String(authDate)],
        ['user', JSON.stringify({ id: 12345, first_name: 'Test Player' })],
        ['query_id', 'synthetic-query'],
    ];
    const dataCheckString = entries
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    return new URLSearchParams([...entries, ['hash', hash]]).toString();
}

test('accepts correctly signed Telegram initData and returns verified identity', () => {
    assert.deepEqual(validateTelegramInitData(makeInitData(now), botToken, now), {
        id: '12345',
        first_name: 'Test Player',
    });
});

test('rejects forged Telegram initData', () => {
    assert.throws(() => validateTelegramInitData(makeInitData(now).replace('Test+Player', 'Attacker'), botToken, now));
});

test('rejects expired and future Telegram initData', () => {
    assert.throws(() => validateTelegramInitData(makeInitData(now - 86401), botToken, now));
    assert.throws(() => validateTelegramInitData(makeInitData(now + 31), botToken, now));
});

test('hashes credentials without preserving the raw token', () => {
    assert.notEqual(hashSessionToken('synthetic-access-token'), 'synthetic-access-token');
    assert.equal(hashSessionToken('synthetic-access-token'), hashSessionToken('synthetic-access-token'));
});

test('creates a session for the signed Telegram identity and stores only its token hash', async () => {
    const priorToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = botToken;
    let storedSession: { userId: string; tokenHash: string; expiresAt: Date } | undefined;
    const prisma = {
        telegramIdentity: {
            findUnique: async () => null,
        },
        user: {
            create: async () => ({ id: '00000000-0000-4000-8000-000000000123' }),
        },
        session: {
            create: async ({ data }: { data: typeof storedSession }) => {
                storedSession = data;
            },
        },
    } as never;
    const request = { ip: '192.0.2.1', header: () => 'test-request-id' } as never;
    try {
        const response = await new TelegramSessionsController(prisma).create({ initData: makeInitData() }, request);
        assert.equal(response.user.id, '00000000-0000-4000-8000-000000000123');
        assert.equal(response.user.displayName, 'Test Player');
        assert.equal(response.tokenType, 'Bearer');
        assert.ok(Date.parse(response.expiresAt) > Date.now());
        assert.equal(storedSession?.userId, response.user.id);
        assert.equal(storedSession?.tokenHash, hashSessionToken(response.accessToken));
        assert.notEqual(storedSession?.tokenHash, response.accessToken);
    } finally {
        if (priorToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
        else process.env.TELEGRAM_BOT_TOKEN = priorToken;
    }
});
