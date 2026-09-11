using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum ClubState {
    ACTIVE,
    ARCHIVED,
}

enum ClubMembershipPolicy {
    OPEN,
    APPROVAL,
    INVITE_ONLY,
}

enum ClubRole {
    OWNER,
    ADMIN,
    MEMBER,
}

enum ClubMembershipState {
    ACTIVE,
    LEFT,
    EXCLUDED,
    SUPERSEDED,
}

enum ClubJoinRequestState {
    PENDING,
    APPROVED,
    REJECTED,
    CANCELLED,
    SUPERSEDED,
}

enum ClubInvitationState {
    PENDING,
    ACCEPTED,
    DECLINED,
    REVOKED,
    EXPIRED,
    SUPERSEDED,
}

enum RecurringMatchRuleState {
    ACTIVE,
    PAUSED,
    ENDED,
}

enum RecurringMatchFrequency {
    WEEKLY,
}

enum RecurringDstGapPolicy {
    SKIP,
}

enum RecurringDstOverlapPolicy {
    EARLIER_OFFSET,
    LATER_OFFSET,
}

enum RecurringOccurrenceState {
    MATERIALIZED,
    SKIPPED_DST_GAP,
    SKIPPED_PAUSE,
}

enum ClubMatchOrigin {
    CLUB,
    RECURRING_RULE,
}

@minLength(1)
@maxLength(120)
scalar ClubName extends string;

@minLength(1)
@maxLength(120)
scalar ClubLocality extends string;

@minLength(22)
@maxLength(256)
@pattern("^[A-Za-z0-9_-]+$")
@doc("Addressed invitation capability with at least 128 random bits. Raw values are never stored, logged, audited or emitted as events.")
scalar ClubInvitationToken extends string;

