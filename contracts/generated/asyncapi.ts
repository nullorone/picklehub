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

export namespace MatchCancelledMessage {
    export interface MatchCancelledEnvelope {
        messageId: string;
        type: 'match.cancelled.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
        stage: DataStage;
    }

    export type DataStage = 'DRAFT' | 'PUBLISHED';
}

export namespace MatchCompletedConfirmedMessage {
    export interface MatchCompletedConfirmedEnvelope {
        messageId: string;
        type: 'match.completed.confirmed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
        resultId: string;
        resultVersion: number;
        markerId: string;
        mode: DataMode;
        format: DataFormat;
        confirmationPath: DataConfirmationPath;
    }

    export type DataMode = 'SCORED' | 'PLAYED_WITHOUT_SCORE';

    export type DataFormat = 'SINGLES' | 'DOUBLES';

    export type DataConfirmationPath = 'PLAYER' | 'MODERATOR';
}

export namespace MatchCreatedMessage {
    export interface MatchCreatedEnvelope {
        messageId: string;
        type: 'match.created.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
    }
}

export namespace MatchJoinIntentRecordedMessage {
    export interface MatchJoinIntentRecordedEnvelope {
        messageId: string;
        type: 'match.join.intent.recorded.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
        outcome: DataOutcome;
        teamChoice: DataTeamChoice;
    }

    export type DataOutcome = 'AUTO_JOINED' | 'AUTO_WAITLISTED' | 'APPROVAL_PENDING';

    export type DataTeamChoice = 'TEAM_A' | 'TEAM_B' | 'ANY';
}

export namespace MatchPublishedMessage {
    export interface MatchPublishedEnvelope {
        messageId: string;
        type: 'match.published.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
        format: DataFormat;
        visibility: DataVisibility;
        joinMode: DataJoinMode;
    }

    export type DataFormat = 'SINGLES' | 'DOUBLES';

    export type DataVisibility = 'PUBLIC' | 'UNLISTED';

    export type DataJoinMode = 'AUTO' | 'APPROVAL';
}

export namespace MatchResultDisputedMessage {
    export interface MatchResultDisputedEnvelope {
        messageId: string;
        type: 'match.result.disputed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
        resultId: string;
        resultVersion: number;
        mode: DataMode;
    }

    export type DataMode = 'SCORED' | 'PLAYED_WITHOUT_SCORE';
}

export namespace MatchResultProposedMessage {
    export interface MatchResultProposedEnvelope {
        messageId: string;
        type: 'match.result.proposed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
        resultId: string;
        resultVersion: number;
        mode: DataMode;
    }

    export type DataMode = 'SCORED' | 'PLAYED_WITHOUT_SCORE';
}

export namespace MatchRosterChangedMessage {
    export interface MatchRosterChangedEnvelope {
        messageId: string;
        type: 'match.roster.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
        rosterComplete: boolean;
        completionSequence: number;
    }
}

export namespace MatchStartedMessage {
    export interface MatchStartedEnvelope {
        messageId: string;
        type: 'match.started.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        matchId: string;
        aggregateVersion: number;
        format: DataFormat;
        roster: DataRoster;
    }

    export type DataFormat = 'SINGLES' | 'DOUBLES';

    export type DataRoster = 'MINIMUM' | 'FULL';
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

export namespace VenueCandidateCreatedMessage {
    export interface VenueCandidateCreatedEnvelope {
        messageId: string;
        type: 'venue.candidate.created.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        candidateId: string;
        sourceMatchId: string;
    }
}

export namespace VenueMergedMessage {
    export interface VenueMergedEnvelope {
        messageId: string;
        type: 'venue.merged.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        previousVenueId: string;
        canonicalVenueId: string;
    }
}

export namespace VenueVerifiedMessage {
    export interface VenueVerifiedEnvelope {
        messageId: string;
        type: 'venue.verified.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        venueId: string;
        verificationState: DataVerificationState;
    }

    export type DataVerificationState = 'IMPORTED_UNREVIEWED' | 'COMMUNITY_CONFIRMED' | 'MODERATOR_VERIFIED' | 'STALE';
}

export type AccountDeletionRequestedEnvelope = AccountDeletionRequestedMessage.AccountDeletionRequestedEnvelope;
export type AuthenticateEnvelope = AuthenticateMessage.AuthenticateEnvelope;
export type AuthenticatedEnvelope = AuthenticatedMessage.AuthenticatedEnvelope;
export type ConsentChangedEnvelope = ConsentChangedMessage.ConsentChangedEnvelope;
export type IdentityLinkedEnvelope = IdentityLinkedMessage.IdentityLinkedEnvelope;
export type IdentityUnlinkedEnvelope = IdentityUnlinkedMessage.IdentityUnlinkedEnvelope;
export type MatchCancelledEnvelope = MatchCancelledMessage.MatchCancelledEnvelope;
export type MatchCompletedConfirmedEnvelope = MatchCompletedConfirmedMessage.MatchCompletedConfirmedEnvelope;
export type MatchCreatedEnvelope = MatchCreatedMessage.MatchCreatedEnvelope;
export type MatchJoinIntentRecordedEnvelope = MatchJoinIntentRecordedMessage.MatchJoinIntentRecordedEnvelope;
export type MatchPublishedEnvelope = MatchPublishedMessage.MatchPublishedEnvelope;
export type MatchResultDisputedEnvelope = MatchResultDisputedMessage.MatchResultDisputedEnvelope;
export type MatchResultProposedEnvelope = MatchResultProposedMessage.MatchResultProposedEnvelope;
export type MatchRosterChangedEnvelope = MatchRosterChangedMessage.MatchRosterChangedEnvelope;
export type MatchStartedEnvelope = MatchStartedMessage.MatchStartedEnvelope;
export type OnboardingCompletedEnvelope = OnboardingCompletedMessage.OnboardingCompletedEnvelope;
export type PingEnvelope = PingMessage.PingEnvelope;
export type PongEnvelope = PongMessage.PongEnvelope;
export type ProtocolErrorEnvelope = ProtocolErrorMessage.ProtocolErrorEnvelope;
export type SessionsRevokedEnvelope = SessionsRevokedMessage.SessionsRevokedEnvelope;
export type VenueCandidateCreatedEnvelope = VenueCandidateCreatedMessage.VenueCandidateCreatedEnvelope;
export type VenueMergedEnvelope = VenueMergedMessage.VenueMergedEnvelope;
export type VenueVerifiedEnvelope = VenueVerifiedMessage.VenueVerifiedEnvelope;
export type WebSocketMessage =
    | AuthenticateEnvelope
    | AuthenticatedEnvelope
    | MatchCancelledEnvelope
    | MatchCompletedConfirmedEnvelope
    | MatchCreatedEnvelope
    | MatchJoinIntentRecordedEnvelope
    | MatchPublishedEnvelope
    | MatchResultDisputedEnvelope
    | MatchResultProposedEnvelope
    | MatchRosterChangedEnvelope
    | MatchStartedEnvelope
    | PingEnvelope
    | PongEnvelope
    | ProtocolErrorEnvelope
    | VenueCandidateCreatedEnvelope
    | VenueMergedEnvelope
    | VenueVerifiedEnvelope;
export type IdentityDomainEvent =
    | AccountDeletionRequestedEnvelope
    | ConsentChangedEnvelope
    | IdentityLinkedEnvelope
    | IdentityUnlinkedEnvelope
    | OnboardingCompletedEnvelope
    | SessionsRevokedEnvelope;
