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

export namespace AchievementAwardChangedMessage {
    export interface AchievementAwardChangedEnvelope {
        messageId: string;
        type: 'gamification.achievement-award.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        achievementAwardId: string;
        state: DataState;
    }

    export type DataState = 'EARNED' | 'REVOKED' | 'REINSTATED';
}

export namespace AdvertisingClickValidatedMessage {
    export interface AdvertisingClickValidatedEnvelope {
        messageId: string;
        type: 'advertising.click.validated.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        deliveryId: string;
        campaignId: string;
        campaignRevisionId: string;
        creativeId: string;
        placementId: string;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'VALID_CLICK';
}

export namespace AdvertisingDeliveryIssuedMessage {
    export interface AdvertisingDeliveryIssuedEnvelope {
        messageId: string;
        type: 'advertising.delivery.issued.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        deliveryId: string;
        campaignId: string;
        campaignRevisionId: string;
        creativeId: string;
        placementId: string;
        source: DataSource;
        outcome: DataOutcome;
    }

    export type DataSource = 'DIRECT' | 'EXTERNAL_FALLBACK' | 'HOUSE';

    export type DataOutcome = 'ISSUED';
}

export namespace AdvertisingImpressionViewableMessage {
    export interface AdvertisingImpressionViewableEnvelope {
        messageId: string;
        type: 'advertising.impression.viewable.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        deliveryId: string;
        campaignId: string;
        campaignRevisionId: string;
        creativeId: string;
        placementId: string;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'VIEWABLE_IMPRESSION';
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

export namespace ChatMessageCreateCommandMessage {
    export interface ChatMessageCreateCommandEnvelope {
        messageId: string;
        type: 'chat.message.create.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        conversationId: string;
        idempotencyKey: string;
        text: string;
    }
}

export namespace ChatMessageCreatedMessage {
    export interface ChatMessageEventEnvelope {
        messageId: string;
        type: 'chat.message.created.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream: string;
        sequence: number;
        data: ChatMessageData;
    }

    export interface ChatMessageData {
        conversationId: string;
        chatMessageId: string;
        authorId: string;
        revision: number;
        text: string;
        createdAt: string;
        editedAt: string | null;
    }
}

export namespace ChatMessageDeleteCommandMessage {
    export interface ChatMessageDeleteCommandEnvelope {
        messageId: string;
        type: 'chat.message.delete.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        conversationId: string;
        messageId: string;
        expectedRevision: number;
        idempotencyKey: string;
    }
}

export namespace ChatMessageDeletedMessage {
    export interface ChatMessageDeletedEnvelope {
        messageId: string;
        type: 'chat.message.deleted.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream: string;
        sequence: number;
        data: Data;
    }

    export interface Data {
        conversationId: string;
        chatMessageId: string;
        revision: number;
        deletedAt: string;
    }
}

export namespace ChatMessageUpdateCommandMessage {
    export interface ChatMessageUpdateCommandEnvelope {
        messageId: string;
        type: 'chat.message.update.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        conversationId: string;
        messageId: string;
        expectedRevision: number;
        idempotencyKey: string;
        text: string;
    }
}

export namespace ChatMessageUpdatedMessage {
    export interface ChatMessageUpdatedEnvelope {
        messageId: string;
        type: 'chat.message.updated.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream: string;
        sequence: number;
        data: ChatMessageData;
    }

    export interface ChatMessageData {
        conversationId: string;
        chatMessageId: string;
        authorId: string;
        revision: number;
        text: string;
        createdAt: string;
        editedAt: string | null;
    }
}

export namespace ChatStreamChangedMessage {
    export interface ChatStreamChangedEnvelope {
        messageId: string;
        type: 'communication.chat.stream.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream: string;
        sequence: number;
        data: Data;
    }

    export interface Data {
        conversationId: string;
        chatMessageId: string;
        change: DataChange;
    }

    export type DataChange = 'CREATED' | 'UPDATED' | 'DELETED' | 'SYSTEM';
}

export namespace ChatSubscribeMessage {
    export interface ChatSubscribeEnvelope {
        messageId: string;
        type: 'chat.subscribe.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        matchId: string;
        cursor: string | null;
    }
}

export namespace ChatSubscribedMessage {
    export interface ChatSubscribedEnvelope {
        messageId: string;
        type: 'chat.subscribed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        conversationId: string;
        latestSequence: number;
        accessThroughSequence: number | null;
        cursor: string;
    }
}

export namespace ChatSystemEventMessage {
    export interface ChatSystemEventEnvelope {
        messageId: string;
        type: 'chat.system.event.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream: string;
        sequence: number;
        data: Data;
    }

