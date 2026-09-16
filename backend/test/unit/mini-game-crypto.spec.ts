import { parseEnvironment } from '../../src/common/config/environment';
import { MiniGameCryptoService } from '../../src/mini-game/mini-game-crypto.service';

describe('MiniGameCryptoService', () => {
    const crypto = new MiniGameCryptoService(
        parseEnvironment({
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
            REDIS_URL: 'redis://localhost:6379/0',
            MINI_GAME_SIGNING_KEY: 'test-mini-game-signing-key-change-me-0001',
        })
    );

    it('creates opaque signed proofs and rejects mutation or a purpose mismatch', () => {
        const proof = crypto.sign('mgc1_', { v: 1, sessionId: 'session' });
        expect(proof).toMatch(/^mgc1_[A-Za-z0-9_-]{43,512}$/u);
        expect(crypto.verify('mgc1_', proof)).toEqual({ v: 1, sessionId: 'session' });
        expect(crypto.verify('mgr1_', proof)).toBeNull();
        const changed = `${proof.slice(0, 12)}${proof[12] === 'A' ? 'B' : 'A'}${proof.slice(13)}`;
        expect(crypto.verify('mgc1_', changed)).toBeNull();
    });

    it('keeps compact challenge and launch proofs inside their wire limits', () => {
        const challenge = crypto.sign('mgc1_', {
            v: 1,
            s: 'a'.repeat(32),
            t: 'b'.repeat(32),
            u: 'c'.repeat(32),
            c: 'd'.repeat(32),
            q: '1.0.0',
            e: 'e'.repeat(32),
            m: 'STANDARD',
            i: 1_789_516_800_000,
            x: 1_789_517_700_000,
            n: 'f'.repeat(43),
        });
        const launch = crypto.sign('mgl1_', { v: 1, n: 'g'.repeat(43) });
        expect(challenge).toMatch(/^mgc1_[A-Za-z0-9_-]{43,512}$/u);
        expect(launch).toMatch(/^mgl1_[A-Za-z0-9_-]{43,256}$/u);
    });

    it('encrypts replay responses with randomized authenticated encryption', () => {
        const first = crypto.encrypt('{"ok":true}');
        const second = crypto.encrypt('{"ok":true}');
        expect(first.equals(second)).toBe(false);
        expect(crypto.decrypt(first)).toBe('{"ok":true}');
        expect(() => crypto.decrypt(Buffer.concat([first.subarray(0, -1), Buffer.from([0])]))).toThrow();
    });

    it('uses scoped keyed hashes instead of retaining raw nonce or proof values', () => {
        expect(crypto.hash('NONCE', 'same')).not.toBe(crypto.hash('PROOF', 'same'));
        expect(crypto.hash('NONCE', 'same')).toMatch(/^[a-f0-9]{64}$/u);
    });
});
