using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum ProfileVisibility {
    PUBLIC,
    PRIVATE,
}

enum ProfileProjectionState {
    CURRENT,
    UPDATING,
}

enum StatisticSlice {
    ALL,
    SINGLES,
    DOUBLES,
}

enum ProfileMatchHistoryState {
    CONFIRMED_SCORED,
    CONFIRMED_PLAYED,
    AWAITING_CONFIRMATION,
    DISPUTED,
    VOIDED,
    CANCELLED,
}

enum AvatarAssetState {
    PENDING_UPLOAD,
    PENDING_SCAN,
    ACTIVE,
    REJECTED,
}

@minLength(1)
@maxLength(512)
@pattern("^profiles/[0-9a-f-]{36}/avatars/[0-9a-f-]{36}/original$")
@doc("Server-generated private object key. It is never accepted from an update request and is not a public URL.")
scalar ProfileAvatarObjectKey extends string;

model PublicExternalProfileLink {
    provider: "DUPR";
    url: DuprProfileUrl;
    label: "EXTERNAL_NOT_VERIFIED_OR_SYNCED";
    outboundEnabled: boolean;
}

model PublicPlayerProfile {
    playerId: Uuid;
    displayName: DisplayName;
    locality: Locality;

    @minItems(1)
    @maxItems(2)
    gameFormats: GameFormat[];

    @doc("A self-assessment only. PickleHub has not verified this value and does not treat it as a rating.")
    skillSelfAssessment: SkillLevel;

    avatarUrl: string | null;
    externalProfileLink: PublicExternalProfileLink | null;
    statistics: PublicPlayerStatistics;
    updatedAt: Timestamp;
}

@doc("Self-only mutable profile. Credential, consent, access-history and provider-subject fields are deliberately absent.")
model PlayerProfile {
    playerId: Uuid;
    @minValue(0) version: int32;
    visibility: ProfileVisibility;
    displayName: DisplayName;
    locality: Locality;

    @minItems(1)
    @maxItems(2)
    gameFormats: GameFormat[];

    @doc("A self-assessment only; it is not a verified rating.")
    skillSelfAssessment: SkillLevel;

    timeZone: TimeZone;
    avatar: ProfileAvatar | null;
    externalProfileLink: PublicExternalProfileLink | null;
    statistics: PlayerStatistics;
    updatedAt: Timestamp;
}

model ProfileAvatar {
    assetId: Uuid;
    state: AvatarAssetState;
    url: string | null;
}

model UpdatePlayerProfile {
    @minValue(0) expectedVersion: int32;
    displayName?: DisplayName;
    localityId?: Uuid;

    @minItems(1)
    @maxItems(2)
    @doc("Distinct formats only. Changes affect future eligibility, never historical statistics.")
    gameFormats?: GameFormat[];

    skillSelfAssessment?: SkillLevel;
    timeZone?: TimeZone;
}

model ProfilePrivacySettings {
    @minValue(0) version: int32;
    visibility: ProfileVisibility;
    updatedAt: Timestamp;
}

model UpdateProfilePrivacySettings {
    @minValue(0) expectedVersion: int32;
    visibility: ProfileVisibility;
}

model SetDuprProfileLink {
    @minValue(0) expectedVersion: int32;
    url: DuprProfileUrl;
}

model RemoveDuprProfileLink {
    @minValue(0) expectedVersion: int32;
}

model AvatarUploadRequest {
    @minValue(0) expectedVersion: int32;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    @minValue(1) @maxValue(5242880) contentLength: int64;
    @pattern("^[a-f0-9]{64}$") sha256: string;
}

model AvatarUploadPolicy {
    assetId: Uuid;
    objectKey: ProfileAvatarObjectKey;
    @format("uri") uploadUrl: string;
    method: "PUT";
    expiresAt: Timestamp;
    requiredHeaders: {
        contentType: "image/jpeg" | "image/png" | "image/webp";
        @pattern("^[a-f0-9]{64}$") sha256: string;
    };
    @minValue(1) @maxValue(5242880) maxBytes: int64;
}

model StatisticTotals {
    slice: StatisticSlice;
    @minValue(0) played: int64;
    @minValue(0) wins: int64;
    @minValue(0) losses: int64;
    @minValue(0) decided: int64;
    @minValue(0) gamesPlayed: int64;
    @minValue(0) pointsFor: int64;
    @minValue(0) pointsAgainst: int64;
    pointsDifference: int64;

    @doc("Numerator for win rate. Clients must not sum or persist a rounded percentage.")
    @minValue(0)
    winRateNumerator: int64;

    @doc("wins + losses. Zero means win rate is absent, not zero percent.")
    @minValue(0)
    winRateDenominator: int64;

    lastConfirmedAt: Timestamp | null;
}