    export interface Data {
        conversationId: string;
        chatMessageId: string;
        systemType: DataSystemType;
    }

    export type DataSystemType =
        | 'ROSTER_JOINED'
        | 'ROSTER_LEFT'
        | 'MATCH_CANCELLED'
        | 'MATCH_TIME_CHANGED'
        | 'MATCH_VENUE_CHANGED'
        | 'MATCH_STARTED'
        | 'RESULT_PROPOSED'
        | 'RESULT_CONFIRMED'
        | 'RESULT_DISPUTED';
}

export namespace ClubCreatedMessage {
    export interface ClubCreatedEnvelope {
        messageId: string;
        type: 'club.created.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        clubId: string;
        clubVersion: number;
        state: DataState;
        membershipPolicy: DataMembershipPolicy;
    }

    export type DataState = 'ACTIVE';

    export type DataMembershipPolicy = 'OPEN' | 'APPROVAL' | 'INVITE_ONLY';
}

export namespace ClubMembershipChangedMessage {
    export interface ClubMembershipChangedEnvelope {
        messageId: string;
        type: 'club.membership.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        clubId: string;
        clubVersion: number;
        membershipId: string;
        membershipRevision: number;
        state: DataState;
        role: DataRole;
    }

    export type DataState = 'ACTIVE' | 'LEFT' | 'EXCLUDED' | 'SUPERSEDED';

    export type DataRole = 'OWNER' | 'ADMIN' | 'MEMBER';
}

export namespace ClubRecurringOccurrenceRecordedMessage {
    export interface ClubRecurringOccurrenceRecordedEnvelope {
        messageId: string;
        type: 'club.recurring.occurrence.recorded.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        clubId: string;
        clubVersion: number;
        ruleId: string;
        occurrenceId: string;
        calendarKey: string;
        state: DataState;
        matchId: string | null;
    }

    export type DataState = 'MATERIALIZED' | 'SKIPPED_DST_GAP' | 'SKIPPED_PAUSE';
}

export namespace ClubRecurringRuleChangedMessage {
    export interface ClubRecurringRuleChangedEnvelope {
        messageId: string;
        type: 'club.recurring.rule.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        clubId: string;
        clubVersion: number;
        ruleId: string;
        ruleRevision: number;
        state: DataState;
    }

    export type DataState = 'ACTIVE' | 'PAUSED' | 'ENDED';
}

export namespace ClubStateChangedMessage {
    export interface ClubStateChangedEnvelope {
        messageId: string;
        type: 'club.state.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        clubId: string;
        clubVersion: number;
        state: DataState;
    }

    export type DataState = 'ACTIVE' | 'ARCHIVED';
}

export namespace ClubVenueLinkChangedMessage {
    export interface ClubVenueLinkChangedEnvelope {
        messageId: string;
        type: 'club.venue.link.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        clubId: string;
        clubVersion: number;
        venueId: string;
        change: DataChange;
    }

    export type DataChange = 'LINKED' | 'UNLINKED' | 'CANONICALIZED' | 'HIDDEN';
}

export namespace CommunicationErrorMessage {
    export interface CommunicationErrorEnvelope {
        messageId: string;
        type: 'communication.error.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        code: AllOf_1DataCode;
        retryable: boolean;
        resyncRequired: boolean;
        retryAfterMs?: number;
    }

