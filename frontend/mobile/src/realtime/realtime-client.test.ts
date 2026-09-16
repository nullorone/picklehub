import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MobileApiClient } from '../api/mobile-client';
import { MobileRealtimeClient } from './realtime-client';

vi.mock('../platform/uuid', () => ({ uuidV4: () => '0181f32c-7b4a-4f35-8f30-c358f278cb9e' }));

type Listener = (event: { readonly data?: unknown }) => void;

class FakeSocket {
    static instances: FakeSocket[] = [];

    readonly listeners = new Map<string, Listener>();
    readonly sent: string[] = [];
    close = vi.fn(() => this.listeners.get('close')?.({}));

    constructor(readonly url: string) {
        FakeSocket.instances.push(this);
    }

    addEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, listener);
    }

    emit(type: string, data?: unknown): void {
        this.listeners.get(type)?.({ data });
    }

    send(value: string): void {
        this.sent.push(value);
    }
}

function api(): MobileApiClient {
    return {
        createRealtimeTicket: vi.fn(() => Promise.resolve({ expiresAt: '2026-09-16T10:01:00Z', ticket: 'ws1_ticket' })),
    } as unknown as MobileApiClient;
}

describe('mobile realtime lifecycle', () => {
    beforeEach(() => {
        FakeSocket.instances = [];
        vi.stubGlobal('WebSocket', FakeSocket);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('authenticates first and resumes from the REST snapshot cursor', async () => {
        const client = new MobileRealtimeClient({
            api: api(),
            onAuthenticationExpired: vi.fn(),
            onResyncRequired: vi.fn(),
            onStateChange: vi.fn(),
            onUpdate: vi.fn(),
            url: 'wss://api.picklehub.ru/v1/ws',
        });
        client.connect({ cursor: 'cursor-12', matchId: 'match-id' });
        await vi.waitFor(() => {
            expect(FakeSocket.instances).toHaveLength(1);
        });
        const socket = FakeSocket.instances[0];
        socket?.emit('open');
        expect(JSON.parse(socket?.sent[0] ?? '{}')).toMatchObject({
            data: { ticket: 'ws1_ticket' },
            type: 'session.authenticate.v1',
        });
        socket?.emit('message', JSON.stringify({ type: 'session.authenticated.v1' }));
        expect(JSON.parse(socket?.sent[1] ?? '{}')).toMatchObject({
            data: { cursor: 'cursor-12', matchId: 'match-id' },
            type: 'chat.subscribe.v1',
        });
        client.close();
    });

    it('requests a canonical REST resync when the server reports a cursor gap', async () => {
        const onResyncRequired = vi.fn();
        const client = new MobileRealtimeClient({
            api: api(),
            onAuthenticationExpired: vi.fn(),
            onResyncRequired,
            onStateChange: vi.fn(),
            onUpdate: vi.fn(),
            url: 'wss://api.picklehub.ru/v1/ws',
        });
        client.connect({ cursor: 'expired-cursor', matchId: 'match-id' });
        await vi.waitFor(() => {
            expect(FakeSocket.instances).toHaveLength(1);
        });
        FakeSocket.instances[0]?.emit(
            'message',
            JSON.stringify({ data: { code: 'CURSOR_EXPIRED', resyncRequired: true }, type: 'communication.error.v1' })
        );
        expect(onResyncRequired).toHaveBeenCalledOnce();
        client.close();
    });

    it('closes the socket and cancels reconnect work in background/explicit close', async () => {
        vi.useFakeTimers();
        const createRealtimeTicket = vi.fn(() =>
            Promise.resolve({ expiresAt: '2026-09-16T10:01:00Z', ticket: 'ws1_ticket' })
        );
        const client = new MobileRealtimeClient({
            api: { createRealtimeTicket } as unknown as MobileApiClient,
            onAuthenticationExpired: vi.fn(),
            onResyncRequired: vi.fn(),
            onStateChange: vi.fn(),
            onUpdate: vi.fn(),
            url: 'wss://api.picklehub.ru/v1/ws',
        });
        client.connect({ cursor: 'cursor-12', matchId: 'match-id' });
        vi.runAllTicks();
        await Promise.resolve();
        const socket = FakeSocket.instances[0];
        client.close();
        expect(socket?.close).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(createRealtimeTicket).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });
});
