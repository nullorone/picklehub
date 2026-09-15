using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum MatchFormat {
    SINGLES,
    DOUBLES,
}

enum MatchVisibility {
    PUBLIC,
    UNLISTED,
}

enum MatchJoinMode {
    AUTO,
    APPROVAL,
}

enum MatchState {
    DRAFT,
    PUBLISHED,
    IN_PROGRESS,
    AWAITING_CONFIRMATION,
    DISPUTED,
    CANCELLED,
    COMPLETED,
    VOIDED,
}

enum MatchTeamCode {
    TEAM_A,
    TEAM_B,
}

enum MatchTeamChoice {
    TEAM_A,
    TEAM_B,
    ANY,
}

enum MatchParticipantState {
    ACTIVE,
    LEFT,
    CANCELLED,
    PLAYED,
}

enum JoinRequestState {
    PENDING,
    APPROVED,
    REJECTED,
    WITHDRAWN,
    EXPIRED,
}

enum WaitlistEntryState {
    WAITING,
    OFFERED,
    PROMOTED,
    WITHDRAWN,
    SKIPPED,
    EXPIRED,
}

enum MatchResultState {
    PROPOSED,
    SUPERSEDED,
    CONFIRMED,
    DISPUTED,
    VOIDED,
}

enum MatchResultMode {
    SCORED,
    PLAYED_WITHOUT_SCORE,
}

enum MatchSeriesFormat {
    BEST_OF_1,
    BEST_OF_3,
    BEST_OF_5,
}

enum ResultConfirmationDecision {
    CONFIRMED,
    DISPUTED,
}

enum ExternalBookingState {
    UNKNOWN,
    NOT_BOOKED,
    BOOKED_EXTERNALLY,
}

enum MatchRecommendationReason {
    NEARBY,
    TIME_MATCH,
    PREFERRED_FORMAT,
    LEVEL_FIT,
    DISTANCE_UNKNOWN,
    TIME_FLEXIBLE,
}

@minValue(1.0)
@maxValue(5.0)
@doc("Self-assessed level. The server additionally requires increments of 0.5.")
scalar MatchSkillLevel extends float64;

@minLength(22)
@maxLength(256)
@pattern("^[A-Za-z0-9_-]+$")
@doc("At least 128 bits of unguessable base64url capability. Never log, persist raw, or send to analytics/events.")
scalar MatchInviteToken extends string;

model MatchTeam {
    code: MatchTeamCode;

    @minValue(1)
    @maxValue(2)
    capacity: int32;

    @minValue(0)
    @maxValue(2)
    occupiedPlaces: int32;

    @minValue(0)
    @maxValue(2)
    reservedPlaces: int32;
}

model MatchParticipant {
    id: Uuid;
    team: MatchTeamCode;
    state: MatchParticipantState;
    isOrganizer: boolean;
    userId: Uuid;
    joinedAt: Timestamp;
}

model MatchGuestSlot {
    id: Uuid;
    team: MatchTeamCode;

    @minLength(1)
    @maxLength(50)
    label: string;
}

model JoinRequest {
    id: Uuid;
    matchId: Uuid;
    requesterId: Uuid;
    teamChoice: MatchTeamChoice;
    state: JoinRequestState;
    createdAt: Timestamp;
    decidedAt: Timestamp | null;
}

model WaitlistEntry {
    id: Uuid;
    matchId: Uuid;
    playerId: Uuid;
    teamChoice: MatchTeamChoice;
    state: WaitlistEntryState;

    @minValue(1)
    position: int64;

    offeredTeam: MatchTeamCode | null;
    offerExpiresAt: Timestamp | null;
    createdAt: Timestamp;
    resolvedAt: Timestamp | null;
}

model GameScore {
    @minValue(1)
    @maxValue(5)
    gameNumber: int32;

    @minValue(0)
    @maxValue(99)
    teamAPoints: int32;

    @minValue(0)
    @maxValue(99)
    teamBPoints: int32;
}

model ResultConfirmation {
    id: Uuid;
    resultId: Uuid;
    resultVersion: int32;
    playerId: Uuid;
    decision: ResultConfirmationDecision;
    createdAt: Timestamp;
}

