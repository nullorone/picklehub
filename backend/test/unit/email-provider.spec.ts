import { parseEnvironment } from '../../src/common/config/environment';
import { ConfiguredEmailProvider } from '../../src/identity/email-provider';

describe('ConfiguredEmailProvider', () => {
    it('uses a bounded HTTPS request and requests URL tracking to be disabled', async () => {
        const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
        const provider = new ConfiguredEmailProvider(
            parseEnvironment({
                NODE_ENV: 'test',
                DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
                REDIS_URL: 'redis://localhost:6379/0',
                EMAIL_PROVIDER_ENDPOINT: 'https://mail.example.test/v1/send',
                EMAIL_PROVIDER_TOKEN: 'test-provider-token-with-at-least-32-characters',
            })
        );

        await provider.sendMagicLink({
            address: 'player@example.test',
            link: 'https://app.example.test/auth/email#token=secret',
            purpose: 'LOGIN',
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const call = fetchMock.mock.calls[0];
        expect(call?.[0]).toBe('https://mail.example.test/v1/send');
        expect(call?.[1]?.method).toBe('POST');
        const body = call?.[1]?.body;
        if (typeof body !== 'string') throw new Error('Provider request body was not serialized');
        expect(body).toContain('"disableClickTracking":true');
        expect(body).toContain('"disableUrlRewriting":true');
        fetchMock.mockRestore();
    });
});
