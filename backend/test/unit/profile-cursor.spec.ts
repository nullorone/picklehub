import { parseEnvironment } from '../../src/common/config/environment';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import { ProfileCursorService } from '../../src/profiles/profile-cursor.service';
import { FakeClock } from '../fakes/fake-clock';

describe('ProfileCursorService', () => {
    const clock = new FakeClock(new Date('2026-09-11T12:00:00.000Z'));
    const crypto = new IdentityCryptoService(
        parseEnvironment({
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
            REDIS_URL: 'redis://localhost:6379/0',
        })
    );
    const cursors = new ProfileCursorService(crypto, clock);

    it('binds a signed history cursor to its complete access boundary', () => {
        const value = {
            type: 'profile-history' as const,
            subjectId: '11111111-1111-4111-8111-111111111111',
            viewerId: '22222222-2222-4222-8222-222222222222',
            publicOnly: true,
            snapshotAt: '2026-09-11T12:00:00.000Z',
            offset: 20,
        };
        expect(cursors.decode(cursors.encode(value))).toEqual(value);
    });

    it('rejects tampering and expiry', () => {
        const cursor = cursors.encode({
            type: 'profile-history',
            subjectId: '11111111-1111-4111-8111-111111111111',
            viewerId: null,
            publicOnly: true,
            snapshotAt: '2026-09-11T12:00:00.000Z',
            offset: 0,
        });
        expect(() => cursors.decode(`${cursor}x`)).toThrow('Указан недействительный курсор.');
        clock.advance(900_001);
        expect(() => cursors.decode(cursor)).toThrow('Срок действия страницы истёк.');
    });
});
