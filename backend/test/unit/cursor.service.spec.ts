import { parseEnvironment } from '../../src/common/config/environment';
import { CursorService } from '../../src/identity/cursor.service';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import { FakeClock } from '../fakes/fake-clock';

describe('CursorService', () => {
    it('binds an opaque cursor to its signed payload and 15 minute lifetime', () => {
        const environment = parseEnvironment({
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
            REDIS_URL: 'redis://localhost:6379/0',
        });
        const clock = new FakeClock(new Date('2026-09-09T09:00:00.000Z'));
        const service = new CursorService(new IdentityCryptoService(environment), clock);
        const cursor = service.encode({ type: 'consents', userId: 'user-1' });

        expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
        expect(service.decode(cursor, 'consents')).toMatchObject({ type: 'consents', userId: 'user-1' });
        expect(() => service.decode(`${cursor.slice(0, -1)}A`, 'consents')).toThrow('Запрос не может быть выполнен.');
        clock.advance(900_001);
        expect(() => service.decode(cursor, 'consents')).toThrow('Запрос не может быть выполнен.');
    });
});
