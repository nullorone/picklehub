import { parseEnvironment } from '../../src/common/config/environment';

const validEnvironment = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/picklehub',
    REDIS_URL: 'redis://localhost:6379/0',
};

describe('parseEnvironment', () => {
    it('coerces typed values and applies local defaults', () => {
        const environment = parseEnvironment({ ...validEnvironment, PORT: '3100' });

        expect(environment.PORT).toBe(3100);
        expect(environment.NODE_ENV).toBe('local');
        expect(environment.APP_ROLE).toBe('api');
    });

    it('fails without printing a secret value', () => {
        const secret = 'must-not-appear';

        expect(() => parseEnvironment({ ...validEnvironment, DATABASE_URL: secret })).toThrow(
            'Invalid environment configuration: DATABASE_URL'
        );
        try {
            parseEnvironment({ ...validEnvironment, DATABASE_URL: secret });
        } catch (error) {
            expect(String(error)).not.toContain(secret);
        }
    });

    it('rejects a local Redis namespace in production', () => {
        expect(() =>
            parseEnvironment({ ...validEnvironment, NODE_ENV: 'production', REDIS_NAMESPACE: 'local' })
        ).toThrow('Invalid environment configuration: REDIS_NAMESPACE');
    });
});
