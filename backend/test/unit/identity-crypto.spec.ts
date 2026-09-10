import type { Environment } from '../../src/common/config/environment';
import { parseEnvironment } from '../../src/common/config/environment';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';

describe('IdentityCryptoService', () => {
    const environment: Environment = parseEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379/0',
    });
    const service = new IdentityCryptoService(environment);

    it('creates 256-bit credentials and randomized authenticated ciphertext', () => {
        expect(service.secret()).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        const first = service.encrypt('player@example.test');
        const second = service.encrypt('player@example.test');

        expect(first).not.toEqual(second);
        expect(service.decrypt(first)).toBe('player@example.test');
        expect(service.hash('credential')).toMatch(/^[a-f0-9]{64}$/u);
    });
});