    export type AllOf_1DataCode =
        | 'AUTHENTICATION_REQUIRED'
        | 'CONVERSATION_ACCESS_DENIED'
        | 'VALIDATION_FAILED'
        | 'MESSAGE_REVISION_CONFLICT'
        | 'CURSOR_EXPIRED'
        | 'RETENTION_GAP'
        | 'GAP_LIMIT'
        | 'RATE_LIMITED';
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

export namespace ContentArticlePublishedMessage {
    export interface ContentArticlePublishedEnvelope {
        messageId: string;
        type: 'content.article.published.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        articleId: string;
        revisionId: string;
        articleVersion: number;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'PUBLISHED';
}

export namespace ContentArticleUnpublishedMessage {
    export interface ContentArticleUnpublishedEnvelope {
        messageId: string;
        type: 'content.article.unpublished.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        articleId: string;
        revisionId: string;
        articleVersion: number;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'EDITORIAL' | 'CORRECTION' | 'RIGHTS_REVOKED' | 'LEGAL_TAKEDOWN' | 'SAFETY_REQUEST';
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

export namespace LeaderboardConsentChangedMessage {
    export interface LeaderboardConsentChangedEnvelope {
        messageId: string;
        type: 'gamification.leaderboard-consent.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        consentId: string;
        revision: number;
        action: DataAction;
    }

    export type DataAction = 'OPTED_IN' | 'OPTED_OUT';
}

export namespace LeaderboardProjectionChangedMessage {
    export interface LeaderboardProjectionChangedEnvelope {
        messageId: string;
        type: 'gamification.leaderboard-projection.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        seasonId: string;
        projectionRevision: number;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'REBUILT' | 'ROW_REMOVED' | 'INVALIDATED' | 'CLOSED';
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

export namespace MiniGameCosmeticUnlockChangedMessage {
    export interface MiniGameCosmeticUnlockChangedEnvelope {
        messageId: string;
        type: 'mini-game.cosmetic-unlock.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        unlockId: string;
        state: DataState;
    }

    export type DataState = 'UNLOCKED' | 'REVOKED' | 'REINSTATED';
}

export namespace MiniGameResultRecordedMessage {
    export interface MiniGameResultRecordedEnvelope {
        messageId: string;
        type: 'mini-game.result.recorded.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        receiptId: string;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'ACCEPTED' | 'REJECTED';
}

export namespace MiniGameRewardGrantChangedMessage {
    export interface MiniGameRewardGrantChangedEnvelope {
        messageId: string;
        type: 'mini-game.reward-grant.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        grantId: string;
        kind: DataKind;
        state: DataState;
    }

    export type DataKind = 'PRACTICE_MARK' | 'COSMETIC' | 'GLOBAL_XP';

    export type DataState = 'PENDING' | 'GRANTED' | 'CAPPED' | 'REJECTED' | 'REVERSED' | 'REINSTATED';
}

export namespace NotificationCreatedMessage {
    export interface NotificationCreatedEnvelope {
        messageId: string;
        type: 'notification.created.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        notificationId: string;
        notificationType: string;
        category: AllOf_1DataCategory;
        route: string;
        createdAt: string;
    }

    export type AllOf_1DataCategory = 'ROSTER' | 'REQUESTS' | 'MATCH_CRITICAL' | 'REMINDERS' | 'RESULTS' | 'CHAT';
}

export namespace NotificationDeliveryRequestedMessage {
    export interface NotificationDeliveryRequestedEnvelope {
        messageId: string;
        type: 'notification.delivery.requested.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        deliveryId: string;
    }
}

export namespace NotificationFanoutRequestedMessage {
    export interface NotificationFanoutRequestedEnvelope {
        messageId: string;
        type: 'communication.notification.fanout.requested.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        stream?: string;
        sequence?: number;
        data: MessageEnvelopeData;
    }

    export interface MessageEnvelopeData {
        sourceEventId: string;
        sourceType: string;
        notificationType: string;
        category: AllOf_1DataCategory;
        aggregateId: string;
    }

    export type AllOf_1DataCategory = 'ROSTER' | 'REQUESTS' | 'MATCH_CRITICAL' | 'REMINDERS' | 'RESULTS' | 'CHAT';
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

export namespace ProfileChangedMessage {
    export interface ProfileChangedEnvelope {
        messageId: string;
        type: 'profile.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        profileId: string;
        profileVersion: number;
        change: DataChange;
    }

    export type DataChange = 'FIELDS' | 'VISIBILITY' | 'DUPR_LINK' | 'AVATAR' | 'DELETION';
}

export namespace ProfileStatisticsRebuildCompletedMessage {
    export interface ProfileStatisticsRebuildCompletedEnvelope {
        messageId: string;
        type: 'profile.statistics.rebuild.completed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        generationId: string;
        snapshotRevision: number;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'ACTIVATED' | 'FAILED';
}

export namespace ProfileStatisticsRebuildRequestedMessage {
    export interface ProfileStatisticsRebuildRequestedEnvelope {
        messageId: string;
        type: 'profile.statistics.rebuild.requested.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        generationId: string;
        snapshotRevision: number;
        reason: DataReason;
    }

