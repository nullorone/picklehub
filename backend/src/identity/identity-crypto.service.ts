import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';

@Injectable()
export class IdentityCryptoService {
    private readonly encryptionKey: Buffer;

    constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
        this.encryptionKey = Buffer.from(environment.IDENTITY_ENCRYPTION_KEY, 'hex');
    }

    secret(): string {
        return randomBytes(32).toString('base64url');
    }

    hash(value: string): string {
        return createHmac('sha256', this.environment.IDENTITY_HMAC_KEY).update(value, 'utf8').digest('hex');
    }

    codeChallenge(verifier: string): string {
        return createHash('sha256').update(verifier, 'ascii').digest('base64url');
    }

    equalSecret(left: string, right: string): boolean {
        const a = Buffer.from(left, 'ascii');
        const b = Buffer.from(right, 'ascii');
        return a.length === b.length && timingSafeEqual(a, b);
    }

    equalHash(left: string, right: string): boolean {
        const a = Buffer.from(left, 'hex');
        const b = Buffer.from(right, 'hex');
        return a.length === b.length && timingSafeEqual(a, b);
    }

    encrypt(value: string): Buffer {
        const nonce = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, nonce);
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
    }

    decrypt(value: Uint8Array): string {
        const bytes = Buffer.from(value);
        const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    }
}
