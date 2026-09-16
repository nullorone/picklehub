import { describe, expect, it } from 'vitest';

import {
    acceptUniqueBridgeMessage,
    isAllowedGameNavigation,
    isExpectedGameOrigin,
    parseBridgeMessage,
} from './mini-game-bridge';

describe('mini-game WebView bridge', () => {
    it('accepts only closed versioned messages', () => {
        const messageId = crypto.randomUUID();
        expect(
            parseBridgeMessage(JSON.stringify({ messageId, payload: {}, type: 'READY_V1', version: 1 }))
        ).toBeDefined();
        expect(
            parseBridgeMessage(
                JSON.stringify({
                    messageId: crypto.randomUUID(),
                    payload: { route: 'https://evil.example' },
                    type: 'OPEN_SAFE_ROUTE_V1',
                    version: 1,
                })
            )
        ).toBeUndefined();
        expect(
            parseBridgeMessage(
                JSON.stringify({ messageId, payload: {}, token: 'secret', type: 'READY_V1', version: 1 })
            )
        ).toBeUndefined();
    });

    it('rejects duplicate-shape additions and oversized messages', () => {
        expect(parseBridgeMessage('x'.repeat(2049))).toBeUndefined();
        expect(
            parseBridgeMessage(
                JSON.stringify({
                    messageId: crypto.randomUUID(),
                    payload: { bucket: 'FAST' },
                    type: 'HEALTH_V1',
                    version: 1,
                })
            )
        ).toBeUndefined();
    });

    it('rejects version, message, payload and identifier confusion', () => {
        const validId = crypto.randomUUID();
        for (const value of [
            { messageId: validId, payload: {}, type: 'READY_V1', version: 2 },
            { messageId: 'not-a-uuid', payload: {}, type: 'READY_V1', version: 1 },
            { messageId: validId, payload: {}, type: 'OPEN_URL_V1', version: 1 },
            {
                messageId: validId,
                payload: { route: 'MATCH_LIST', url: '/matches' },
                type: 'OPEN_SAFE_ROUTE_V1',
                version: 1,
            },
            { messageId: validId, payload: { bucket: 'GOOD', duration: 10 }, type: 'HEALTH_V1', version: 1 },
        ]) {
            expect(parseBridgeMessage(JSON.stringify(value))).toBeUndefined();
        }
    });

    it('allows only about:blank or the configured exact origin', () => {
        const origin = 'https://game.picklehub.example';
        expect(isAllowedGameNavigation('about:blank', origin)).toBe(true);
        expect(isExpectedGameOrigin('about:blank', origin)).toBe(false);
        expect(isAllowedGameNavigation(`${origin}/assets/game.js`, origin)).toBe(true);
        expect(isAllowedGameNavigation('https://evil.example/', origin)).toBe(false);
        expect(isAllowedGameNavigation('https://game.picklehub.example.evil.test/', origin)).toBe(false);
        expect(isAllowedGameNavigation('http://game.picklehub.example/', origin)).toBe(false);
        expect(isAllowedGameNavigation('not a URL', origin)).toBe(false);
    });

    it('accepts each message identifier once and rejects replay', () => {
        const seen = new Set<string>();
        const message = JSON.stringify({ messageId: crypto.randomUUID(), payload: {}, type: 'READY_V1', version: 1 });
        expect(acceptUniqueBridgeMessage(message, seen)).toBeDefined();
        expect(acceptUniqueBridgeMessage(message, seen)).toBeUndefined();
        expect(seen.size).toBe(1);
    });
});