model PublicReliabilityStatistics {
    @minValue(0) organizedSuccesses: int64;
    @minValue(0) organizedFailures: int64;
    @minValue(0) denominator: int64;

    @doc("Null until at least five final commitments exist.")
    percentage: float64 | null;
}

model PublicAttendanceStatistics {
    @minValue(0) confirmedNoShows: int64;
    @minValue(0) attendanceCommitments: int64;

    @doc("Null until at least five final commitments exist. Reporter, evidence and match identifiers are never exposed.")
    percentage: float64 | null;

    available: boolean;
}

model PublicThresholdedPercentage {
    @doc("Null until at least five final commitments exist.")
    percentage: float64 | null;

    @doc("Null below the publication threshold; never identifies a source match, report or decision.")
    @minValue(5)
    sampleSize: int64 | null;
}

model PlayerStatistics {
    state: ProfileProjectionState;

    @minItems(3)
    @maxItems(3)
    totals: StatisticTotals[];

    reliability: PublicReliabilityStatistics;
    attendance: PublicAttendanceStatistics;
    calculatedAt: Timestamp;
}

model PublicPlayerStatistics {
    state: ProfileProjectionState;

    @minItems(3)
    @maxItems(3)
    totals: StatisticTotals[];

    reliability: PublicThresholdedPercentage;
    attendance: PublicThresholdedPercentage;
    attendanceAvailable: boolean;
    calculatedAt: Timestamp;
}

model MatchHistoryParticipant {
    playerId: Uuid;
    displayName: DisplayName;
    skillSelfAssessment: SkillLevel | null;
}

model MatchHistoryEntry {
    matchId: Uuid;
    format: MatchFormat;
    state: ProfileMatchHistoryState;
    startsAt: Timestamp;
    confirmedAt: Timestamp | null;
    venue: ProfileHistoryVenueReference;
    winningTeam: MatchTeamCode | null;
    @maxItems(5) games: GameScore[];
    participants: MatchHistoryParticipant[];
}

model ProfileHistoryVenueReference {
    venueId: Uuid | null;
}

model MatchHistoryPage {
    items: MatchHistoryEntry[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}

model ProfileResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}

model PublicProfileResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}

