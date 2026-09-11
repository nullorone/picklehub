import type { Environment } from '../../src/common/config/environment';
import { TrustSafetyCryptoService } from '../../src/trust-safety/trust-safety-crypto.service';

describe('TrustSafetyCryptoService privacy boundary', () => {
    const crypto = new TrustSafetyCryptoService({
        SAFETY_ENCRYPTION_KEY: '89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567',
    } as Environment);

    it('authenticates ciphertext against the exact record context', () => {
        const canary = 'canary@example.test 55.7558,37.6173';
        const encrypted = crypto.encrypt(canary, 'safety-evidence:v1:signal-a');

        expect(encrypted.toString('utf8')).not.toContain(canary);
        expect(crypto.decrypt(encrypted, 'safety-evidence:v1:signal-a')).toBe(canary);
        expect(() => crypto.decrypt(encrypted, 'safety-evidence:v1:signal-b')).toThrow();
    });
});
