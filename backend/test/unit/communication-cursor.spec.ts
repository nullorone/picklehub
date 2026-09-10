import { parseEnvironment } from '../../src/common/config/environment';
import { CommunicationCursorService } from '../../src/communications/communication-cursor.service';
import { CommunicationException } from '../../src/communications/communication.errors';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import { FakeClock } from '../fakes/fake-clock';

describe('CommunicationCursorService', () => {
    const environment = parseEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379/0',
    });
    const clock = new FakeClock(new Date('2026-09-10T12:00:00.000Z'));
    const cursors = new CommunicationCursorService(new IdentityCryptoService(environment), clock);

    it('binds an opaque cursor to its signed access boundary and expires it', () => {
        const encoded = cursors.encode({
            type: 'chat',
            userId: '01800000-0000-7000-8000-000000000001',
            conversationId: '01800000-0000-7000-8000-000000000002',
            direction: 'forward',
            sequence: '42',
            accessThroughSequence: 'active',
        });

        expect(encoded).not.toContain('42');
        expect(cursors.decode(encoded, 'chat')).toMatchObject({ sequence: '42', accessThroughSequence: 'active' });
        const envelope = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
            payload: string;
            signature: string;
        };
        envelope.signature = envelope.signature.replace(/^./u, envelope.signature.startsWith('a') ? 'b' : 'a');
        const tampered = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
        expect(() => cursors.decode(tampered, 'chat')).toThrow(CommunicationException);
        clock.advance(900_001);
        expect(() => cursors.decode(encoded, 'chat')).toThrow('CURSOR_EXPIRED');
    });
});
