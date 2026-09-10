// Generated from the root contract. Do not edit manually.

export namespace AccountDeletionRequestedMessage {
    export interface AccountDeletionRequestedEnvelope {
        messageId: string;
        type: 'identity.account.deletion.requested.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        userId: string;
    }
}

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

export namespace ConsentChangedMessage {
    export interface ConsentChangedEnvelope {
        messageId: string;
        type: 'identity.consent.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        userId: string;
        purpose: DataPurpose;
        action: DataAction;
    }

    export type DataPurpose = 'TERMS' | 'PERSONAL_DATA' | 'ANALYTICS' | 'MARKETING';

    export type DataAction = 'ACCEPTED' | 'WITHDRAWN';
}

export namespace IdentityLinkedMessage {
    export interface IdentityLinkedEnvelope {
        messageId: string;
        type: 'identity.linked.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        userId: string;
        identityId: string;
        provider: DataProvider;
    }

    export type DataProvider = 'TELEGRAM' | 'EMAIL';
}

export namespace IdentityUnlinkedMessage {
    export interface IdentityUnlinkedEnvelope {
        messageId: string;
        type: 'identity.unlinked.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        userId: string;
        identityId: string;
        provider: DataProvider;
    }

    export type DataProvider = 'TELEGRAM' | 'EMAIL';
}

export namespace OnboardingCompletedMessage {
    export interface OnboardingCompletedEnvelope {
        messageId: string;
        type: 'identity.onboarding.completed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        userId: string;
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

export namespace SessionsRevokedMessage {
    export interface SessionsRevokedEnvelope {
        messageId: string;
        type: 'identity.sessions.revoked.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        userId: string;
        scope: DataScope;
        reason: DataReason;
    }

    export type DataScope = 'CURRENT' | 'ALL';

    export type DataReason = 'LOGOUT' | 'REPLAY' | 'IDENTITY_CHANGED' | 'DELETION';
}

export type AccountDeletionRequestedEnvelope = AccountDeletionRequestedMessage.AccountDeletionRequestedEnvelope;
export type AuthenticateEnvelope = AuthenticateMessage.AuthenticateEnvelope;
export type AuthenticatedEnvelope = AuthenticatedMessage.AuthenticatedEnvelope;
export type ConsentChangedEnvelope = ConsentChangedMessage.ConsentChangedEnvelope;
export type IdentityLinkedEnvelope = IdentityLinkedMessage.IdentityLinkedEnvelope;
export type IdentityUnlinkedEnvelope = IdentityUnlinkedMessage.IdentityUnlinkedEnvelope;
export type OnboardingCompletedEnvelope = OnboardingCompletedMessage.OnboardingCompletedEnvelope;
export type PingEnvelope = PingMessage.PingEnvelope;
export type PongEnvelope = PongMessage.PongEnvelope;
export type ProtocolErrorEnvelope = ProtocolErrorMessage.ProtocolErrorEnvelope;
export type SessionsRevokedEnvelope = SessionsRevokedMessage.SessionsRevokedEnvelope;
export type WebSocketMessage =
    | AuthenticateEnvelope
    | AuthenticatedEnvelope
    | PingEnvelope
    | PongEnvelope
    | ProtocolErrorEnvelope;
export type IdentityDomainEvent =
    | AccountDeletionRequestedEnvelope
    | ConsentChangedEnvelope
    | IdentityLinkedEnvelope
    | IdentityUnlinkedEnvelope
    | OnboardingCompletedEnvelope
    | SessionsRevokedEnvelope;
