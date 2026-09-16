import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
} from '@nestjs/websockets';
import type { Prisma } from '@prisma/client';
import type { IncomingMessage } from 'node:http';
import type { Redis } from 'ioredis';
import { WebSocket } from 'ws';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RedisService } from '../common/redis/redis.service';
import { CommunicationException, communicationError } from './communication.errors';
import { CommunicationIdempotencyService } from './communication-idempotency.service';
import { CommunicationMetricsService } from './communication-metrics.service';
import { CommunicationService } from './communication.service';
import { RealtimeTicketService } from './realtime-ticket.service';

interface Envelope {
    messageId?: unknown;
    type?: unknown;
    correlationId?: unknown;
    data?: Record<string, unknown>;
}

interface SocketState {
    userId: string;
    conversations: Set<string>;
}

@Injectable()
@WebSocketGateway({ path: '/v1/ws', maxPayload: 16_384 })
export class CommunicationGateway
    implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationBootstrap, OnModuleDestroy
{
    private readonly states = new Map<WebSocket, SocketState>();
    private readonly origins: Set<string>;
    private readonly subscriber: Redis;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        redis: RedisService,
        private readonly tickets: RealtimeTicketService,
        private readonly communications: CommunicationService,
        private readonly idempotency: CommunicationIdempotencyService,
        private readonly metrics: CommunicationMetricsService
    ) {
        this.origins = new Set(environment.IDENTITY_ALLOWED_ORIGINS.split(',').map((item) => item.trim()));
        this.subscriber = redis.client.duplicate({ connectionName: `${environment.REDIS_NAMESPACE}:ws-subscriber` });
        this.subscriber.on('error', () => undefined);
    }

    async onApplicationBootstrap(): Promise<void> {
        if (this.environment.APP_ROLE !== 'api') return;
        try {
            await this.subscriber.subscribe(
                `${this.environment.REDIS_NAMESPACE}:communication:realtime`,
                `${this.environment.REDIS_NAMESPACE}:communication:notifications`
            );
            this.subscriber.on('message', (channel, payload) => {
                void this.relay(channel, payload);
            });
        } catch {
            this.metrics.increment('communication_realtime_subscription_failure_total');
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.states.clear();
        if (this.subscriber.status === 'ready') await this.subscriber.quit();
        else this.subscriber.disconnect(false);
    }

    handleConnection(client: WebSocket, request: IncomingMessage): void {
        const origin = request.headers.origin;
        if (origin !== undefined && !this.origins.has(origin)) {
            client.close(1008, 'REQUEST_NOT_ALLOWED');
        }
    }

    handleDisconnect(client: WebSocket): void {
        this.states.delete(client);
    }

    @SubscribeMessage('session.authenticate.v1')
    async authenticate(@ConnectedSocket() client: WebSocket, @MessageBody() envelope: Envelope): Promise<void> {
        await this.respond(client, envelope, async () => {
            if (this.states.has(client)) throw communicationError('VALIDATION_FAILED', 400);
            const ticket = envelope.data?.ticket;
            if (typeof ticket !== 'string') throw communicationError('SESSION_INVALID', 401);
            const authenticated = await this.tickets.consume(ticket);
            this.states.set(client, { userId: authenticated.session.userId, conversations: new Set() });
            return this.envelope(envelope, 'session.authenticated.v1', {
                connectionId: uuidV7(),
                resumeCursor: null,
            });
        });
    }

    @SubscribeMessage('chat.subscribe.v1')
    async subscribe(@ConnectedSocket() client: WebSocket, @MessageBody() envelope: Envelope): Promise<void> {
        await this.respond(client, envelope, async () => {
            const state = this.state(client);
            const matchId = this.uuid(envelope.data?.matchId);
            const snapshot = (await this.communications.snapshot(state.userId, matchId)) as {
                conversation: { id: string; latestSequence: number; accessThroughSequence: number | null };
                catchUpCursor: string;
            };
            state.conversations.add(snapshot.conversation.id);
            const cursor = envelope.data?.cursor;
            if (cursor !== null && cursor !== undefined) {
                if (typeof cursor !== 'string') throw communicationError('INVALID_CURSOR', 400);
                const page = (await this.communications.history(state.userId, matchId, cursor, 50)) as {
                    items: object[];
                    pageInfo: { hasNext: boolean };
                };
                if (page.pageInfo.hasNext) throw communicationError('RESYNC_REQUIRED', 400);
                for (const message of page.items) this.send(client, this.messageEnvelope(envelope, message));
            }
            return this.envelope(envelope, 'chat.subscribed.v1', {
                conversationId: snapshot.conversation.id,
                latestSequence: snapshot.conversation.latestSequence,
                accessThroughSequence: snapshot.conversation.accessThroughSequence,
                cursor: snapshot.catchUpCursor,
            });
        });
    }

    @SubscribeMessage('chat.message.create.v1')
    async create(@ConnectedSocket() client: WebSocket, @MessageBody() envelope: Envelope): Promise<void> {
        await this.chatCommand(client, envelope, 'POST', async (userId, conversationId, tx) => {
            const text = envelope.data?.text;
            if (typeof text !== 'string') throw communicationError('VALIDATION_FAILED', 400);
            const access = await this.communications.authorizeConversationId(userId, conversationId, true);
            return this.communications.send(userId, access.matchId, text, tx);
        });
    }

    @SubscribeMessage('chat.message.update.v1')
    async update(@ConnectedSocket() client: WebSocket, @MessageBody() envelope: Envelope): Promise<void> {
        await this.chatCommand(client, envelope, 'PATCH', async (userId, conversationId, tx) => {
            const text = envelope.data?.text;
            const expectedRevision = envelope.data?.expectedRevision;
            if (typeof text !== 'string' || !Number.isInteger(expectedRevision))
                throw communicationError('VALIDATION_FAILED', 400);
            const access = await this.communications.authorizeConversationId(userId, conversationId, true);
            return this.communications.edit(
                userId,
                access.matchId,
                this.uuid(envelope.data?.messageId),
                expectedRevision as number,
                text,
                tx
            );
        });
    }

    @SubscribeMessage('chat.message.delete.v1')
    async remove(@ConnectedSocket() client: WebSocket, @MessageBody() envelope: Envelope): Promise<void> {
        await this.chatCommand(client, envelope, 'DELETE', async (userId, conversationId, tx) => {
            const expectedRevision = envelope.data?.expectedRevision;
            if (!Number.isInteger(expectedRevision)) throw communicationError('VALIDATION_FAILED', 400);
            const access = await this.communications.authorizeConversationId(userId, conversationId, true);
            return this.communications.remove(
                userId,
                access.matchId,
                this.uuid(envelope.data?.messageId),
                expectedRevision as number,
                tx
            );
        });
    }

    @SubscribeMessage('protocol.ping.v1')
    ping(@ConnectedSocket() client: WebSocket, @MessageBody() envelope: Envelope): void {
        this.state(client);
        this.send(client, this.envelope(envelope, 'protocol.pong.v1', {}));
    }

    private async chatCommand(
        client: WebSocket,
        envelope: Envelope,
        method: 'POST' | 'PATCH' | 'DELETE',
        operation: (userId: string, conversationId: string, tx: Prisma.TransactionClient) => Promise<object>
    ): Promise<void> {
        await this.respond(client, envelope, async () => {
            const state = this.state(client);
            const conversationId = this.uuid(envelope.data?.conversationId);
            if (!state.conversations.has(conversationId)) throw communicationError('CONVERSATION_ACCESS_DENIED', 403);
            const key = this.uuidV4(envelope.data?.idempotencyKey);
            const result = await this.idempotency.execute(
                state.userId,
                key,
                method,
                `/v1/ws/conversations/${conversationId}/messages`,
                envelope.data ?? {},
                method === 'POST' ? 201 : 200,
                (tx) => operation(state.userId, conversationId, tx)
            );
            return this.messageEnvelope(envelope, result.value);
        });
    }

    private async relay(channel: string, payload: string): Promise<void> {
        try {
            const event = JSON.parse(payload) as {
                conversationId?: unknown;
                sequence?: unknown;
                notificationId?: unknown;
            };
            for (const [client, state] of this.states) {
                if (client.readyState !== WebSocket.OPEN) continue;
                try {
                    if (channel.endsWith(':realtime')) {
                        if (typeof event.conversationId !== 'string' || typeof event.sequence !== 'string') continue;
                        if (!state.conversations.has(event.conversationId)) continue;
                        const message = await this.communications.realtimeMessage(
                            state.userId,
                            event.conversationId,
                            BigInt(event.sequence)
                        );
                        if (message !== null) this.send(client, this.messageEnvelope({}, message));
                    } else if (typeof event.notificationId === 'string') {
                        const notification = await this.communications.realtimeNotification(
                            state.userId,
                            event.notificationId
                        );
                        if (notification !== null) {
                            const item = notification as {
                                id: string;
                                type: string;
                                category: string;
                                route: string;
                                createdAt: string;
                            };
                            this.send(
                                client,
                                this.envelope({}, 'notification.created.v1', {
                                    notificationId: item.id,
                                    notificationType: item.type,
                                    category: item.category,
                                    route: item.route,
                                    createdAt: item.createdAt,
                                })
                            );
                        }
                    }
                } catch {
                    if (typeof event.conversationId === 'string') state.conversations.delete(event.conversationId);
                    this.metrics.increment('communication_realtime_authorization_denial_total');
                }
            }
        } catch {
            this.metrics.increment('communication_realtime_relay_failure_total');
        }
    }

    private state(client: WebSocket): SocketState {
        const state = this.states.get(client);
        if (state === undefined) throw communicationError('SESSION_INVALID', 401);
        return state;
    }

    private async respond(client: WebSocket, envelope: Envelope, operation: () => Promise<object>): Promise<void> {
        try {
            this.send(client, await operation());
        } catch (error) {
            const internalCode = error instanceof CommunicationException ? error.code : 'VALIDATION_FAILED';
            const candidate =
                internalCode === 'SESSION_INVALID'
                    ? 'AUTHENTICATION_REQUIRED'
                    : internalCode === 'RESYNC_REQUIRED'
                      ? 'GAP_LIMIT'
                      : internalCode;
            const code = [
                'AUTHENTICATION_REQUIRED',
                'CONVERSATION_ACCESS_DENIED',
                'VALIDATION_FAILED',
                'MESSAGE_REVISION_CONFLICT',
                'CURSOR_EXPIRED',
                'GAP_LIMIT',
                'RATE_LIMITED',
            ].includes(candidate)
                ? candidate
                : 'VALIDATION_FAILED';
            this.metrics.increment('communication_protocol_error_total', { code });
            this.send(
                client,
                this.envelope(envelope, 'communication.error.v1', {
                    code,
                    retryable: code === 'RATE_LIMITED',
                    resyncRequired: code === 'CURSOR_EXPIRED' || code === 'GAP_LIMIT',
                })
            );
        }
    }

    private messageEnvelope(source: Envelope, raw: object): object {
        const message = raw as {
            kind?: unknown;
            deletedAt?: unknown;
            editedAt?: unknown;
            conversationId?: unknown;
            sequence?: unknown;
            id?: unknown;
            systemType?: unknown;
        };
        const type =
            message.kind === 'SYSTEM'
                ? 'chat.system.event.v1'
                : message.deletedAt !== null && message.deletedAt !== undefined
                  ? 'chat.message.deleted.v1'
                  : message.editedAt !== null && message.editedAt !== undefined
                    ? 'chat.message.updated.v1'
                    : 'chat.message.created.v1';
        const value = raw as {
            id?: unknown;
            authorId?: unknown;
            text?: unknown;
            systemType?: unknown;
            revision?: unknown;
            editedAt?: unknown;
            deletedAt?: unknown;
            createdAt?: unknown;
        };
        const data =
            type === 'chat.system.event.v1'
                ? {
                      conversationId: message.conversationId,
                      chatMessageId: value.id,
                      systemType: value.systemType,
                  }
                : type === 'chat.message.deleted.v1'
                  ? {
                        conversationId: message.conversationId,
                        chatMessageId: value.id,
                        revision: value.revision,
                        deletedAt: value.deletedAt,
                    }
                  : {
                        conversationId: message.conversationId,
                        chatMessageId: value.id,
                        authorId: value.authorId,
                        revision: value.revision,
                        text: value.text,
                        createdAt: value.createdAt,
                        editedAt: value.editedAt,
                    };
        return this.envelope(source, type, data, String(message.conversationId), Number(message.sequence));
    }

    private envelope(source: Envelope, type: string, data: object, stream?: string, sequence?: number): object {
        return {
            messageId: uuidV7(),
            type,
            occurredAt: new Date().toISOString(),
            correlationId: typeof source.correlationId === 'string' ? source.correlationId : uuidV7(),
            causationId: typeof source.messageId === 'string' ? source.messageId : null,
            ...(stream === undefined ? {} : { stream }),
            ...(sequence === undefined ? {} : { sequence }),
            data,
        };
    }

    private send(client: WebSocket, value: object): void {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value));
    }

    private uuid(value: unknown): string {
        if (
            typeof value !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
        )
            throw communicationError('VALIDATION_FAILED', 400);
        return value;
    }

    private uuidV4(value: unknown): string {
        const parsed = this.uuid(value);
        if (parsed[14] !== '4') throw communicationError('VALIDATION_FAILED', 400);
        return parsed;
    }
}
