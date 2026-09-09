import { Injectable } from '@nestjs/common';

import { Clock } from './clock';
import { identityError } from './identity.errors';
import { IdentityCryptoService } from './identity-crypto.service';

interface CursorEnvelope {
    payload: string;
    signature: string;
}

@Injectable()
export class CursorService {
    constructor(
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {}

    encode(payload: object): string {
        const value = Buffer.from(
            JSON.stringify({ ...payload, expiresAt: this.clock.now().getTime() + 900_000 }),
            'utf8'
        ).toString('base64url');
        return Buffer.from(
            JSON.stringify({ payload: value, signature: this.crypto.hash(`CURSOR:${value}`) }),
            'utf8'
        ).toString('base64url');
    }

    decode<T extends { type: string }>(cursor: string, expectedType: T['type']): T {
        try {
            const envelope = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorEnvelope;
            if (
                typeof envelope.payload !== 'string' ||
                typeof envelope.signature !== 'string' ||
                !this.crypto.equalHash(envelope.signature, this.crypto.hash(`CURSOR:${envelope.payload}`))
            ) {
                throw new Error('invalid signature');
            }
            const payload = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8')) as T & {
                expiresAt?: unknown;
            };
            if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= this.clock.now().getTime()) {
                throw new Error('expired cursor');
            }
            if (payload.type !== expectedType) throw new Error('wrong cursor type');
            return payload;
        } catch {
            throw identityError('INVALID_CURSOR', 400);
        }
    }
}
