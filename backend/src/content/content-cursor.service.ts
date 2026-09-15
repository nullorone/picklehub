import { Injectable } from '@nestjs/common';

import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { contentError } from './content.errors';

interface CursorValue {
    scope: string;
    at: string;
    id: string;
    snapshot?: string;
}

@Injectable()
export class ContentCursorService {
    constructor(private readonly crypto: IdentityCryptoService) {}

    encode(value: CursorValue): string {
        const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
        return `${payload}.${this.crypto.hash(`CONTENT_CURSOR:${payload}`).slice(0, 32)}`;
    }

    decode(cursor: string, scope: string): CursorValue {
        try {
            const [payload, signature, extra] = cursor.split('.');
            if (
                payload === undefined ||
                signature === undefined ||
                extra !== undefined ||
                this.crypto.hash(`CONTENT_CURSOR:${payload}`).slice(0, 32) !== signature
            )
                throw new Error('signature');
            const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CursorValue;
            if (
                value.scope !== scope ||
                Number.isNaN(new Date(value.at).getTime()) ||
                typeof value.id !== 'string' ||
                (value.snapshot !== undefined && Number.isNaN(new Date(value.snapshot).getTime()))
            )
                throw new Error('scope');
            return value;
        } catch {
            throw contentError('INVALID_CURSOR', 400);
        }
    }
}
