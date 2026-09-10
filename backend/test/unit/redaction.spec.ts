import { redactSensitiveData } from '../../src/common/logging/application-logger.service';

describe('redactSensitiveData', () => {
    it('redacts forbidden values at any nesting depth', () => {
        const redacted = redactSensitiveData({
            email: 'player@example.test',
            nested: {
                token: 'secret-token',
                safeId: 'opaque-id',
                location: { latitude: 55.75, longitude: 37.61 },
            },
        });

        expect(redacted).toEqual({
            email: '[REDACTED]',
            nested: {
                token: '[REDACTED]',
                safeId: 'opaque-id',
                location: { latitude: '[REDACTED]', longitude: '[REDACTED]' },
            },
        });
        expect(JSON.stringify(redacted)).not.toContain('player@example.test');
        expect(JSON.stringify(redacted)).not.toContain('secret-token');
    });

    it('removes every identity canary from captured structured data', () => {
        const canaries = {
            authorization: 'Bearer access-canary',
            cookie: '__Secure-ph-refresh=refresh-canary',
            email: 'identity-canary@example.test',
            initData: 'query_id=init-data-canary',
            magicLink: 'https://app.example.test/#token=magic-canary',
            refreshToken: 'refresh-canary',
            token: 'token-canary',
        };

        const captured = JSON.stringify(redactSensitiveData({ event: 'identity.test', nested: canaries }));

        for (const value of Object.values(canaries)) expect(captured).not.toContain(value);
        expect(captured.match(/\[REDACTED\]/gu)).toHaveLength(Object.keys(canaries).length);
    });
});
