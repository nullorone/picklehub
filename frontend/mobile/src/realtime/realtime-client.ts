import type { MobileApiClient } from '../api/mobile-client';
import { uuidV4 } from '../platform/uuid';

interface Subscription {
    readonly cursor: string;
    readonly matchId: string;
}

interface RealtimeClientOptions {
    readonly api: MobileApiClient;
    readonly onAuthenticationExpired: () => void;
    readonly onResyncRequired: () => void;
    readonly onStateChange: (state: 'CONNECTING' | 'LIVE' | 'OFFLINE') => void;
    readonly onUpdate: () => void;
    readonly url: string;
}

function envelope(type: string, data: Record<string, unknown>) {
    return { correlationId: uuidV4(), data, messageId: uuidV4(), occurredAt: new Date().toISOString(), type };
}

export class MobileRealtimeClient {
    private attempt = 0;
    private closed = true;
    private retryTimer: ReturnType<typeof setTimeout> | undefined;
    private socket: WebSocket | undefined;
    private subscription: Subscription | undefined;

    constructor(private readonly options: RealtimeClientOptions) {}

    connect(subscription: Subscription): void {
        this.close();
        this.closed = false;
        this.subscription = subscription;
        void this.open();
    }

    close(): void {
        this.closed = true;
        if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        this.socket?.close();
        this.socket = undefined;
        this.options.onStateChange('OFFLINE');
    }

    private async open(): Promise<void> {
        if (this.closed || this.subscription === undefined) return;
        this.options.onStateChange('CONNECTING');
        try {
            const ticket = await this.options.api.createRealtimeTicket(uuidV4());
            if (this.isClosed()) return;
            const socket = new WebSocket(this.options.url);
            this.socket = socket;
            socket.addEventListener('open', () => {
                socket.send(JSON.stringify(envelope('session.authenticate.v1', { ticket: ticket.ticket })));
            });
            socket.addEventListener('message', (event) => {
                this.receive(String(event.data));
            });
            socket.addEventListener('close', () => {
                this.scheduleReconnect();
            });
            socket.addEventListener('error', () => {
                socket.close();
            });
        } catch (error) {
            if (typeof error === 'object' && error !== null && 'status' in error && error.status === 401) {
                this.options.onAuthenticationExpired();
                this.close();
                return;
            }
            this.scheduleReconnect();
        }
    }

    private isClosed(): boolean {
        return this.closed;
    }

    private receive(raw: string): void {
        let message: { readonly data?: Record<string, unknown>; readonly type?: string };
        try {
            message = JSON.parse(raw) as typeof message;
        } catch {
            return;
        }
        if (message.type === 'session.authenticated.v1' && this.subscription !== undefined) {
            this.socket?.send(
                JSON.stringify(
                    envelope('chat.subscribe.v1', {
                        cursor: this.subscription.cursor,
                        matchId: this.subscription.matchId,
                    })
                )
            );
        } else if (message.type === 'chat.subscribed.v1') {
            this.attempt = 0;
            this.options.onStateChange('LIVE');
        } else if (message.type?.startsWith('chat.message.') === true || message.type === 'chat.system.event.v1') {
            this.options.onUpdate();
        } else if (message.type === 'communication.error.v1') {
            if (message.data?.code === 'AUTHENTICATION_REQUIRED') this.options.onAuthenticationExpired();
            if (message.data?.resyncRequired === true) this.options.onResyncRequired();
        }
    }

    private scheduleReconnect(): void {
        if (this.closed) return;
        this.socket = undefined;
        this.options.onStateChange('CONNECTING');
        const base = Math.min(30_000, 1_000 * 2 ** this.attempt);
        const jitter = Math.floor(Math.random() * Math.max(1, base / 4));
        this.attempt += 1;
        this.retryTimer = setTimeout(() => void this.open(), base + jitter);
    }
}
