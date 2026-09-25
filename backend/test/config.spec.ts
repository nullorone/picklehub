import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

const validEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/picklehub',
    FRONTEND_ORIGINS: 'http://localhost:5173,https://localhost:5173',
    LOG_LEVEL: 'info',
    TELEGRAM_BOT_TOKEN: 'test-bot-token',
};

test('loads valid configuration', () => {
    assert.deepEqual(loadConfig(validEnv), {
        nodeEnv: 'test',
        host: '127.0.0.1',
        port: 3000,
        databaseUrl: validEnv.DATABASE_URL,
        frontendOrigins: ['http://localhost:5173', 'https://localhost:5173'],
        logLevel: 'info',
        telegramBotToken: 'test-bot-token',
    });
});

test('rejects invalid configuration without echoing secret values', () => {
    const secret = 'dont-print-this-password';
    assert.throws(
        () =>
            loadConfig({
                ...validEnv,
                PORT: 'not-a-port',
                DATABASE_URL: `postgresql://user:${secret}`,
            }),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /PORT must be an integer/);
            assert.match(error.message, /DATABASE_URL must be a valid PostgreSQL URL/);
            assert.ok(!error.message.includes(secret));
            return true;
        }
    );
});

test('rejects wildcard and malformed CORS origins', () => {
    assert.throws(() => loadConfig({ ...validEnv, FRONTEND_ORIGINS: '*' }), /valid HTTP\(S\) origins/);
});
