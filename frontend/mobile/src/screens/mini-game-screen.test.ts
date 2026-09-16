import { describe, expect, it } from 'vitest';

import { parseBridgeMessage } from './mini-game-bridge';

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
});
