import { Injectable } from '@nestjs/common';

import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { communicationError } from './communication.errors';

export interface ChatCursor {
    type: 'chat';
    userId: string;
    conversationId: string;
    direction: 'backward' | 'forward';
    sequence: string;
    accessThroughSequence: string;
}

export interface NotificationCursor {
    type: 'notification';
    userId: string;
    createdAt: string;
    id: string;
}

type CommunicationCursor = ChatCursor | NotificationCursor;

@Injectable()
export class CommunicationCursorService {
    constructor(
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {}

    encode(value: CommunicationCursor): string {
        const payload = Buffer.from(
            JSON.stringify({ ...value, expiresAt: this.clock.now().getTime() + 900_000 }),
            'utf8'
        ).toString('base64url');
        return Buffer.from(
            JSON.stringify({ payload, signature: this.crypto.hash(`COMMUNICATION_CURSOR:${payload}`) }),
            'utf8'
        ).toString('base64url');
    }

    decode<T extends CommunicationCursor>(cursor: string, type: T['type']): T {
        try {
            const envelope = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
                payload?: unknown;
                signature?: unknown;
            };
            if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error();
            const expected = this.crypto.hash(`COMMUNICATION_CURSOR:${envelope.payload}`);
            if (!this.crypto.equalHash(envelope.signature, expected)) throw new Error();
            const value = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8')) as T & {
                expiresAt?: unknown;
            };
            if (value.type !== type) throw new Error();
            if (typeof value.expiresAt !== 'number' || value.expiresAt <= this.clock.now().getTime()) {
                throw communicationError('CURSOR_EXPIRED', 400);
            }
            return value;
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'CURSOR_EXPIRED') throw error;
            throw communicationError('INVALID_CURSOR', 400);
        }
    }
}