    export type DataReason = 'MANUAL' | 'RECONCILIATION' | 'SCHEMA_CHANGE' | 'ACCOUNT_DELETION';
}

export namespace ProfileStatisticsSourceChangedMessage {
    export interface ProfileStatisticsSourceChangedEnvelope {
        messageId: string;
        type: 'profile.statistics.source.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        sourceId: string;
        sourceRevision: number;
        sourceKind: DataSourceKind;
    }

    export type DataSourceKind = 'MATCH_RESULT' | 'MATCH_CANCELLATION' | 'TRUST_DECISION';
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

export namespace ReviewEligibilityChangedMessage {
    export interface ReviewEligibilityChangedEnvelope {
        messageId: string;
        type: 'review.eligibility.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        reviewId: string;
        reviewRevision: number;
    }
}

export namespace SafetyCaseStatusChangedMessage {
    export interface SafetyCaseStatusChangedEnvelope {
        messageId: string;
        type: 'safety.case.status.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        caseId: string;
        category: DataCategory;
    }

    export type DataCategory = 'NO_SHOW' | 'SAFETY' | 'CONTENT' | 'VENUE' | 'RESULT';
}

export namespace SafetyDecisionRecordedMessage {
    export interface SafetyDecisionRecordedEnvelope {
        messageId: string;
        type: 'safety.decision.recorded.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        decisionId: string;
        category: DataCategory;
    }

    export type DataCategory = 'NO_SHOW' | 'SAFETY' | 'CONTENT' | 'VENUE' | 'RESULT';
}

export namespace SafetyEffectRequestedMessage {
    export interface SafetyEffectRequestedEnvelope {
        messageId: string;
        type: 'safety.effect.requested.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        effectId: string;
        category: DataCategory;
    }

    export type DataCategory = 'NO_SHOW' | 'SAFETY' | 'CONTENT' | 'VENUE' | 'RESULT';
}

export namespace SafetySignalReceivedMessage {
    export interface SafetySignalReceivedEnvelope {
        messageId: string;
        type: 'safety.signal.received.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        signalId: string;
        category: DataCategory;
    }

    export type DataCategory = 'NO_SHOW' | 'SAFETY' | 'CONTENT' | 'VENUE' | 'RESULT';
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

export namespace TournamentCreatedMessage {
    export interface TournamentCreatedEnvelope {
        messageId: string;
        type: 'tournament.created.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        tournamentId: string;
        aggregateVersion: number;
        formatCode: DataFormatCode;
    }

    export type DataFormatCode =
        | 'AMERICANO'
        | 'ROUND_ROBIN'
        | 'SINGLE_ELIMINATION'
        | 'DOUBLE_ELIMINATION'
        | 'POOL_PLAY'
        | 'SWISS'
        | 'LADDER'
        | 'KING_OF_COURT';
}

export namespace TournamentEntrantChangedMessage {
    export interface TournamentEntrantChangedEnvelope {
        messageId: string;
        type: 'tournament.entrant.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        tournamentId: string;
        aggregateVersion: number;
        entrantId: string;
        entrantRevision: number;
        state: DataState;
    }

    export type DataState = 'ELIGIBLE' | 'WAITLISTED' | 'WITHDRAWN' | 'REPLACED' | 'NO_SHOW';
}

export namespace TournamentPlanChangedMessage {
    export interface TournamentPlanChangedEnvelope {
        messageId: string;
        type: 'tournament.plan.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        tournamentId: string;
        aggregateVersion: number;
        projectionRevision: number;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'SEEDED' | 'ROUND_GENERATED' | 'REBUILT' | 'COMPLETED' | 'PAUSED_MISMATCH';
}

export namespace TournamentResultChangedMessage {
    export interface TournamentResultChangedEnvelope {
        messageId: string;
        type: 'tournament.result.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        tournamentId: string;
        aggregateVersion: number;
        tournamentMatchId: string;
        resultRevision: number;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'PLAYED' | 'BYE' | 'WALKOVER' | 'DOUBLE_WALKOVER' | 'RESULT_STANDS';
}

export namespace TournamentStateChangedMessage {
    export interface TournamentStateChangedEnvelope {
        messageId: string;
        type: 'tournament.state.changed.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        tournamentId: string;
        aggregateVersion: number;
        state: DataState;
    }

