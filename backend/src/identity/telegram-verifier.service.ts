import { createHmac, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { Clock } from './clock';
import { identityError } from './identity.errors';
import { IdentityCryptoService } from './identity-crypto.service';

export interface VerifiedTelegramProof {
    subject: string;
    subjectKey: string;
    subjectCiphertext: Buffer;
    fingerprint: string;
    expiresAt: Date;
}

@Injectable()
export class TelegramVerifierService {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly clock: Clock,
        private readonly crypto: IdentityCryptoService
    ) {}

    verify(initData: string): VerifiedTelegramProof {
        const params = new URLSearchParams(initData);
        const keys = [...params.keys()];
        if (new Set(keys).size !== keys.length) {
            throw identityError('TELEGRAM_AUTH_INVALID', 401);
        }
        const hash = params.get('hash');
        const authDateValue = params.get('auth_date');
        const userValue = params.get('user');
        if (hash === null || authDateValue === null || userValue === null || !/^[a-f0-9]{64}$/u.test(hash)) {
            throw identityError('TELEGRAM_AUTH_INVALID', 401);
        }

        params.delete('hash');
        const dataCheck = [...params.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        const secret = createHmac('sha256', 'WebAppData').update(this.environment.TELEGRAM_BOT_TOKEN).digest();
        const expected = createHmac('sha256', secret).update(dataCheck).digest();
        const actual = Buffer.from(hash, 'hex');
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
            throw identityError('TELEGRAM_AUTH_INVALID', 401);
        }

        const authSeconds = Number(authDateValue);
        const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
        if (!Number.isInteger(authSeconds) || nowSeconds - authSeconds >= 300 || authSeconds - nowSeconds > 30) {
            throw identityError('TELEGRAM_AUTH_INVALID', 401);
        }

        let user: unknown;
        try {
            user = JSON.parse(userValue) as unknown;
        } catch {
            throw identityError('TELEGRAM_AUTH_INVALID', 401);
        }
        if (typeof user !== 'object' || user === null || !('id' in user)) {
            throw identityError('TELEGRAM_AUTH_INVALID', 401);
        }
        const identifier = (user as { id: unknown }).id;
        if ((typeof identifier !== 'number' && typeof identifier !== 'string') || !/^\d+$/u.test(String(identifier))) {
            throw identityError('TELEGRAM_AUTH_INVALID', 401);
        }
        const subject = String(identifier);
        return {
            subject,
            subjectKey: this.crypto.hash(`TELEGRAM:${subject}`),
            subjectCiphertext: this.crypto.encrypt(subject),
            fingerprint: this.crypto.hash(`TELEGRAM_PROOF:${initData}`),
            expiresAt: new Date((authSeconds + 300) * 1000),
        };
    }
}
