import { createHmac } from 'node:crypto';

import type { Environment } from '../../src/common/config/environment';
import { parseEnvironment } from '../../src/common/config/environment';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import { TelegramVerifierService } from '../../src/identity/telegram-verifier.service';
import { FakeClock } from '../fakes/fake-clock';

const NOW = new Date('2026-09-09T09:00:00.000Z');

function environment(): Environment {
    return parseEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379/0',
        TELEGRAM_BOT_TOKEN: 'test-bot-token',
    });
}

function initData(authDate: number, userId = 123_456): string {
    const params = new URLSearchParams({
        auth_date: String(authDate),
        query_id: 'test-query',
        user: JSON.stringify({ id: userId, first_name: 'Sensitive Name' }),
    });
    const check = [...params.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update('test-bot-token').digest();
    params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
    return params.toString();
}

describe('TelegramVerifierService', () => {
    const settings = environment();
    const crypto = new IdentityCryptoService(settings);
    const verifier = new TelegramVerifierService(settings, new FakeClock(NOW), crypto);

    it('accepts a signed fresh proof and derives opaque storage values', () => {
        const result = verifier.verify(initData(Math.floor(NOW.getTime() / 1000) - 10));

        expect(result.subject).toBe('123456');
        expect(result.subjectKey).toMatch(/^[a-f0-9]{64}$/u);
        expect(result.subjectCiphertext.toString('utf8')).not.toContain('123456');
        expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    });

    it('rejects stale and tampered init data', () => {
        expect(() => verifier.verify(initData(Math.floor(NOW.getTime() / 1000) - 300))).toThrow(
            'Не удалось подтвердить данные Telegram.'
        );
        expect(() => verifier.verify(`${initData(Math.floor(NOW.getTime() / 1000))}&user=%7B%22id%22%3A1%7D`)).toThrow(
            'Не удалось подтвердить данные Telegram.'
        );
    });

    it('applies the documented expiry and future-skew boundaries', () => {
        expect(() => verifier.verify(initData(Math.floor(NOW.getTime() / 1000) - 299, 100_001))).not.toThrow();
        expect(() => verifier.verify(initData(Math.floor(NOW.getTime() / 1000) + 30, 100_002))).not.toThrow();
        expect(() => verifier.verify(initData(Math.floor(NOW.getTime() / 1000) + 31, 100_003))).toThrow(
            'Не удалось подтвердить данные Telegram.'
        );
    });
});
