import { describe, expect, it } from 'vitest';

import { resolvePushPayload, resolveUniversalLink } from './deep-links';

const matchId = '0181f32c-7b4a-4f35-8f30-c358f278cb9e';

describe('mobile deep-link allowlist', () => {
    it('resolves only canonical HTTPS resources', () => {
        expect(resolveUniversalLink(`https://picklehub.ru/matches/${matchId}`, 'picklehub.ru')).toEqual({
            destination: { kind: 'MATCH', matchId },
            kind: 'DESTINATION',
        });
        expect(resolveUniversalLink(`https://evil.example/matches/${matchId}`, 'picklehub.ru')).toEqual({
            kind: 'UNSUPPORTED',
        });
    });

    it('keeps a magic secret separate from navigation destinations', () => {
        const token = 'abcdefghijklmnopqrstuvwxyzABCDEFG1234567890_-';
        expect(resolveUniversalLink(`https://picklehub.ru/auth/email?token=${token}`, 'picklehub.ru')).toEqual({
            kind: 'MAGIC_LINK',
            token,
        });
    });

    it('rejects arbitrary push routes and accepts only the neutral payload', () => {
        expect(resolvePushPayload({ action: 'OPEN_URL', notificationId: matchId, schemaVersion: 1 })).toEqual({
            kind: 'UNSUPPORTED',
        });
        expect(resolvePushPayload({ action: 'OPEN_NOTIFICATION', notificationId: matchId, schemaVersion: 1 })).toEqual({
            kind: 'NOTIFICATION',
            notificationId: matchId,
        });
    });
});
