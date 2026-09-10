import { WebSocket } from 'ws';

import type { Environment } from '../../src/common/config/environment';
import type { RedisService } from '../../src/common/redis/redis.service';
import { CommunicationGateway } from '../../src/communications/communication.gateway';
import type { CommunicationIdempotencyService } from '../../src/communications/communication-idempotency.service';
import type { CommunicationMetricsService } from '../../src/communications/communication-metrics.service';
import type { CommunicationService } from '../../src/communications/communication.service';
import type { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import type { IdentityService } from '../../src/identity/identity.service';

const matchId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

describe('communication WebSocket protocol', () => {
    it('rejects a disallowed Origin before authentication', () => {
        const { gateway } = fixture();
        const socket = client();

        gateway.handleConnection(socket.value, { headers: { origin: 'https://evil.example' } } as never);

        expect(socket.close).toHaveBeenCalledWith(1008, 'REQUEST_NOT_ALLOWED');
    });

    it('requires authentication for every subscription and reports a structured error', async () => {
        const { gateway, communications } = fixture();
        const socket = client();

        await gateway.subscribe(socket.value, envelope('chat.subscribe.v1', { matchId }));

        expect(communications.snapshot).not.toHaveBeenCalled();
        expect(sent(socket)).toMatchObject({
            data: { code: 'AUTHENTICATION_REQUIRED', resyncRequired: false },
            type: 'communication.error.v1',
        });
    });

    it('consumes a ticket once, authorizes the match and returns cursor catch-up in sequence order', async () => {
        const { gateway, communications, redisSet } = fixture();
        const socket = client();
        const replaySocket = client();
        const ticket = 't'.repeat(43);

        await gateway.authenticate(socket.value, envelope('session.authenticate.v1', { ticket }));
        await gateway.subscribe(socket.value, envelope('chat.subscribe.v1', { cursor: 'forward-cursor', matchId }));
        await gateway.authenticate(replaySocket.value, envelope('session.authenticate.v1', { ticket }));

        expect(redisSet).toHaveBeenCalledTimes(2);
        expect(redisSet).toHaveBeenCalledWith(expect.stringContaining(':ws-ticket:'), '1', 'EX', 60, 'NX');
        expect(communications.snapshot).toHaveBeenCalledWith(userId, matchId);
        expect(communications.history).toHaveBeenCalledWith(userId, matchId, 'forward-cursor', 50);
        const output = socket.messages.map((value) => JSON.parse(value) as { type: string });
        expect(output.map((item) => item.type)).toEqual([
            'session.authenticated.v1',
            'chat.message.created.v1',
            'chat.message.created.v1',
            'chat.subscribed.v1',
        ]);
        expect(sent(replaySocket)).toMatchObject({
            data: { code: 'AUTHENTICATION_REQUIRED' },
            type: 'communication.error.v1',
        });
    });

    it('requires REST resync when a reconnect gap exceeds one bounded page', async () => {
        const { gateway, communications } = fixture();
        const socket = client();
        await gateway.authenticate(socket.value, envelope('session.authenticate.v1', { ticket: 't'.repeat(43) }));
        communications.history.mockResolvedValueOnce({
            items: [],
            pageInfo: { hasNext: true },
        });

        await gateway.subscribe(socket.value, envelope('chat.subscribe.v1', { cursor: 'stale-cursor', matchId }));

        expect(sent(socket)).toMatchObject({
            data: { code: 'GAP_LIMIT', resyncRequired: true },
            type: 'communication.error.v1',
        });
    });
});

function fixture() {
    const subscriber = { disconnect: jest.fn(), on: jest.fn(), status: 'end', subscribe: jest.fn() };
    const redisSet = jest.fn().mockResolvedValueOnce('OK').mockResolvedValue(null);
    const redis = {
        client: { duplicate: jest.fn().mockReturnValue(subscriber), set: redisSet },
    } as unknown as RedisService;
    const communications = {
        history: jest.fn().mockResolvedValue({
            items: [message(1), message(2)],
            pageInfo: { hasNext: false },
        }),
        snapshot: jest.fn().mockResolvedValue({
            catchUpCursor: 'current-cursor',
            conversation: { accessThroughSequence: null, id: conversationId, latestSequence: 2 },
        }),
    };
    const gateway = new CommunicationGateway(
        {
            APP_ROLE: 'api',
            IDENTITY_ALLOWED_ORIGINS: 'https://web.picklehub.test,https://tg.picklehub.test',
            REDIS_NAMESPACE: 'test',
        } as Environment,
        {
            authenticate: jest.fn().mockResolvedValue({ session: { userId } }),
        } as unknown as IdentityService,
        { hash: jest.fn().mockReturnValue('ticket-hash') } as unknown as IdentityCryptoService,
        redis,
        communications as unknown as CommunicationService,
        {} as CommunicationIdempotencyService,
        { increment: jest.fn() } as unknown as CommunicationMetricsService
    );
    return { communications, gateway, redisSet };
}

function client() {
    const messages: string[] = [];
    const record = (value: string): void => {
        messages.push(value);
    };
    const send = jest.fn(record);
    const closeSocket = (code: number, reason: string): void => {
        void code;
        void reason;
    };
    const close = jest.fn(closeSocket);
    return {
        close,
        messages,
        send,
        value: { close, readyState: WebSocket.OPEN, send } as unknown as WebSocket,
    };
}

function envelope(type: string, data: Record<string, unknown>) {
    return {
        correlationId: '44444444-4444-4444-8444-444444444444',
        data,
        messageId: '55555555-5555-4555-8555-555555555555',
        type,
    };
}

function message(sequence: number) {
    return {
        authorId: userId,
        conversationId,
        createdAt: '2026-09-10T10:00:00.000Z',
        deletedAt: null,
        editedAt: null,
        id: `${String(sequence).padStart(8, '0')}-1111-4111-8111-111111111111`,
        kind: 'USER',
        revision: 1,
        sequence,
        systemType: null,
        text: `message-${String(sequence)}`,
    };
}

function sent(socket: ReturnType<typeof client>) {
    return JSON.parse(socket.messages.at(-1) ?? '{}') as object;
}
