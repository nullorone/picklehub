import { AdministrationCursorService } from '../../src/administration/administration-cursor.service';
import type { Clock } from '../../src/identity/clock';
import type { IdentityCryptoService } from '../../src/identity/identity-crypto.service';

describe('AdministrationCursorService', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    const crypto = {
        hash: (value: string) => Buffer.from(value).toString('hex').slice(0, 64).padEnd(64, '0'),
        equalHash: (left: string, right: string) => left === right,
    } as IdentityCryptoService;
    const clock = { now: () => now } as Clock;
    const cursors = new AdministrationCursorService(crypto, clock);

    it('binds a cursor to actor, role, capability and filters', () => {
        const cursor = cursors.encode('admin-cases', 'actor-a:moderator:open', now.toISOString(), 'case-1');

        expect(cursors.decode(cursor, 'admin-cases', 'actor-a:moderator:open')).toMatchObject({ lastId: 'case-1' });
        expect(() => cursors.decode(cursor, 'admin-cases', 'actor-b:moderator:open')).toThrow('INVALID_CURSOR');
    });
});