model MatchResult {
    id: Uuid;
    matchId: Uuid;

    @minValue(1)
    version: int32;

    state: MatchResultState;
    mode: MatchResultMode;
    seriesFormat: MatchSeriesFormat | null;
    winningTeam: MatchTeamCode | null;

    @maxItems(5)
    games: GameScore[];

    confirmations: ResultConfirmation[];
    proposedAt: Timestamp;
    resolvedAt: Timestamp | null;
}

model MatchVenueReference {
    venueId: Uuid | null;
    venueCandidateId: Uuid | null;
}

model Match {
    id: Uuid;
    organizerId: Uuid;
    clubSource?: ClubMatchSource | null;

    @minValue(0)
    version: int32;

    state: MatchState;
    format: MatchFormat | null;
    visibility: MatchVisibility | null;
    joinMode: MatchJoinMode | null;
    startsAt: Timestamp | null;

    @minLength(1)
    @maxLength(64)
    timeZone: string | null;

    venue: MatchVenueReference;
    skillMin: MatchSkillLevel | null;
    skillMax: MatchSkillLevel | null;

    @minLength(1)
    @maxLength(1000)
    description: string | null;

    bookingState: ExternalBookingState;

    @maxLength(280)
    bookingNote: string | null;

    @minLength(1)
    @maxLength(64)
    policyVersion: string | null;

    teams: MatchTeam[];
    participants: MatchParticipant[];
    guests: MatchGuestSlot[];
    currentResult: MatchResult | null;
    createdAt: Timestamp;
    publishedAt: Timestamp | null;
    updatedAt: Timestamp;
}

model MatchSummary {
    id: Uuid;
    state: "PUBLISHED";
    format: MatchFormat;
    startsAt: Timestamp;
    timeZone: string;
    skillMin: MatchSkillLevel;
    skillMax: MatchSkillLevel;
    teams: MatchTeam[];

    @minValue(0)
    @maxValue(100)
    recommendationScore?: int32;

    @minItems(2)
    @maxItems(2)
    recommendationReasons?: MatchRecommendationReason[];
}

model MatchPage {
    items: MatchSummary[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
    recommendationPolicyVersion?: string;
}

model ExpectedMatchVersion {
    @minValue(0)
    expectedVersion: int32;
}

model DraftMatchInput {
    format?: MatchFormat | null;
    visibility?: MatchVisibility | null;
    joinMode?: MatchJoinMode | null;
    startsAt?: Timestamp | null;

    @minLength(1)
    @maxLength(64)
    timeZone?: string | null;

    venueId?: Uuid | null;
    venueCandidateId?: Uuid | null;
    skillMin?: MatchSkillLevel | null;
    skillMax?: MatchSkillLevel | null;

    @minLength(1)
    @maxLength(1000)
    description?: string | null;

    bookingState?: ExternalBookingState;

    @maxLength(280)
    bookingNote?: string | null;

    @maxItems(3)
    guests?: MatchGuestInput[];
}

model MatchGuestInput {
    team: MatchTeamCode;

    @minLength(1)
    @maxLength(50)
    label: string;
}

model UpdateMatchDraft {
    ...ExpectedMatchVersion;
    ...DraftMatchInput;
}

model PublishMatch {
    ...ExpectedMatchVersion;
}

model MatchJoinCommand {
    ...ExpectedMatchVersion;
    teamChoice: MatchTeamChoice;
}

model MatchDecisionCommand {
    ...ExpectedMatchVersion;
}

model ProposeMatchResult {
    ...ExpectedMatchVersion;
    mode: MatchResultMode;
    seriesFormat?: MatchSeriesFormat;
    winningTeam?: MatchTeamCode;

    @maxItems(5)
    games?: GameScore[];
}

model ResolveMatchResult {
    ...ExpectedMatchVersion;

    @minValue(1)
    resultVersion: int32;
}

model MatchJoinOutcome {
    match: Match;
    participant: MatchParticipant | null;
    joinRequest: JoinRequest | null;
    waitlistEntry: WaitlistEntry | null;
}

model MatchInvite {
    matchId: Uuid;
    token: MatchInviteToken;
    createdAt: Timestamp;
}

model MatchResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}

