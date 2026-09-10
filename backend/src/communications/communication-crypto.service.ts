import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';

@Injectable()
export class CommunicationCryptoService {
    private readonly key: Buffer;

    constructor(@Inject(ENVIRONMENT) environment: Environment) {
        this.key = Buffer.from(environment.COMMUNICATION_ENCRYPTION_KEY, 'hex');
    }

    fingerprint(value: string): string {
        return createHash('sha256').update(value, 'utf8').digest('hex');
    }

    encrypt(value: string): Buffer {
        const nonce = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
    }

    decrypt(value: Uint8Array): string {
        const bytes = Buffer.from(value);
        const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    }
}
