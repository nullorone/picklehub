import { Injectable } from '@nestjs/common';

import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { profileError } from './profile.errors';

export interface ProfileHistoryCursor {
    type: 'profile-history';
    subjectId: string;
    viewerId: string | null;
    publicOnly: boolean;
    snapshotAt: string;
    offset: number;
}

@Injectable()
export class ProfileCursorService {
    constructor(
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {}

    encode(value: ProfileHistoryCursor): string {
        const payload = Buffer.from(
            JSON.stringify({ ...value, expiresAt: this.clock.now().getTime() + 900_000 }),
            'utf8'
        ).toString('base64url');
        return Buffer.from(
            JSON.stringify({ payload, signature: this.crypto.hash(`PROFILE_CURSOR:${payload}`) }),
            'utf8'
        ).toString('base64url');
    }

    decode(cursor: string): ProfileHistoryCursor {
        try {
            const envelope = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
                payload?: unknown;
                signature?: unknown;
            };
            if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error();
            const expected = this.crypto.hash(`PROFILE_CURSOR:${envelope.payload}`);
            if (!this.crypto.equalHash(envelope.signature, expected)) throw new Error();
            const value = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8')) as {
                type?: unknown;
                subjectId?: unknown;
                viewerId?: unknown;
                publicOnly?: unknown;
                snapshotAt?: unknown;
                offset?: unknown;
                expiresAt?: unknown;
            };
            if (
                value.type !== 'profile-history' ||
                typeof value.subjectId !== 'string' ||
                (typeof value.viewerId !== 'string' && value.viewerId !== null) ||
                typeof value.publicOnly !== 'boolean' ||
                typeof value.snapshotAt !== 'string' ||
                typeof value.offset !== 'number' ||
                !Number.isInteger(value.offset) ||
                value.offset < 0
            )
                throw new Error();
            if (typeof value.expiresAt !== 'number' || value.expiresAt <= this.clock.now().getTime()) {
                throw profileError('CURSOR_EXPIRED', 400);
            }
            return {
                type: value.type,
                subjectId: value.subjectId,
                viewerId: value.viewerId,
                publicOnly: value.publicOnly,
                snapshotAt: value.snapshotAt,
                offset: value.offset,
            };
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'CURSOR_EXPIRED') throw error;
            throw profileError('INVALID_CURSOR', 400);
        }
    }
}
