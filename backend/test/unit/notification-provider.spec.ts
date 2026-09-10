import { parseEnvironment } from '../../src/common/config/environment';
import { ConfiguredEmailNotificationProvider } from '../../src/communications/notification-provider';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';

describe('notification provider boundary', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('uses an allowlisted template with tracking disabled and no chat preview', async () => {
        const environment = parseEnvironment({
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
            REDIS_URL: 'redis://localhost:6379/0',
            NOTIFICATION_EMAIL_ENABLED: 'true',
            NOTIFICATION_EMAIL_PROVIDER_ENDPOINT: 'https://mail.example.test/notifications',
            NOTIFICATION_EMAIL_PROVIDER_TOKEN: 'test-provider-token-with-at-least-32-characters',
        });
        const crypto = new IdentityCryptoService(environment);
        const send = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
        const provider = new ConfiguredEmailNotificationProvider(environment, crypto);

        await provider.send({
            recipient: crypto.encrypt('player@example.test'),
            notificationType: 'CHAT_MESSAGE',
            locale: 'ru',
            idempotencyKey: '01800000-0000-4000-8000-000000000001',
        });

        const request = send.mock.calls[0]?.[1];
        if (typeof request?.body !== 'string') throw new Error('Expected a JSON provider request');
        const body = JSON.parse(request.body) as Record<string, unknown>;
        expect(JSON.stringify(body)).toContain('В чате матча новое сообщение.');
        expect(JSON.stringify(body)).not.toContain('privacy-canary-chat-text');
        expect(body).toMatchObject({
            disableClickTracking: true,
            disableOpenTracking: true,
            disableUrlRewriting: true,
        });
    });
});
