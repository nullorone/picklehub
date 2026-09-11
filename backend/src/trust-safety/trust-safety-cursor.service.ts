import { Injectable } from '@nestjs/common';

import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { trustSafetyError } from './trust-safety.errors';

export interface SafetyCursor {
    type: 'safety-receipts' | 'safety-blocks';
    userId: string;
    snapshotAt: string;
    lastCreatedAt: string;
    lastId: string;
}

@Injectable()
export class TrustSafetyCursorService {
    constructor(
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {}

    encode(value: SafetyCursor): string {
        const payload = Buffer.from(
            JSON.stringify({ ...value, expiresAt: this.clock.now().getTime() + 900_000 }),
            'utf8'
        ).toString('base64url');
        return Buffer.from(
            JSON.stringify({ payload, signature: this.crypto.hash(`SAFETY_CURSOR:${payload}`) }),
            'utf8'
        ).toString('base64url');
    }

    decode(cursor: string, type: SafetyCursor['type'], userId: string): SafetyCursor {
        try {
            const envelope = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
                payload?: unknown;
                signature?: unknown;
            };
            if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error();
            if (!this.crypto.equalHash(envelope.signature, this.crypto.hash(`SAFETY_CURSOR:${envelope.payload}`))) {
                throw new Error();
            }
            const value = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8')) as SafetyCursor & {
                expiresAt?: unknown;
            };
            if (value.type !== type || value.userId !== userId) throw new Error();
            if (typeof value.expiresAt !== 'number' || value.expiresAt <= this.clock.now().getTime()) {
                throw trustSafetyError('CURSOR_EXPIRED', 400);
            }
            if (
                typeof value.snapshotAt !== 'string' ||
                typeof value.lastCreatedAt !== 'string' ||
                typeof value.lastId !== 'string'
            ) {
                throw new Error();
            }
            return value;
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'CURSOR_EXPIRED') throw error;
            throw trustSafetyError('INVALID_CURSOR', 400);
        }
    }
}
