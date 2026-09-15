import type { Environment } from '../../src/common/config/environment';
import { ContentCursorService } from '../../src/content/content-cursor.service';
import { ContentException } from '../../src/content/content.errors';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';

describe('content cursor boundary', () => {
    const crypto = new IdentityCryptoService({
        IDENTITY_HMAC_KEY: 'content-cursor-test-key',
        IDENTITY_ENCRYPTION_KEY: '00'.repeat(32),
    } as Environment);
    const cursors = new ContentCursorService(crypto);

    it('round-trips a cursor only in its original filter scope', () => {
        const value = {
            scope: 'feed:ru:news',
            at: '2026-09-14T10:00:00.000Z',
            id: '01800000-0000-7000-8000-000000000001',
            snapshot: '2026-09-14T11:00:00.000Z',
        };
        const cursor = cursors.encode(value);
        expect(cursors.decode(cursor, value.scope)).toEqual(value);
        expect(() => cursors.decode(cursor, 'feed:en:news')).toThrow(ContentException);
    });

    it.each([
        'not-a-cursor',
        `${Buffer.from(JSON.stringify({ scope: 'x', at: 'invalid', id: '1' })).toString('base64url')}.bad`,
    ])('rejects malformed or tampered cursor %s', (cursor) => {
        expect(() => cursors.decode(cursor, 'x')).toThrow(ContentException);
    });

    it('rejects an invalid snapshot even when the cursor signature is valid', () => {
        const cursor = cursors.encode({ scope: 'x', at: '2026-09-14T10:00:00.000Z', id: '1', snapshot: 'invalid' });
        expect(() => cursors.decode(cursor, 'x')).toThrow(ContentException);
    });
});
