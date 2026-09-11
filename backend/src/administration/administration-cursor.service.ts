import { Injectable } from '@nestjs/common';

import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { administrationError } from './administration.errors';

interface CursorPayload {
    type: string;
    bind: string;
    snapshotAt: string;
    lastId: string;
    expiresAt: number;
}

@Injectable()
export class AdministrationCursorService {
    constructor(
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {}

    encode(type: string, bind: string, snapshotAt: string, lastId: string): string {
        const payload = Buffer.from(
            JSON.stringify({ type, bind, snapshotAt, lastId, expiresAt: this.clock.now().getTime() + 15 * 60_000 }),
            'utf8'
        ).toString('base64url');
        return Buffer.from(
            JSON.stringify({ payload, signature: this.crypto.hash(`ADMIN_CURSOR:${payload}`) }),
            'utf8'
        ).toString('base64url');
    }

    decode(cursor: string | undefined, type: string, bind: string): CursorPayload | undefined {
        if (cursor === undefined) return undefined;
        try {
            const envelope = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
                payload?: unknown;
                signature?: unknown;
            };
            if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error();
            if (!this.crypto.equalHash(envelope.signature, this.crypto.hash(`ADMIN_CURSOR:${envelope.payload}`)))
                throw new Error();
            const payload = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8')) as CursorPayload;
            if (payload.type !== type || payload.bind !== bind || payload.expiresAt <= this.clock.now().getTime())
                throw new Error();
            return payload;
        } catch {
            throw administrationError('INVALID_CURSOR', 400);
        }
    }
}