@pattern("^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
@doc("Wall-clock time in the rule's IANA timezone, without an implicit UTC offset.")
scalar LocalWallTime extends string;

@format("date")
scalar LocalDate extends string;

@pattern("^\\d{4}-\\d{2}-\\d{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
@doc("Stable local calendar position without an offset; interpreted only with the rule timezone and DST policy.")
scalar RecurringCalendarKey extends string;

model ClubVenue {
    clubId: Uuid;
    venueId: Uuid;
    linkedAt: Timestamp;
}

model ClubMembership {
    id: Uuid;
    clubId: Uuid;
    userId: Uuid;
    role: ClubRole;
    state: ClubMembershipState;
    revision: int32;
    joinedAt: Timestamp;
    endedAt: Timestamp | null;
}

model ClubJoinRequest {
    id: Uuid;
    clubId: Uuid;
    requesterId: Uuid;
    state: ClubJoinRequestState;
    revision: int32;
    createdAt: Timestamp;
    resolvedAt: Timestamp | null;
}

model ClubInvitation {
    id: Uuid;
    clubId: Uuid;
    inviteeId: Uuid;
    state: ClubInvitationState;
    revision: int32;
    expiresAt: Timestamp;
    createdAt: Timestamp;
    resolvedAt: Timestamp | null;
}

model ClubInvitationDelivery {
    invitation: ClubInvitation;
    token: ClubInvitationToken;
}

model ClubSummary {
    id: Uuid;
    state: "ACTIVE";
    name: ClubName;
    locality: ClubLocality;
    membershipPolicy: ClubMembershipPolicy;
    memberCount: int32;
    venueIds: Uuid[];
}

model Club {
    id: Uuid;
    version: int32;
    state: ClubState;
    name: ClubName;

    @maxLength(1000)
    description: string;

    locality: ClubLocality;
    membershipPolicy: ClubMembershipPolicy;
    memberCount: int32;
    venues: ClubVenue[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

model ClubPage {
    items: ClubSummary[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}

model ClubMemberPage {
    items: ClubMembership[];
    pageInfo: PageInfo;
}

model ClubJoinRequestPage {
    items: ClubJoinRequest[];
    pageInfo: PageInfo;
}

model ClubInvitationPage {
    items: ClubInvitation[];
    pageInfo: PageInfo;
}

model ExpectedClubVersion {
    @minValue(0)
    expectedVersion: int32;
}

model ExpectedClubResourceRevision {
    @minValue(0)
    expectedClubVersion: int32;

    @minValue(0)
    expectedRevision: int32;
}

model ClubReasonedCommand {
    ...ExpectedClubVersion;

    @pattern("^[A-Z][A-Z0-9_]{1,95}$")
    reasonCode: string;
}

model ClubResourceReasonedCommand {
    ...ExpectedClubResourceRevision;

    @pattern("^[A-Z][A-Z0-9_]{1,95}$")
    reasonCode: string;
}

model CreateClubInput {
    name: ClubName;

    @maxLength(1000)
    description: string;

    locality: ClubLocality;
    membershipPolicy: ClubMembershipPolicy;
}

model UpdateClubInput {
    ...ExpectedClubVersion;
    name?: ClubName;

    @maxLength(1000)
    description?: string;

    locality?: ClubLocality;
    membershipPolicy?: ClubMembershipPolicy;
}

model ClubJoinOutcome {
    membership: ClubMembership | null;
    joinRequest: ClubJoinRequest | null;
}

model CreateClubInvitationInput {
    ...ExpectedClubVersion;
    inviteeId: Uuid;
}

model ChangeClubRoleInput {
    ...ClubResourceReasonedCommand;
    role: "ADMIN" | "MEMBER";
}

model TransferClubOwnershipInput {
    ...ExpectedClubVersion;
    targetMembershipId: Uuid;

    @pattern("^[A-Z][A-Z0-9_]{1,95}$")
    reasonCode: string;
}

model ClubVenueCommand {
    ...ExpectedClubVersion;
    venueId: Uuid;
}

model ClubMatchSource {
    clubId: Uuid;
    origin: ClubMatchOrigin;
    recurringRuleId: Uuid | null;
    recurringOccurrenceId: Uuid | null;
    calendarKey: RecurringCalendarKey | null;
}

model CreateClubMatchInput {
    ...ExpectedClubVersion;
    match: DraftMatchInput;
}

model RecurringMatchTemplate {
    format: MatchFormat;
    visibility: MatchVisibility;
    joinMode: MatchJoinMode;
    venueId: Uuid;
    skillMin: MatchSkillLevel;
    skillMax: MatchSkillLevel;

    @minLength(1)
    @maxLength(1000)
    description: string;

    bookingState: ExternalBookingState;

    @maxLength(280)
    bookingNote?: string | null;
}

model RecurringMatchRule {
    id: Uuid;
    clubId: Uuid;
    organizerId: Uuid;
    revision: int32;
    state: RecurringMatchRuleState;
    frequency: RecurringMatchFrequency;

    @minValue(1)
    @maxValue(12)
    intervalWeeks: int32;

    @minItems(1)
    @maxItems(7)
    @doc("ISO weekdays 1=Monday through 7=Sunday.")
    weekdays: int32[];

    localStartTime: LocalWallTime;

    @minLength(1)
    @maxLength(64)
    timeZone: string;

    @minLength(1)
    @maxLength(32)
    tzdataVersion: string;

    dstGapPolicy: RecurringDstGapPolicy;
    dstOverlapPolicy: RecurringDstOverlapPolicy;
    startsOn: LocalDate;
    endsOn: LocalDate | null;
    generatedThrough: LocalDate | null;

    @minValue(1)
    @maxValue(42)
    generationHorizonDays: int32;

    template: RecurringMatchTemplate;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

model CreateRecurringMatchRuleInput {
    ...ExpectedClubVersion;
    frequency: "WEEKLY";

    @minValue(1)
    @maxValue(12)
    intervalWeeks: int32;

    @minItems(1)
    @maxItems(7)
    weekdays: int32[];

    localStartTime: LocalWallTime;

    @minLength(1)
    @maxLength(64)
    timeZone: string;

    dstGapPolicy: "SKIP";
    dstOverlapPolicy: RecurringDstOverlapPolicy;
    startsOn: LocalDate;
    endsOn?: LocalDate | null;
    template: RecurringMatchTemplate;
}

model UpdateRecurringMatchRuleInput {
    ...ExpectedClubResourceRevision;
    intervalWeeks?: int32;
    weekdays?: int32[];
    localStartTime?: LocalWallTime;
    endsOn?: LocalDate | null;
    dstOverlapPolicy?: RecurringDstOverlapPolicy;
    template?: RecurringMatchTemplate;
}

model RecurringMatchOccurrence {
    id: Uuid;
    clubId: Uuid;
    ruleId: Uuid;
    calendarKey: RecurringCalendarKey;
    state: RecurringOccurrenceState;
    startsAt: Timestamp | null;
    utcOffsetMinutes: int32 | null;
    matchId: Uuid | null;
    materializedAt: Timestamp;
}

model RecurringMatchRulePage {
    items: RecurringMatchRule[];
    pageInfo: PageInfo;
}

model RecurringMatchOccurrencePage {
    items: RecurringMatchOccurrence[];
    pageInfo: PageInfo;
}

model ClubResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}

model ClubOk<T> {
    @statusCode statusCode: 200;
    ...ClubResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model ClubCreated<T> {
    @statusCode statusCode: 201;
    ...ClubResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model ClubNoContent {
    @statusCode statusCode: 204;
    ...ClubResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
}

model ClubError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model ClubFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...ClubResponseHeaders;
    @body body: ClubError<Code>;
}

@error
model ClubRateLimited {
    @statusCode statusCode: 429;
    ...ClubResponseHeaders;
    ...RetryAfterHeader;
    @body body: ClubError<"RATE_LIMITED">;
}

alias ClubReadErrors =
    | ClubFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR">
    | ClubFailure<404, "CLUB_NOT_FOUND" | "INVITATION_NOT_FOUND">
    | ClubRateLimited;
alias ClubMutationErrors =
    | ClubFailure<400, "VALIDATION_FAILED">
    | ClubFailure<401, "SESSION_INVALID">
    | ClubFailure<403, "ONBOARDING_REQUIRED" | "CLUB_ACTION_FORBIDDEN" | "CLUB_BLOCKED">
    | ClubFailure<404, "CLUB_NOT_FOUND" | "CLUB_RESOURCE_NOT_FOUND">
    | ClubFailure<
          409,
          | "CLUB_VERSION_CONFLICT"
          | "CLUB_RESOURCE_REVISION_CONFLICT"
          | "CLUB_ARCHIVED"
          | "CLUB_TRANSITION_NOT_ALLOWED"
          | "CLUB_OWNER_REQUIRED"
          | "CLUB_MEMBERSHIP_EXISTS"
          | "CLUB_INTENT_EXISTS"
          | "CLUB_INTENT_NOT_PENDING"
          | "CLUB_VENUE_UNAVAILABLE"
          | "RECURRING_CALENDAR_CONFLICT"
          | "IDEMPOTENCY_KEY_REUSED"
      >
    | ClubRateLimited;

model ClubSearchFilters {
    @query
    @minLength(1)
    @maxLength(120)
    query?: string;

    @query
    @minLength(1)
    @maxLength(120)
    locality?: string;

    @query venueId?: Uuid;
}

@tag("Clubs")
@route("/clubs")
@useAuth(NoAuth)
interface Clubs {
    @get
    @operationId("searchClubs")
    @summary("Search active clubs")
    @doc("Returns ACTIVE clubs by normalized name, locality or linked public canonical venue. Clubs with zero venues remain discoverable. Sort is normalized name ASC then club ID ASC; cursor is filter/snapshot-bound.")
    search(...RequestHeaders, ...ClubSearchFilters, ...PaginationParameters): ClubOk<ClubPage> | ClubReadErrors;

    @post
    @useAuth(BearerAuth)
    @operationId("createClub")
    @summary("Create a club with its owner")
    @doc("Atomically creates one ACTIVE club and exactly one ACTIVE OWNER membership for the caller. No venue or membership payment is required.")
    create(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: CreateClubInput):
        | ClubCreated<Club>
        | ClubMutationErrors;

    @get
    @route("/{clubId}")
    @operationId("getClub")
    @summary("Read a public club card")
    @doc("Returns the public projection. A club-blocked caller may still read it; restricted member, request and invitation data is never included.")
    detail(@path clubId: Uuid, ...RequestHeaders): ClubOk<Club> | ClubReadErrors;

    @patch
    @route("/{clubId}")
    @useAuth(BearerAuth)
    @operationId("updateClub")
    @summary("Update an active club card")
    @doc("OWNER or ADMIN changes supplied public fields at expectedVersion. Policy changes never transform existing membership intents.")
    update(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: UpdateClubInput,
    ): ClubOk<Club> | ClubMutationErrors;

    @post
    @route("/{clubId}/archive")
    @useAuth(BearerAuth)
    @operationId("archiveClub")
    @summary("Archive a club without deleting history")
    @doc("OWNER-only transition that preserves the owner, memberships, venue links and materialized matches while stopping new scoped activity and generation.")
    archive(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubReasonedCommand,
    ): ClubOk<Club> | ClubMutationErrors;

    @post
    @route("/{clubId}/restore")
    @useAuth(BearerAuth)
    @operationId("restoreClub")
    @summary("Restore an archived club")
    @doc("Restores future activity only. Terminal intents stay terminal and deliberately skipped recurring positions are not backfilled.")
    restore(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubReasonedCommand,
    ): ClubOk<Club> | ClubMutationErrors;

    @post
    @route("/{clubId}/join")
    @useAuth(BearerAuth)
    @operationId("joinClub")
    @summary("Join an open club or request approval")
    @doc("OPEN atomically creates MEMBER; APPROVAL creates one PENDING request; INVITE_ONLY fails safely. A pending intent grants no scoped access.")
    join(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedClubVersion,
    ): ClubOk<ClubJoinOutcome> | ClubMutationErrors;

    @get
    @route("/{clubId}/members")
    @useAuth(BearerAuth)
    @operationId("listClubMembers")
    @summary("List the authorized active club roster")
    @doc("Returns an opaque-cursor page only after current scoped membership authorization; pending intents are not members.")
    members(@path clubId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | ClubOk<ClubMemberPage>
        | ClubMutationErrors;

    @post
    @route("/{clubId}/members/{membershipId}/leave")
    @useAuth(BearerAuth)
    @operationId("leaveClub")
    @summary("Leave a club membership")
    @doc("Self-only for MEMBER or ADMIN. An OWNER must transfer ownership first; existing matches and history are retained.")
    leave(
        @path clubId: Uuid,
        @path membershipId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedClubResourceRevision,
    ): ClubOk<ClubMembership> | ClubMutationErrors;

    @post
    @route("/{clubId}/members/{membershipId}/exclude")
    @useAuth(BearerAuth)
    @operationId("excludeClubMember")
    @summary("Exclude a member within the club role hierarchy")
    @doc("Ends one active membership and its pending intents without deleting profile, match, result or message history.")
    exclude(
        @path clubId: Uuid,
        @path membershipId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubResourceReasonedCommand,
    ): ClubOk<ClubMembership> | ClubMutationErrors;

    @patch
    @route("/{clubId}/members/{membershipId}/role")
    @useAuth(BearerAuth)
    @operationId("changeClubMemberRole")
    @summary("Promote or demote a non-owner member")
    @doc("OWNER-only ADMIN/MEMBER change. Ownership is changed exclusively by the atomic transfer operation.")
    role(
        @path clubId: Uuid,
        @path membershipId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ChangeClubRoleInput,
    ): ClubOk<ClubMembership> | ClubMutationErrors;

    @post
    @route("/{clubId}/ownership/transfer")
    @useAuth(BearerAuth)
    @operationId("transferClubOwnership")
    @summary("Atomically transfer club ownership")
    @doc("Serializes the club and memberships: the active target becomes OWNER and the former owner becomes ADMIN in one commit, preserving exactly one active owner.")
    transfer(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: TransferClubOwnershipInput,
    ): ClubOk<Club> | ClubMutationErrors;

    @get
    @route("/{clubId}/join-requests")
    @useAuth(BearerAuth)
    @operationId("listClubJoinRequests")
    @summary("List club join requests for managers")
    @doc("OWNER or ADMIN receives a bounded cursor page of requests needed for decisions; unrelated callers receive no request graph.")
    requests(@path clubId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | ClubOk<ClubJoinRequestPage>
        | ClubMutationErrors;

    @post
    @route("/{clubId}/join-requests/{joinRequestId}/cancel")
    @useAuth(BearerAuth)
    @operationId("cancelClubJoinRequest")
    @summary("Cancel the caller's pending join request")
    @doc("Self-only terminal transition serialized with a manager decision; replay cannot create or reopen membership.")
    cancelRequest(
        @path clubId: Uuid,
        @path joinRequestId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedClubResourceRevision,
    ): ClubOk<ClubJoinRequest> | ClubMutationErrors;

    @post
    @route("/{clubId}/join-requests/{joinRequestId}/approve")
    @useAuth(BearerAuth)
    @operationId("approveClubJoinRequest")
    @summary("Approve one pending club join request")
    @doc("Consumes one PENDING request and creates at most one MEMBER after membership and block checks in the same transaction.")
    approveRequest(
        @path clubId: Uuid,
        @path joinRequestId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedClubResourceRevision,
    ): ClubOk<ClubMembership> | ClubMutationErrors;

    @post
    @route("/{clubId}/join-requests/{joinRequestId}/reject")
    @useAuth(BearerAuth)
    @operationId("rejectClubJoinRequest")
    @summary("Reject one pending club join request")
    @doc("Applies one terminal REJECTED transition; a concurrent accept, cancel or replay cannot revise the outcome.")
    rejectRequest(
        @path clubId: Uuid,
        @path joinRequestId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedClubResourceRevision,
    ): ClubOk<ClubJoinRequest> | ClubMutationErrors;

    @get
    @route("/{clubId}/invitations")
    @useAuth(BearerAuth)
    @operationId("listClubInvitations")
    @summary("List addressed invitations visible to club managers")
    @doc("Returns bounded invitation metadata without raw capability tokens; unrelated callers cannot infer invitees.")
    invitations(@path clubId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | ClubOk<ClubInvitationPage>
        | ClubMutationErrors;

    @post
    @route("/{clubId}/invitations")
    @useAuth(BearerAuth)
    @operationId("createClubInvitation")
    @summary("Create an addressed club invitation")
    @doc("Returns the raw capability once; persistence keeps a keyed hash. It expires after seven days and grants no role before acceptance.")
    invite(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: CreateClubInvitationInput,
    ): ClubCreated<ClubInvitationDelivery> | ClubMutationErrors;

    @post
    @route("/{clubId}/invitations/{invitationId}/revoke")
    @useAuth(BearerAuth)
    @operationId("revokeClubInvitation")
    @summary("Revoke one pending club invitation")
    @doc("OWNER or ADMIN applies one terminal revoke; a concurrent accept, decline or expiry has one winning outcome.")
    revokeInvitation(
        @path clubId: Uuid,
        @path invitationId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedClubResourceRevision,
    ): ClubOk<ClubInvitation> | ClubMutationErrors;

    @post
    @route("/{clubId}/members/{membershipId}/block")
    @useAuth(BearerAuth)
    @operationId("blockClubMember")
    @summary("Exclude and block a club member")
    @doc("Within the role hierarchy, atomically ends membership and pending intents and creates a scoped block against new intents.")
    blockMember(
        @path clubId: Uuid,
        @path membershipId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubResourceReasonedCommand,
    ): ClubNoContent | ClubMutationErrors;

    @post
    @route("/{clubId}/blocks/{blockId}/lift")
    @useAuth(BearerAuth)
    @operationId("liftClubBlock")
    @summary("Lift a club block without restoring prior access")
    @doc("Applies one terminal LIFTED transition; prior membership, request and invitation remain ended.")
    liftBlock(
        @path clubId: Uuid,
        @path blockId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubResourceReasonedCommand,
    ): ClubNoContent | ClubMutationErrors;

    @get
    @route("/{clubId}/venues")
    @operationId("listClubVenues")
    @summary("List public canonical venues linked to a club")
    @doc("Returns zero or more opaque public canonical venue references; an empty list is a valid club state.")
    venues(@path clubId: Uuid, ...RequestHeaders):
        | ClubOk<{
              items: ClubVenue[];
          }>
        | ClubReadErrors;

    @post
    @route("/{clubId}/venues")
    @useAuth(BearerAuth)
    @operationId("linkClubVenue")
    @summary("Link a public canonical venue")
    @doc("OWNER or ADMIN adds only a many-to-many reference after rechecking the venue is published and canonical.")
    linkVenue(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubVenueCommand,
    ): ClubCreated<ClubVenue> | ClubMutationErrors;

    @delete
    @route("/{clubId}/venues/{venueId}")
    @useAuth(BearerAuth)
    @operationId("unlinkClubVenue")
    @summary("Remove only the club-to-venue link")
    @doc("Never deletes the venue, club, materialized match or historical attribution. The club remains valid with zero venues.")
    unlinkVenue(
        @path clubId: Uuid,
        @path venueId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @query expectedVersion: int32,
    ): ClubNoContent | ClubMutationErrors;

    @post
    @route("/{clubId}/matches")
    @useAuth(BearerAuth)
    @operationId("createClubMatch")
    @summary("Create an ordinary match attributed to a club")
    @doc("OWNER or ADMIN authorizes creation, while the caller remains the real match organizer. Club membership does not populate the roster.")
    createMatch(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: CreateClubMatchInput,
    ): ClubCreated<Match> | ClubMutationErrors;

    @get
    @route("/{clubId}/recurring-match-rules")
    @useAuth(BearerAuth)
    @operationId("listRecurringMatchRules")
    @summary("List recurring match rules for club managers")
    @doc("Returns a bounded cursor page only to current OWNER or ADMIN; rule templates never contain shared roster state.")
    rules(@path clubId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | ClubOk<RecurringMatchRulePage>
        | ClubMutationErrors;

    @post
    @route("/{clubId}/recurring-match-rules")
    @useAuth(BearerAuth)
    @operationId("createRecurringMatchRule")
    @summary("Create a bounded timezone-aware recurring match rule")
    @doc("Stores local wall time, IANA timezone, tzdata version and explicit DST policies. Generation is limited to a rolling 42-day horizon and never copies membership into match roster.")
    createRule(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: CreateRecurringMatchRuleInput,
    ): ClubCreated<RecurringMatchRule> | ClubMutationErrors;

    @get
    @route("/{clubId}/recurring-match-rules/{ruleId}")
    @useAuth(BearerAuth)
    @operationId("getRecurringMatchRule")
    @summary("Read one recurring match rule")
    @doc("Returns one rule only after club-scoped manager authorization and does not expose occurrence participants.")
    rule(@path clubId: Uuid, @path ruleId: Uuid, ...RequestHeaders): ClubOk<RecurringMatchRule> | ClubMutationErrors;

    @patch
    @route("/{clubId}/recurring-match-rules/{ruleId}")
    @useAuth(BearerAuth)
    @operationId("updateRecurringMatchRule")
    @summary("Update only future recurring positions")
    @doc("Optimistically advances the template revision; immutable recorded positions and their independent matches are never rewritten.")
    updateRule(
        @path clubId: Uuid,
        @path ruleId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: UpdateRecurringMatchRuleInput,
    ): ClubOk<RecurringMatchRule> | ClubMutationErrors;

    @post
    @route("/{clubId}/recurring-match-rules/{ruleId}/pause")
    @useAuth(BearerAuth)
    @operationId("pauseRecurringMatchRule")
    @summary("Pause future recurring generation")
    @doc("Pauses generation without cancelling materialized matches; skipped calendar keys remain occupied for replay safety.")
    pauseRule(
        @path clubId: Uuid,
        @path ruleId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubResourceReasonedCommand,
    ): ClubOk<RecurringMatchRule> | ClubMutationErrors;

    @post
    @route("/{clubId}/recurring-match-rules/{ruleId}/resume")
    @useAuth(BearerAuth)
    @operationId("resumeRecurringMatchRule")
    @summary("Resume without backfilling skipped positions")
    @doc("Resumes from a monotonic generation watermark and leaves pause/archive skip markers unchanged.")
    resumeRule(
        @path clubId: Uuid,
        @path ruleId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubResourceReasonedCommand,
    ): ClubOk<RecurringMatchRule> | ClubMutationErrors;

    @post
    @route("/{clubId}/recurring-match-rules/{ruleId}/end")
    @useAuth(BearerAuth)
    @operationId("endRecurringMatchRule")
    @summary("Permanently end recurring generation")
    @doc("Applies a terminal ENDED transition without cancelling or rewriting independently materialized matches.")
    endRule(
        @path clubId: Uuid,
        @path ruleId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ClubResourceReasonedCommand,
    ): ClubOk<RecurringMatchRule> | ClubMutationErrors;

    @get
    @route("/{clubId}/recurring-match-rules/{ruleId}/occurrences")
    @useAuth(BearerAuth)
    @operationId("listRecurringMatchOccurrences")
    @summary("List independently materialized recurring occurrences")
    @doc("Every item is a stable local calendar position. MATERIALIZED points to one ordinary match; a DST gap or deliberate pause is explicit and cannot be backfilled by retry.")
    occurrences(@path clubId: Uuid, @path ruleId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | ClubOk<RecurringMatchOccurrencePage>
        | ClubMutationErrors;
}

@tag("Clubs")
@route("/club-invitations/{invitationToken}")
@useAuth(BearerAuth)
interface ClubInvitations {
    @get
    @operationId("getClubInvitation")
    @summary("Preview an invitation addressed to the caller")
    @doc("The token grants no membership or club role. The authenticated caller must be the addressed invitee.")
    preview(@path invitationToken: ClubInvitationToken, ...RequestHeaders):
        | ClubOk<ClubInvitation>
        | ClubFailure<401, "SESSION_INVALID">
        | ClubFailure<403, "INVITATION_NOT_ADDRESSED_TO_CALLER">
        | ClubReadErrors;

    @post
    @route("/accept")
    @operationId("acceptClubInvitation")
    @summary("Accept an addressed pending invitation")
    @doc("The authenticated invitee consumes the capability once; membership creation and superseding their pending request are atomic.")
    accept(
        @path invitationToken: ClubInvitationToken,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedClubResourceRevision,
    ): ClubOk<ClubMembership> | ClubMutationErrors;

    @post
    @route("/decline")
    @operationId("declineClubInvitation")
    @summary("Decline an addressed pending invitation")
    @doc("The authenticated invitee applies one terminal DECLINED transition without obtaining membership or scoped access.")
    decline(
        @path invitationToken: ClubInvitationToken,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedClubResourceRevision,
    ): ClubOk<ClubInvitation> | ClubMutationErrors;
}
