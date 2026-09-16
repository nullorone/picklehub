import { parseEnvironment } from '../../src/common/config/environment';
import type { RedisService } from '../../src/common/redis/redis.service';
import { RealtimeTicketService } from '../../src/communications/realtime-ticket.service';
import type { Clock } from '../../src/identity/clock';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import type { AuthenticatedIdentity, IdentityService } from '../../src/identity/identity.service';
import { FakeClock } from '../fakes/fake-clock';

describe('native realtime tickets', () => {
    const now = new Date('2026-09-16T10:00:00.000Z');
    const environment = parseEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379/0',
        REDIS_NAMESPACE: 'mobile-test',
    });
    const crypto = new IdentityCryptoService(environment);

    it('stores only a hashed single-use binding and revalidates the session on consume', async () => {
        const values = new Map<string, string>();
        const set = jest.fn((key: string, value: string) => {
            if (values.has(key)) return Promise.resolve(null);
            values.set(key, value);
            return Promise.resolve('OK');
        });
        const getdel = jest.fn((key: string) => {
            const value = values.get(key) ?? null;
            values.delete(key);
            return Promise.resolve(value);
        });
        const authenticateSessionBinding = jest.fn().mockResolvedValue({ session: { userId: 'user-id' } });
        const service = new RealtimeTicketService(
            environment,
            { client: { set, getdel } } as unknown as RedisService,
            crypto,
            new FakeClock(now) as Clock,
            { authenticateSessionBinding } as unknown as IdentityService
        );
        const auth = {
            session: { authEpoch: 7, id: 'session-id', userId: 'user-id' },
        } as unknown as AuthenticatedIdentity;

        const issued = await service.issue(auth);
        expect(issued.ticket).toMatch(/^ws1_[A-Za-z0-9_-]{43}$/u);
        expect(issued.expiresAt).toBe('2026-09-16T10:01:00.000Z');
        const storedKey = [...values.keys()][0] ?? '';
        const storedValue = [...values.values()][0] ?? '';
        expect(storedKey).not.toContain(issued.ticket);
        expect(storedValue).not.toContain(issued.ticket);

        await expect(service.consume(issued.ticket)).resolves.toMatchObject({ session: { userId: 'user-id' } });
        expect(authenticateSessionBinding).toHaveBeenCalledWith('session-id', 'user-id', 7);
        await expect(service.consume(issued.ticket)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    });
});
