import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramBotController } from '../src/telegram-bot.controller.js';
import { gameIdFromStartParameter, parseStartMessage, safeSecretEquals } from '../src/telegram-bot.js';

const gameId = '11111111-1111-4111-8111-111111111111';
const update = (text: string) => ({ message: { text, from: { id: 42 }, chat: { id: 42, type: 'private' } } });

test('parses private /start and safely rejects malformed game IDs and other chats', () => {
    assert.deepEqual(parseStartMessage(update(`/start g_${gameId}`)), {
        telegramUserId: 42n,
        chatId: 42n,
        gameId,
    });
    assert.equal(parseStartMessage(update('/start g_not-a-uuid'))?.gameId, null);
    assert.equal(gameIdFromStartParameter('g_../admin'), null);
    assert.equal(
        parseStartMessage({ message: { text: '/start', from: { id: 42 }, chat: { id: -1, type: 'group' } } }),
        null
    );
    assert.equal(safeSecretEquals('wrong', 'expected'), false);
});

test('webhook authenticates updates, binds private chat and marks blocked bot unavailable', async () => {
    const old = {
        secret: process.env.TELEGRAM_WEBHOOK_SECRET,
        token: process.env.TELEGRAM_BOT_TOKEN,
        url: process.env.TELEGRAM_APP_URL,
    };
    const oldFetch = globalThis.fetch;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
    process.env.TELEGRAM_APP_URL = 'https://example.test/picklehub/';
    const writes: unknown[] = [];
    const prisma = {
        game: { findUnique: async () => ({ id: gameId }) },
        telegramIdentity: {
            upsert: async (data: unknown) => {
                writes.push(data);
                return { id: 'identity-id' };
            },
            update: async (data: unknown) => {
                writes.push(data);
            },
        },
    } as never;
    const controller = new TelegramBotController(prisma);
    try {
        await assert.rejects(controller.receive(update('/start'), 'bad'));
        assert.equal(writes.length, 0);
        globalThis.fetch = async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            assert.equal(
                body.reply_markup.inline_keyboard[0][0].web_app.url,
                `https://example.test/picklehub/#/matches/${gameId}`
            );
            return { ok: true, status: 200 } as Response;
        };
        assert.deepEqual(await controller.receive(update(`/start g_${gameId}`), 'test-secret'), { ok: true });
        assert.equal(writes.length, 1);
        globalThis.fetch = async () => ({ ok: false, status: 403 }) as Response;
        await controller.receive(update('/start'), 'test-secret');
        assert.deepEqual(writes.at(-1), { where: { id: 'identity-id' }, data: { canMessage: false } });
    } finally {
        globalThis.fetch = oldFetch;
        if (old.secret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
        else process.env.TELEGRAM_WEBHOOK_SECRET = old.secret;
        if (old.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
        else process.env.TELEGRAM_BOT_TOKEN = old.token;
        if (old.url === undefined) delete process.env.TELEGRAM_APP_URL;
        else process.env.TELEGRAM_APP_URL = old.url;
    }
});

test('unknown game opens the list without echoing the requested ID', async () => {
    const old = {
        secret: process.env.TELEGRAM_WEBHOOK_SECRET,
        token: process.env.TELEGRAM_BOT_TOKEN,
        url: process.env.TELEGRAM_APP_URL,
        fetch: globalThis.fetch,
    };
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_BOT_TOKEN = '123:test-token';
    process.env.TELEGRAM_APP_URL = 'https://example.test/picklehub/';
    const prisma = {
        game: { findUnique: async () => null },
        telegramIdentity: { upsert: async () => ({ id: 'identity-id' }) },
    } as never;
    try {
        globalThis.fetch = async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            assert.equal(body.text, 'Игра не найдена. Откройте список игр.');
            assert.equal(body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://example.test/picklehub/');
            return { ok: true, status: 200 } as Response;
        };
        await new TelegramBotController(prisma).receive(update(`/start g_${gameId}`), 'test-secret');
    } finally {
        globalThis.fetch = old.fetch;
        if (old.secret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
        else process.env.TELEGRAM_WEBHOOK_SECRET = old.secret;
        if (old.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
        else process.env.TELEGRAM_BOT_TOKEN = old.token;
        if (old.url === undefined) delete process.env.TELEGRAM_APP_URL;
        else process.env.TELEGRAM_APP_URL = old.url;
    }
});
