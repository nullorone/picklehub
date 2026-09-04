// Generated from the root contract. Do not edit manually.

export namespace AuthenticateMessage {
    export interface AuthenticateEnvelope {
        messageId: string;
        type: 'session.authenticate.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        ticket: string;
    }
}

export namespace AuthenticatedMessage {
    export interface AuthenticatedEnvelope {
        messageId: string;
        type: 'session.authenticated.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        connectionId: string;
        resumeCursor: string | null;
    }
}

export namespace PingMessage {
    export interface PingEnvelope {
        messageId: string;
        type: 'protocol.ping.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export type MessageEnvelopeData = Record<string, never>;
}

export namespace PongMessage {
    export interface PongEnvelope {
        messageId: string;
        type: 'protocol.pong.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export type MessageEnvelopeData = Record<string, never>;
}

export namespace ProtocolErrorMessage {
    export interface ProtocolErrorEnvelope {
        messageId: string;
        type: 'protocol.error.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        code: string;
        message: string;
        retryable: boolean;
        retryAfterMs?: number;
    }
}

export type AuthenticateEnvelope = AuthenticateMessage.AuthenticateEnvelope;
export type AuthenticatedEnvelope = AuthenticatedMessage.AuthenticatedEnvelope;
export type PingEnvelope = PingMessage.PingEnvelope;
export type PongEnvelope = PongMessage.PongEnvelope;
export type ProtocolErrorEnvelope = ProtocolErrorMessage.ProtocolErrorEnvelope;
export type WebSocketMessage =
    | AuthenticateEnvelope
    | AuthenticatedEnvelope
    | PingEnvelope
    | PongEnvelope
    | ProtocolErrorEnvelope;
