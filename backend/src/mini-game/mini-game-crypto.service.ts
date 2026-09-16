import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';

type ProofPrefix = 'mgc1_' | 'mgr1_' | 'mgl1_' | 'mga1_';

@Injectable()
export class MiniGameCryptoService {
    private readonly signingKey: Buffer;
    private readonly encryptionKey: Buffer;

    constructor(@Inject(ENVIRONMENT) environment: Environment) {
        this.signingKey = Buffer.from(environment.MINI_GAME_SIGNING_KEY, 'utf8');
        this.encryptionKey = Buffer.from(environment.MINI_GAME_ENCRYPTION_KEY, 'hex');
    }

    secret(bytes = 32): string {
        return randomBytes(bytes).toString('base64url');
    }

    hash(scope: string, value: string): string {
        return createHmac('sha256', this.signingKey).update(scope).update('\0').update(value).digest('hex');
    }

    sign(prefix: ProofPrefix, payload: object): string {
        const encoded = Buffer.from(JSON.stringify(payload));
        const signature = createHmac('sha256', this.signingKey).update(prefix).update(encoded).digest();
        return `${prefix}${Buffer.concat([encoded, signature]).toString('base64url')}`;
    }

    verify(prefix: ProofPrefix, proof: string): object | null {
        if (!proof.startsWith(prefix)) return null;
        const token = Buffer.from(proof.slice(prefix.length), 'base64url');
        if (token.length <= 32) return null;
        const encoded = token.subarray(0, -32);
        const supplied = token.subarray(-32);
        const expected = createHmac('sha256', this.signingKey).update(prefix).update(encoded).digest();
        if (!timingSafeEqual(supplied, expected)) {
            return null;
        }
        try {
            const parsed: unknown = JSON.parse(encoded.toString('utf8'));
            return typeof parsed === 'object' && parsed !== null ? parsed : null;
        } catch {
            return null;
        }
    }

    encrypt(value: string): Buffer {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    }

    decrypt(value: Uint8Array): string {
        const data = Buffer.from(value);
        const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, data.subarray(0, 12));
        decipher.setAuthTag(data.subarray(12, 28));
        return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
    }
}
