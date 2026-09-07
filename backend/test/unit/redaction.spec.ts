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
});