    export type DataState = 'PUBLISHED' | 'CHECK_IN' | 'SEEDED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
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

export namespace XpLedgerEntryRecordedMessage {
    export interface XpLedgerEntryRecordedEnvelope {
        messageId: string;
        type: 'gamification.xp-ledger-entry.recorded.v1';
        occurredAt: string;
        correlationId: string;
        causationId?: string | null;
        data: Data;
    }

    export interface Data {
        ledgerEntryId: string;
        projectionRevision: number;
        outcome: DataOutcome;
    }

    export type DataOutcome = 'PENDING' | 'POSTED' | 'CAPPED' | 'REVERSED' | 'REINSTATED';
}

export type AccountDeletionRequestedEnvelope = AccountDeletionRequestedMessage.AccountDeletionRequestedEnvelope;
export type AchievementAwardChangedEnvelope = AchievementAwardChangedMessage.AchievementAwardChangedEnvelope;
export type AdvertisingClickValidatedEnvelope = AdvertisingClickValidatedMessage.AdvertisingClickValidatedEnvelope;
export type AdvertisingDeliveryIssuedEnvelope = AdvertisingDeliveryIssuedMessage.AdvertisingDeliveryIssuedEnvelope;
export type AdvertisingImpressionViewableEnvelope =
    AdvertisingImpressionViewableMessage.AdvertisingImpressionViewableEnvelope;
export type AuthenticateEnvelope = AuthenticateMessage.AuthenticateEnvelope;
export type AuthenticatedEnvelope = AuthenticatedMessage.AuthenticatedEnvelope;
export type ChatMessageCreateCommandEnvelope = ChatMessageCreateCommandMessage.ChatMessageCreateCommandEnvelope;
export type ChatMessageEventEnvelope = ChatMessageCreatedMessage.ChatMessageEventEnvelope;
export type ChatMessageDeleteCommandEnvelope = ChatMessageDeleteCommandMessage.ChatMessageDeleteCommandEnvelope;
export type ChatMessageDeletedEnvelope = ChatMessageDeletedMessage.ChatMessageDeletedEnvelope;
export type ChatMessageUpdateCommandEnvelope = ChatMessageUpdateCommandMessage.ChatMessageUpdateCommandEnvelope;
export type ChatMessageUpdatedEnvelope = ChatMessageUpdatedMessage.ChatMessageUpdatedEnvelope;
export type ChatStreamChangedEnvelope = ChatStreamChangedMessage.ChatStreamChangedEnvelope;
export type ChatSubscribeEnvelope = ChatSubscribeMessage.ChatSubscribeEnvelope;
export type ChatSubscribedEnvelope = ChatSubscribedMessage.ChatSubscribedEnvelope;
export type ChatSystemEventEnvelope = ChatSystemEventMessage.ChatSystemEventEnvelope;
export type ClubCreatedEnvelope = ClubCreatedMessage.ClubCreatedEnvelope;
export type ClubMembershipChangedEnvelope = ClubMembershipChangedMessage.ClubMembershipChangedEnvelope;
export type ClubRecurringOccurrenceRecordedEnvelope =
    ClubRecurringOccurrenceRecordedMessage.ClubRecurringOccurrenceRecordedEnvelope;
export type ClubRecurringRuleChangedEnvelope = ClubRecurringRuleChangedMessage.ClubRecurringRuleChangedEnvelope;
export type ClubStateChangedEnvelope = ClubStateChangedMessage.ClubStateChangedEnvelope;
export type ClubVenueLinkChangedEnvelope = ClubVenueLinkChangedMessage.ClubVenueLinkChangedEnvelope;
export type CommunicationErrorEnvelope = CommunicationErrorMessage.CommunicationErrorEnvelope;
export type ConsentChangedEnvelope = ConsentChangedMessage.ConsentChangedEnvelope;
export type ContentArticlePublishedEnvelope = ContentArticlePublishedMessage.ContentArticlePublishedEnvelope;
export type ContentArticleUnpublishedEnvelope = ContentArticleUnpublishedMessage.ContentArticleUnpublishedEnvelope;
export type IdentityLinkedEnvelope = IdentityLinkedMessage.IdentityLinkedEnvelope;
export type IdentityUnlinkedEnvelope = IdentityUnlinkedMessage.IdentityUnlinkedEnvelope;
export type LeaderboardConsentChangedEnvelope = LeaderboardConsentChangedMessage.LeaderboardConsentChangedEnvelope;
export type LeaderboardProjectionChangedEnvelope =
    LeaderboardProjectionChangedMessage.LeaderboardProjectionChangedEnvelope;
export type MatchCancelledEnvelope = MatchCancelledMessage.MatchCancelledEnvelope;
export type MatchCompletedConfirmedEnvelope = MatchCompletedConfirmedMessage.MatchCompletedConfirmedEnvelope;
export type MatchCreatedEnvelope = MatchCreatedMessage.MatchCreatedEnvelope;
export type MatchJoinIntentRecordedEnvelope = MatchJoinIntentRecordedMessage.MatchJoinIntentRecordedEnvelope;
export type MatchPublishedEnvelope = MatchPublishedMessage.MatchPublishedEnvelope;
export type MatchResultDisputedEnvelope = MatchResultDisputedMessage.MatchResultDisputedEnvelope;
export type MatchResultProposedEnvelope = MatchResultProposedMessage.MatchResultProposedEnvelope;
export type MatchRosterChangedEnvelope = MatchRosterChangedMessage.MatchRosterChangedEnvelope;
export type MatchStartedEnvelope = MatchStartedMessage.MatchStartedEnvelope;
export type MiniGameCosmeticUnlockChangedEnvelope =
    MiniGameCosmeticUnlockChangedMessage.MiniGameCosmeticUnlockChangedEnvelope;
export type MiniGameResultRecordedEnvelope = MiniGameResultRecordedMessage.MiniGameResultRecordedEnvelope;
export type MiniGameRewardGrantChangedEnvelope = MiniGameRewardGrantChangedMessage.MiniGameRewardGrantChangedEnvelope;
export type NotificationCreatedEnvelope = NotificationCreatedMessage.NotificationCreatedEnvelope;
export type NotificationDeliveryRequestedEnvelope =
    NotificationDeliveryRequestedMessage.NotificationDeliveryRequestedEnvelope;
export type NotificationFanoutRequestedEnvelope =
    NotificationFanoutRequestedMessage.NotificationFanoutRequestedEnvelope;
export type OnboardingCompletedEnvelope = OnboardingCompletedMessage.OnboardingCompletedEnvelope;
export type PingEnvelope = PingMessage.PingEnvelope;
export type PongEnvelope = PongMessage.PongEnvelope;
export type ProfileChangedEnvelope = ProfileChangedMessage.ProfileChangedEnvelope;
export type ProfileStatisticsRebuildCompletedEnvelope =
    ProfileStatisticsRebuildCompletedMessage.ProfileStatisticsRebuildCompletedEnvelope;
export type ProfileStatisticsRebuildRequestedEnvelope =
    ProfileStatisticsRebuildRequestedMessage.ProfileStatisticsRebuildRequestedEnvelope;
export type ProfileStatisticsSourceChangedEnvelope =
    ProfileStatisticsSourceChangedMessage.ProfileStatisticsSourceChangedEnvelope;
export type ProtocolErrorEnvelope = ProtocolErrorMessage.ProtocolErrorEnvelope;
export type ReviewEligibilityChangedEnvelope = ReviewEligibilityChangedMessage.ReviewEligibilityChangedEnvelope;
export type SafetyCaseStatusChangedEnvelope = SafetyCaseStatusChangedMessage.SafetyCaseStatusChangedEnvelope;
export type SafetyDecisionRecordedEnvelope = SafetyDecisionRecordedMessage.SafetyDecisionRecordedEnvelope;
export type SafetyEffectRequestedEnvelope = SafetyEffectRequestedMessage.SafetyEffectRequestedEnvelope;
export type SafetySignalReceivedEnvelope = SafetySignalReceivedMessage.SafetySignalReceivedEnvelope;
export type SessionsRevokedEnvelope = SessionsRevokedMessage.SessionsRevokedEnvelope;
export type TournamentCreatedEnvelope = TournamentCreatedMessage.TournamentCreatedEnvelope;
export type TournamentEntrantChangedEnvelope = TournamentEntrantChangedMessage.TournamentEntrantChangedEnvelope;
export type TournamentPlanChangedEnvelope = TournamentPlanChangedMessage.TournamentPlanChangedEnvelope;
export type TournamentResultChangedEnvelope = TournamentResultChangedMessage.TournamentResultChangedEnvelope;
export type TournamentStateChangedEnvelope = TournamentStateChangedMessage.TournamentStateChangedEnvelope;
export type VenueCandidateCreatedEnvelope = VenueCandidateCreatedMessage.VenueCandidateCreatedEnvelope;
export type VenueMergedEnvelope = VenueMergedMessage.VenueMergedEnvelope;
export type VenueVerifiedEnvelope = VenueVerifiedMessage.VenueVerifiedEnvelope;
export type XpLedgerEntryRecordedEnvelope = XpLedgerEntryRecordedMessage.XpLedgerEntryRecordedEnvelope;
export type WebSocketMessage =
    | AchievementAwardChangedEnvelope
    | AdvertisingClickValidatedEnvelope
    | AdvertisingDeliveryIssuedEnvelope
    | AdvertisingImpressionViewableEnvelope
    | AuthenticateEnvelope
    | AuthenticatedEnvelope
    | ChatMessageCreateCommandEnvelope
    | ChatMessageDeleteCommandEnvelope
    | ChatMessageDeletedEnvelope
    | ChatMessageEventEnvelope
    | ChatMessageUpdateCommandEnvelope
    | ChatMessageUpdatedEnvelope
    | ChatStreamChangedEnvelope
    | ChatSubscribeEnvelope
    | ChatSubscribedEnvelope
    | ChatSystemEventEnvelope
    | ClubCreatedEnvelope
    | ClubMembershipChangedEnvelope
    | ClubRecurringOccurrenceRecordedEnvelope
    | ClubRecurringRuleChangedEnvelope
    | ClubStateChangedEnvelope
    | ClubVenueLinkChangedEnvelope
    | CommunicationErrorEnvelope
    | ContentArticlePublishedEnvelope
    | ContentArticleUnpublishedEnvelope
    | LeaderboardConsentChangedEnvelope
    | LeaderboardProjectionChangedEnvelope
    | MatchCancelledEnvelope
    | MatchCompletedConfirmedEnvelope
    | MatchCreatedEnvelope
    | MatchJoinIntentRecordedEnvelope
    | MatchPublishedEnvelope
    | MatchResultDisputedEnvelope
    | MatchResultProposedEnvelope
    | MatchRosterChangedEnvelope
    | MatchStartedEnvelope
    | MiniGameCosmeticUnlockChangedEnvelope
    | MiniGameResultRecordedEnvelope
    | MiniGameRewardGrantChangedEnvelope
    | NotificationCreatedEnvelope
    | NotificationDeliveryRequestedEnvelope
    | NotificationFanoutRequestedEnvelope
    | PingEnvelope
    | PongEnvelope
    | ProfileChangedEnvelope
    | ProfileStatisticsRebuildCompletedEnvelope
    | ProfileStatisticsRebuildRequestedEnvelope
    | ProfileStatisticsSourceChangedEnvelope
    | ProtocolErrorEnvelope
    | ReviewEligibilityChangedEnvelope
    | SafetyCaseStatusChangedEnvelope
    | SafetyDecisionRecordedEnvelope
    | SafetyEffectRequestedEnvelope
    | SafetySignalReceivedEnvelope
    | TournamentCreatedEnvelope
    | TournamentEntrantChangedEnvelope
    | TournamentPlanChangedEnvelope
    | TournamentResultChangedEnvelope
    | TournamentStateChangedEnvelope
    | VenueCandidateCreatedEnvelope
    | VenueMergedEnvelope
    | VenueVerifiedEnvelope
    | XpLedgerEntryRecordedEnvelope;
export type IdentityDomainEvent =
    | AccountDeletionRequestedEnvelope
    | ConsentChangedEnvelope
    | IdentityLinkedEnvelope
    | IdentityUnlinkedEnvelope
    | OnboardingCompletedEnvelope
    | SessionsRevokedEnvelope;
