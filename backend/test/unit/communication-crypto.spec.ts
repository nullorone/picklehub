import { parseEnvironment } from '../../src/common/config/environment';
import { CommunicationCryptoService } from '../../src/communications/communication-crypto.service';

describe('CommunicationCryptoService', () => {
    it('encrypts restricted replay and report evidence with a dedicated randomized key boundary', () => {
        const service = new CommunicationCryptoService(
            parseEnvironment({
                NODE_ENV: 'test',
                DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
                REDIS_URL: 'redis://localhost:6379/0',
            })
        );
        const first = service.encrypt('privacy-canary-chat-text');
        const second = service.encrypt('privacy-canary-chat-text');

        expect(first).not.toEqual(second);
        expect(first.toString('utf8')).not.toContain('privacy-canary-chat-text');
        expect(service.decrypt(first)).toBe('privacy-canary-chat-text');
        expect(service.fingerprint('stable')).toMatch(/^[a-f0-9]{64}$/u);
    });
});