model ProfileOk<T> {
    @statusCode statusCode: 200;
    ...ProfileResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model PublicProfileOk<T> {
    @statusCode statusCode: 200;
    ...PublicProfileResponseHeaders;
    @body body: T;
}

model ProfileCreated<T> {
    @statusCode statusCode: 201;
    ...ProfileResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model ProfileNoContent {
    @statusCode statusCode: 204;
    ...ProfileResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
}

model ProfileError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model ProfileFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...PublicProfileResponseHeaders;
    @body body: ProfileError<Code>;
}

@error
model ProfileRateLimited {
    @statusCode statusCode: 429;
    ...PublicProfileResponseHeaders;
    ...RetryAfterHeader;
    @body body: ProfileError<"RATE_LIMITED">;
}

alias ProfileReadErrors =
    | ProfileFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR" | "CURSOR_EXPIRED">
    | ProfileFailure<401, "SESSION_INVALID">
    | ProfileFailure<404, "PROFILE_NOT_AVAILABLE">
    | ProfileRateLimited;

alias ProfileMutationErrors =
    | ProfileFailure<400, "VALIDATION_FAILED" | "DUPR_LINK_NOT_ALLOWED" | "AVATAR_UPLOAD_NOT_ALLOWED">
    | ProfileFailure<401, "SESSION_INVALID">
    | ProfileFailure<403, "ONBOARDING_REQUIRED" | "CONSENT_REQUIRED">
    | ProfileFailure<409, "PROFILE_VERSION_CONFLICT" | "IDEMPOTENCY_KEY_REUSED">
    | ProfileRateLimited;

@tag("Profiles")
@route("/me/profile")
@useAuth(BearerAuth)
interface OwnPlayerProfile {
    @get
    @operationId("getOwnPlayerProfile")
    @summary("Read the authenticated player's profile")
    @doc("Returns the self-only mutable profile and the last complete statistics generation. Credentials, consent records and access history are absent.")
    get(...RequestHeaders): ProfileOk<PlayerProfile> | ProfileReadErrors;

    @patch
    @operationId("updateOwnPlayerProfile")
    @summary("Update mutable profile fields")
    @doc("Uses optimistic versioning. Changes affect future discovery and never rewrite historical match contributions.")
    update(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: UpdatePlayerProfile):
        | ProfileOk<PlayerProfile>
        | ProfileMutationErrors;

    @get
    @route("/privacy")
    @operationId("getProfilePrivacySettings")
    @summary("Read profile privacy settings")
    @doc("Returns only the authenticated owner's visibility and optimistic-lock version.")
    privacy(...RequestHeaders): ProfileOk<ProfilePrivacySettings> | ProfileReadErrors;

    @patch
    @route("/privacy")
    @operationId("updateProfilePrivacySettings")
    @summary("Change public profile visibility")
    @doc("The new visibility applies after commit and invalidates public caches. It does not erase the minimal participant projection from an already authorized match.")
    updatePrivacy(
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: UpdateProfilePrivacySettings,
    ): ProfileOk<ProfilePrivacySettings> | ProfileMutationErrors;

    @put
    @route("/external-links/dupr")
    @operationId("setDuprProfileLink")
    @summary("Validate policy and store a DUPR link")
    @doc("Performs local syntax and approved host/path policy checks only. The server never fetches or scrapes DUPR, confirms ownership, imports a rating, or marks the link verified/synchronized.")
    setDupr(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: SetDuprProfileLink):
        | ProfileOk<PlayerProfile>
        | ProfileMutationErrors;

    @delete
    @route("/external-links/dupr")
    @operationId("removeDuprProfileLink")
    @summary("Remove the stored DUPR link")
    @doc("Deletes the encrypted external link and invalidates public projections without contacting DUPR.")
    removeDupr(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: RemoveDuprProfileLink):
        | ProfileNoContent
        | ProfileMutationErrors;

    @post
    @route("/avatar-uploads")
    @operationId("createProfileAvatarUpload")
    @summary("Create a bounded signed avatar upload")
    @doc("Creates a five-minute single-object PUT policy for a server-generated private key. It binds content type, length and SHA-256. The object is never public before decode/re-encode, malware checks and explicit activation.")
    createAvatarUpload(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: AvatarUploadRequest):
        | ProfileCreated<AvatarUploadPolicy>
        | ProfileMutationErrors;

    @delete
    @route("/avatar")
    @operationId("removeProfileAvatar")
    @summary("Remove the active avatar")
    @doc("Clears the active asset with optimistic versioning; object cleanup is asynchronous and the old key is never reused.")
    removeAvatar(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: ExpectedProfileVersion):
        | ProfileNoContent
        | ProfileMutationErrors;
}

model ExpectedProfileVersion {
    @minValue(0) expectedVersion: int32;
}

@tag("Profiles")
@route("/me")
@useAuth(BearerAuth)
interface OwnProfileHistoryAndStatistics {
    @get
    @route("/match-history")
    @operationId("listOwnMatchHistory")
    @summary("Page the authenticated player's match history")
    @doc("Includes authorized PUBLIC and UNLISTED terminal matches and safe unconfirmed states. The cursor is bound to the owner, snapshot, direction and filter.")
    history(...RequestHeaders, ...PaginationParameters): ProfileOk<MatchHistoryPage> | ProfileReadErrors;

    @get
    @route("/statistics")
    @operationId("getOwnPlayerStatistics")
    @summary("Read detailed lifetime statistics")
    @doc("Returns the last complete generation with integer numerators and denominators; an updating state never mixes generations.")
    statistics(...RequestHeaders): ProfileOk<PlayerStatistics> | ProfileReadErrors;
}

@tag("Profiles")
@route("/players/{playerId}")
@useAuth(NoAuth | BearerAuth)
interface PublicProfiles {
    @get
    @operationId("getPublicPlayerProfile")
    @summary("Read a minimal public player profile")
    @doc("For an authenticated viewer, a private, blocked, absent or deleting subject returns the same PROFILE_NOT_AVAILABLE response without revealing which condition applied. Anonymous access follows PUBLIC visibility because a block is not a privacy control.")
    get(@path playerId: Uuid, ...RequestHeaders): PublicProfileOk<PublicPlayerProfile> | ProfileReadErrors;

    @get
    @route("/match-history")
    @operationId("listPublicPlayerMatchHistory")
    @summary("Page a player's public confirmed match history")
    @doc("Returns only PUBLIC COMPLETED matches with confirmed outcomes and permitted venue/participant projections. UNLISTED, cancelled, voided, proposed, disputed and blocked records leave no placeholder.")
    history(@path playerId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | PublicProfileOk<MatchHistoryPage>
        | ProfileReadErrors;

    @get
    @route("/statistics")
    @operationId("getPublicPlayerStatistics")
    @summary("Read permitted public lifetime statistics")
    @doc("Returns only a completed generation. Reliability and attendance percentages remain null below five final commitments; no report, evidence or source match identifiers are exposed.")
    statistics(@path playerId: Uuid, ...RequestHeaders): PublicProfileOk<PublicPlayerStatistics> | ProfileReadErrors;
}