model MatchOk<T> {
    @statusCode statusCode: 200;
    ...MatchResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model MatchCreated<T> {
    @statusCode statusCode: 201;
    ...MatchResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model MatchNoContent {
    @statusCode statusCode: 204;
    ...MatchResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
}

model MatchError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model MatchFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...MatchResponseHeaders;
    @body body: MatchError<Code>;
}

@error
model MatchRateLimited {
    @statusCode statusCode: 429;
    ...MatchResponseHeaders;
    ...RetryAfterHeader;
    @body body: MatchError<"RATE_LIMITED">;
}

alias MatchReadErrors =
    | MatchFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR">
    | MatchFailure<404, "MATCH_NOT_FOUND" | "INVITE_INVALID">
    | MatchRateLimited;
alias MatchMutationErrors =
    | MatchFailure<400, "VALIDATION_FAILED">
    | MatchFailure<401, "SESSION_INVALID">
    | MatchFailure<403, "ONBOARDING_REQUIRED" | "REQUEST_NOT_ALLOWED" | "RESULT_CONFIRMATION_FORBIDDEN">
    | MatchFailure<404, "MATCH_NOT_FOUND">
    | MatchFailure<
          409,
          | "MATCH_VERSION_CONFLICT"
          | "MATCH_NOT_JOINABLE"
          | "MATCH_CAPACITY_REACHED"
          | "LEVEL_NOT_ELIGIBLE"
          | "TEAM_NOT_AVAILABLE"
          | "ALREADY_INVOLVED"
          | "JOIN_REQUEST_NOT_PENDING"
          | "WAITLIST_ORDER_CONFLICT"
          | "OFFER_EXPIRED"
          | "MATCH_TRANSITION_NOT_ALLOWED"
          | "RESULT_VERSION_CONFLICT"
          | "IDEMPOTENCY_KEY_REUSED"
      >
    | MatchRateLimited;

model MatchSearchFilters {
    @query format?: MatchFormat;
    @query startsFrom?: Timestamp;
    @query startsTo?: Timestamp;
    @query skillLevel?: MatchSkillLevel;
    @query longitude?: Longitude;
    @query latitude?: Latitude;

    @query
    @minValue(1)
    @maxValue(50000)
    radiusMeters?: int32;
}

@tag("Matches")
@route("/matches")
@useAuth(NoAuth)
interface Matches {
    @get
    @operationId("searchMatches")
    @summary("Search published public matches")
    @doc("Returns only PUBLIC, PUBLISHED future matches inside the 90-day policy horizon. UNLISTED matches are excluded at the storage query boundary. Location requires longitude, latitude and radius together; exact origin is request-only. Sort is startsAt ASC then match ID ASC. Cursor is filter/snapshot-bound.")
    search(...RequestHeaders, ...MatchSearchFilters, ...PaginationParameters): MatchOk<MatchPage> | MatchReadErrors;

    @get
    @route("/recommendations")
    @useAuth(BearerAuth)
    @operationId("recommendMatches")
    @summary("Rank eligible public matches with rule-based explanations")
    @doc("Applies the same public hard filters, then policy-versioned distance 35%, time 30%, preferred format 20%, level 15%. Score is 0-100; exactly two safe enum reasons explain it. Stable sort is score DESC, startsAt ASC, match ID ASC.")
    recommendations(...RequestHeaders, ...MatchSearchFilters, ...PaginationParameters):
        | MatchOk<MatchPage>
        | MatchFailure<401, "SESSION_INVALID">
        | MatchFailure<403, "ONBOARDING_REQUIRED" | "REQUEST_NOT_ALLOWED">
        | MatchReadErrors;

    @post
    @useAuth(BearerAuth)
    @operationId("createMatchDraft")
    @summary("Create a private match draft")
    @doc("Creates the organizer as the sole ACTIVE TEAM_A participant. Draft fields may be incomplete. It never appears in discovery and does not create an invite until publication.")
    create(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: DraftMatchInput):
        | MatchCreated<Match>
        | MatchMutationErrors;

    @get
    @route("/{matchId}")
    @operationId("getMatch")
    @summary("Read a public match or an authorized private projection")
    @doc("Anonymous callers receive only PUBLIC PUBLISHED data. Organizer/participants may receive their authorized projection. UNLISTED access is deliberately served only by the invite resource.")
    detail(@path matchId: Uuid, ...RequestHeaders): MatchOk<Match> | MatchReadErrors;

    @patch
    @route("/{matchId}")
    @useAuth(BearerAuth)
    @operationId("updateMatchDraft")
    @summary("Update an owned draft")
    @doc("Replaces supplied draft fields only when expectedVersion matches. Published rules and terminal matches cannot be edited.")
    update(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: UpdateMatchDraft,
    ): MatchOk<Match> | MatchMutationErrors;

    @delete
    @route("/{matchId}")
    @useAuth(BearerAuth)
    @operationId("deleteMatchDraft")
    @summary("Delete an unpublished owned draft")
    @doc("Deletes only an owned DRAFT and its private children. Published and terminal history is retained and must use cancel instead.")
    delete(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @query expectedVersion: int32,
    ): MatchNoContent | MatchMutationErrors;

    @post
    @route("/{matchId}/publish")
    @useAuth(BearerAuth)
    @operationId("publishMatch")
    @summary("Publish a valid draft")
    @doc("Atomically validates policy, teams, venue, time, skill and organizer participation. UNLISTED publication returns the only raw capability delivery; storage keeps a keyed hash.")
    publish(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: PublishMatch,
    ): MatchOk<Match | MatchInvite> | MatchMutationErrors;

    @post
    @route("/{matchId}/invite/rotate")
    @useAuth(BearerAuth)
    @operationId("rotateMatchInvite")
    @summary("Rotate an unlisted match capability")
    @doc("Atomically revokes the old capability and returns one new raw token to the organizer. Raw token values never enter logs, audit, outbox or analytics.")
    rotateInvite(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: ExpectedMatchVersion,
    ): MatchOk<MatchInvite> | MatchMutationErrors;

    @post
    @route("/{matchId}/join")
    @useAuth(BearerAuth)
    @operationId("joinMatch")
    @summary("Join automatically, request approval, or enter FIFO waitlist")
    @doc("Serializes on the match aggregate, rechecks eligibility and produces exactly one active involvement. Concurrent claims of the last place cannot exceed team capacity.")
    join(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchJoinCommand,
    ): MatchOk<MatchJoinOutcome> | MatchMutationErrors;

    @get
    @route("/{matchId}/join-requests")
    @useAuth(BearerAuth)
    @operationId("listMatchJoinRequests")
    @summary("List join requests visible to the organizer")
    @doc("Organizer-only cursor page. Rejected/withdrawn actors and request data are not exposed to unrelated callers.")
    requests(@path matchId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | MatchOk<{
              items: JoinRequest[];
              pageInfo: PageInfo;
          }>
        | MatchMutationErrors;

    @post
    @route("/{matchId}/join-requests/{joinRequestId}/approve")
    @useAuth(BearerAuth)
    @operationId("approveMatchJoinRequest")
    @summary("Approve a pending request into roster or waitlist")
    @doc("Consumes one PENDING request and atomically creates at most one participant or FIFO entry after capacity and eligibility are rechecked.")
    approveRequest(
        @path matchId: Uuid,
        @path joinRequestId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchDecisionCommand,
    ): MatchOk<MatchJoinOutcome> | MatchMutationErrors;

    @post
    @route("/{matchId}/join-requests/{joinRequestId}/reject")
    @useAuth(BearerAuth)
    @operationId("rejectMatchJoinRequest")
    @summary("Reject a pending request")
    @doc("Applies one terminal REJECTED transition. A concurrent approval, withdrawal or replay cannot revise that terminal outcome.")
    rejectRequest(
        @path matchId: Uuid,
        @path joinRequestId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchDecisionCommand,
    ): MatchOk<JoinRequest> | MatchMutationErrors;

    @post
    @route("/{matchId}/join-requests/{joinRequestId}/withdraw")
    @useAuth(BearerAuth)
    @operationId("withdrawMatchJoinRequest")
    @summary("Withdraw an own pending request")
    @doc("Self-only terminal withdrawal. A concurrent organizer decision has one winning outcome and never leaves duplicate involvement.")
    withdrawRequest(
        @path matchId: Uuid,
        @path joinRequestId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchDecisionCommand,
    ): MatchOk<JoinRequest> | MatchMutationErrors;

    @get
    @route("/{matchId}/waitlist")
    @useAuth(BearerAuth)
    @operationId("listMatchWaitlist")
    @summary("List the organizer view or caller's own safe waitlist entry")
    @doc("FIFO positions are restricted. The organizer sees the actionable queue; another player receives only their own entry and safe state.")
    waitlist(@path matchId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | MatchOk<{
              items: WaitlistEntry[];
              pageInfo: PageInfo;
          }>
        | MatchMutationErrors;

    @post
    @route("/{matchId}/waitlist/{entryId}/withdraw")
    @useAuth(BearerAuth)
    @operationId("withdrawMatchWaitlistEntry")
    @summary("Withdraw an own waiting or offered entry")
    @doc("Self-only withdrawal serialized with promotion and expiry. An offered vacancy is released once and the next eligible FIFO entry is considered.")
    withdrawWaitlist(
        @path matchId: Uuid,
        @path entryId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchDecisionCommand,
    ): MatchOk<WaitlistEntry> | MatchMutationErrors;

    @post
    @route("/{matchId}/waitlist/{entryId}/promote")
    @useAuth(BearerAuth)
    @operationId("promoteMatchWaitlistEntry")
    @summary("Accept the active approval-mode offer")
    @doc("Organizer accepts only the earliest active compatible offer before its deadline. Capacity and eligibility are rechecked in the same transaction.")
    promoteWaitlist(
        @path matchId: Uuid,
        @path entryId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchDecisionCommand,
    ): MatchOk<MatchJoinOutcome> | MatchMutationErrors;

    @post
    @route("/{matchId}/participants/{participantId}/leave")
    @useAuth(BearerAuth)
    @operationId("leaveMatch")
    @summary("Leave a match before it starts")
    @doc("A non-organizer ACTIVE participant leaves once before IN_PROGRESS. The vacancy and any FIFO promotion/offer are committed atomically.")
    leave(
        @path matchId: Uuid,
        @path participantId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchDecisionCommand,
    ): MatchOk<Match> | MatchMutationErrors;

    @post
    @route("/{matchId}/cancel")
    @useAuth(BearerAuth)
    @operationId("cancelMatch")
    @summary("Cancel a draft or published match")
    @doc("Organizer-only terminal transition before play. Active requests, entries, offers and participants close in the same aggregate transaction.")
    cancel(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchDecisionCommand,
    ): MatchOk<Match> | MatchMutationErrors;

    @post
    @route("/{matchId}/start")
    @useAuth(BearerAuth)
    @operationId("startMatch")
    @summary("Mark a published match in progress")
    @doc("Organizer-only transition within the policy window, requiring at least one registered player on each team. It serializes with leave and cancel.")
    start(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MatchDecisionCommand,
    ): MatchOk<Match> | MatchMutationErrors;

    @post
    @route("/{matchId}/results")
    @useAuth(BearerAuth)
    @operationId("proposeMatchResult")
    @summary("Propose or supersede a played result")
    @doc("SCORED requires a legal BEST_OF_1/3/5 series. Every completed game requires at least 11 points and a two-point margin; 11, 15 and 21-point regulation games and deuce scores are supported. PLAYED_WITHOUT_SCORE forbids series, winner and games.")
    proposeResult(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: ProposeMatchResult,
    ): MatchCreated<MatchResult> | MatchMutationErrors;

    @post
    @route("/{matchId}/results/{resultId}/confirm")
    @useAuth(BearerAuth)
    @operationId("confirmMatchResult")
    @summary("Confirm a specific result version as an eligible opponent")
    @doc("An ACTIVE registered opposite-team player confirms the current version. Match, result, participants, unique metric marker, audit and outbox change atomically.")
    confirmResult(
        @path matchId: Uuid,
        @path resultId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: ResolveMatchResult,
    ): MatchOk<MatchResult> | MatchMutationErrors;

    @post
    @route("/{matchId}/results/{resultId}/dispute")
    @useAuth(BearerAuth)
    @operationId("disputeMatchResult")
    @summary("Dispute a specific result version as an eligible opponent")
    @doc("An ACTIVE registered opposite-team player disputes the current version. No metric marker or statistics effect is created before moderator resolution.")
    disputeResult(
        @path matchId: Uuid,
        @path resultId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: ResolveMatchResult,
    ): MatchOk<MatchResult> | MatchMutationErrors;
}

@tag("Matches")
@route("/match-invites")
@useAuth(NoAuth)
interface MatchInvites {
    @get
    @route("/{inviteToken}")
    @operationId("getMatchByInvite")
    @summary("Read one unlisted match through its capability")
    @doc("The raw token is compared to a keyed hash and never persisted. Missing, revoked, expired, foreign and malformed capabilities all return INVITE_INVALID. This read grants no mutation rights. Responses are no-store and clients must use Referrer-Policy no-referrer and no third-party resources.")
    detail(@path inviteToken: MatchInviteToken, ...RequestHeaders): MatchOk<Match> | MatchReadErrors;
}
