using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum GamificationScopeKind {
    GLOBAL,
    CLUB,
}

enum XpSourceKind {
    CONFIRMED_PLAY,
    CONFIRMED_MATCH_ORGANIZED,
    ELIGIBLE_STRUCTURED_REVIEW,
}

enum XpLedgerEntryKind {
    AWARD,
    REVERSAL,
    REINSTATEMENT,
}

enum XpLedgerEntryStatus {
    PENDING,
    POSTED,
    CAPPED,
}

enum GamificationProgressState {
    ACTIVE,
    FROZEN,
}

enum AchievementAwardState {
    EARNED,
    REVOKED,
    REINSTATED,
}

enum LeaderboardSeasonState {
    SCHEDULED,
    ACTIVE,
    CLOSED,
}

enum LeaderboardRowVisibility {
    VISIBLE,
    HIDDEN_BY_BLOCK,
}

@pattern("^[1-9][0-9]*\\.[0-9]+\\.[0-9]+$")
@example("1.0.0")
scalar GamificationDefinitionVersion extends string;

@pattern("^[A-Z][A-Z0-9_]{1,95}$")
scalar GamificationCode extends string;

@minValue(0)
scalar XpAmount extends int64;

model GamificationScope {
    kind: GamificationScopeKind;
    clubId: Uuid | null;
}

@doc("Historical rule snapshot used for one source calculation. It is immutable after effectiveFrom.")
model XpRuleDefinition {
    id: Uuid;
    scope: GamificationScope;
    sourceKind: XpSourceKind;
    version: GamificationDefinitionVersion;
    enabled: boolean;
    baseXp: XpAmount;
    @minValue(5) @maxValue(20) coefficientTenths: int32;
    @minValue(1) @maxValue(3) dailyEventCap: int32;
    @minValue(1) @maxValue(10) weeklyEventCap: int32;
    effectiveFrom: Timestamp;
    effectiveUntil: Timestamp | null;
}

@doc("Append-only private ledger item. sourceEventId is opaque and compensationOfEntryId links reversals/reinstatements without rewriting history.")
model XpLedgerEntry {
    id: Uuid;
    scope: GamificationScope;
    sourceKind: XpSourceKind;
    sourceEventId: Uuid;
    ruleDefinitionId: Uuid;
    ruleVersion: GamificationDefinitionVersion;
    kind: XpLedgerEntryKind;
    status: XpLedgerEntryStatus;
    amount: XpAmount;
    compensationOfEntryId: Uuid | null;
    occurredAt: Timestamp;
    createdAt: Timestamp;
}

model LevelDefinition {
    id: Uuid;
    scope: GamificationScope;
    version: GamificationDefinitionVersion;
    @minValue(1) @maxValue(20) ordinal: int32;
    @minLength(1) @maxLength(30) name: string;
    thresholdXp: XpAmount;
    effectiveFrom: Timestamp;
}

model GamificationProgress {
    scope: GamificationScope;
    state: GamificationProgressState;
    lifetimeNetXp: XpAmount;
    currentLevel: LevelDefinition;
    nextLevel: LevelDefinition | null;
    xpToNextLevel: XpAmount | null;
    projectionRevision: int64;
    updatedAt: Timestamp;
}

model AchievementDefinition {
    id: Uuid;
    scopeKind: GamificationScopeKind;
    code: GamificationCode;
    version: GamificationDefinitionVersion;
    sourceKind: XpSourceKind;
    @minValue(1) thresholdCount: int32;
    @minLength(1) @maxLength(80) title: string;
    @maxLength(300) description: string;
}

model AchievementAward {
    id: Uuid;
    definition: AchievementDefinition;
    scope: GamificationScope;
    state: AchievementAwardState;
    qualifyingCount: int32;
    awardedAt: Timestamp;
    changedAt: Timestamp;
}

model AchievementPage {
    items: AchievementAward[];
    pageInfo: PageInfo;
}

model LeaderboardSeason {
    id: Uuid;
    scope: GamificationScope;
    name: string;
    state: LeaderboardSeasonState;
    startsAt: Timestamp;
    endsAt: Timestamp;
    ruleVersion: GamificationDefinitionVersion;
    definitionSnapshotHash: string;
}

model LeaderboardConsent {
    seasonId: Uuid;
    optedIn: boolean;
    policyVersion: GamificationDefinitionVersion;
    revision: int32;
    changedAt: Timestamp;
}

model LeaderboardEntry {
    rank: int32;
    visibility: LeaderboardRowVisibility;
    userId: Uuid | null;
    displayName: string;
    avatarUrl: string | null;
    levelName: string;
    seasonalNetXp: XpAmount;
}

model LeaderboardPage {
    season: LeaderboardSeason;
    items: LeaderboardEntry[];
    pageInfo: PageInfo;
    viewerConsent: LeaderboardConsent | null;
    projectionRevision: int64;
}

model LeaderboardConsentInput {
    optedIn: boolean;
    policyVersion: GamificationDefinitionVersion;
    @minValue(0) expectedRevision: int32;
}

model ClubXpTemplate {
    sourceKind: XpSourceKind;
    enabled: boolean;
    @minValue(5) @maxValue(20) coefficientTenths: int32;
    baseXp: XpAmount;
    dailyEventCap: int32;
    weeklyEventCap: int32;
}

model ClubLevelInput {
    @minValue(1) @maxValue(20) ordinal: int32;
    @minLength(1) @maxLength(30) name: string;
    thresholdXp: XpAmount;
}

model ClubGamificationConfiguration {
    clubId: Uuid;
    version: int32;
    definitionVersion: GamificationDefinitionVersion;
    effectiveFrom: Timestamp;
    templates: ClubXpTemplate[];
    levels: LevelDefinition[];
}

model UpdateClubGamificationConfiguration {
    @minValue(0) expectedVersion: int32;
    effectiveFrom: Timestamp;
    @minItems(1) @maxItems(3) templates: ClubXpTemplate[];
    @minItems(1) @maxItems(20) levels: ClubLevelInput[];
}

model GamificationDefinitionCatalogue {
    globalRules: XpRuleDefinition[];
    globalLevels: LevelDefinition[];
    achievements: AchievementDefinition[];
    clubTemplates: ClubXpTemplate[];
}

model GamificationResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "private, no-store";
}

model GamificationOk<T> {
    @statusCode statusCode: 200;
    ...GamificationResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model GamificationError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model GamificationFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...GamificationResponseHeaders;
    @body body: GamificationError<Code>;
}

@error
model GamificationRateLimited {
    @statusCode statusCode: 429;
    ...GamificationResponseHeaders;
    ...RetryAfterHeader;
    @body body: GamificationError<"RATE_LIMITED">;
}

alias GamificationReadErrors =
    | GamificationFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR">
    | GamificationFailure<401, "SESSION_INVALID">
    | GamificationFailure<403, "ONBOARDING_REQUIRED" | "GAMIFICATION_ACTION_FORBIDDEN">
    | GamificationFailure<404, "GAMIFICATION_SCOPE_NOT_FOUND" | "SEASON_NOT_FOUND">
    | GamificationRateLimited;

alias GamificationMutationErrors =
    | GamificationReadErrors
    | GamificationFailure<409, "REVISION_CONFLICT" | "SEASON_CLOSED" | "IDEMPOTENCY_KEY_REUSED">;

@tag("Gamification")
@route("/gamification")
@useAuth(BearerAuth)
interface Gamification {
    @get
    @route("/progress")
    @operationId("getOwnGlobalProgress")
    @summary("Read own global progress")
    @doc("Returns the authenticated player's private lifetime global projection; it never exposes another player's ledger.")
    globalProgress(...RequestHeaders): GamificationOk<GamificationProgress> | GamificationReadErrors;

    @get
    @route("/achievements")
    @operationId("listOwnAchievements")
    @summary("List own achievements")
    @doc("Returns only the authenticated player's awards in stable changed-time and ID order; private source activity is not exposed.")
    achievements(...RequestHeaders, ...PaginationParameters): GamificationOk<AchievementPage> | GamificationReadErrors;

    @get
    @route("/seasons/{seasonId}/leaderboard")
    @operationId("getSeasonLeaderboard")
    @summary("Read a consented seasonal leaderboard")
    @doc("Only explicitly opted-in rows are projected. Equal seasonal net XP shares competition rank. A mutually blocked row preserves rank but contains no user identifier, avatar or profile link.")
    leaderboard(@path seasonId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | GamificationOk<LeaderboardPage>
        | GamificationReadErrors;

    @put
    @route("/seasons/{seasonId}/leaderboard-consent")
    @operationId("setLeaderboardConsent")
    @summary("Opt in or out of one season")
    @doc("Consent is off by default and independent from analytics, terms and club membership. Opt-out immediately removes the row without deleting XP; closed seasons reject new consent.")
    consent(
        @path seasonId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: LeaderboardConsentInput,
    ): GamificationOk<LeaderboardConsent> | GamificationMutationErrors;

    @get
    @route("/admin/definitions")
    @operationId("getGamificationAdminDefinitions")
    @extension("x-admin-capability", "GAMIFICATION_DEFINITION_READ")
    @extension("x-admin-roles", #["SUPERADMIN"])
    @summary("Read versioned platform definitions")
    @doc("Requires a current purpose-bound platform administration capability; definitions are immutable snapshots.")
    definitions(...RequestHeaders): GamificationOk<GamificationDefinitionCatalogue> | GamificationReadErrors;
}

@tag("Gamification")
@route("/clubs/{clubId}/gamification")
@useAuth(BearerAuth)
interface ClubGamification {
    @get
    @route("/progress")
    @operationId("getOwnClubProgress")
    @summary("Read own club progress")
    @doc("Global and club balances are independent. Leaving, exclusion or block freezes this projection; rejoining continues it without backfill.")
    progress(@path clubId: Uuid, ...RequestHeaders): GamificationOk<GamificationProgress> | GamificationReadErrors;

    @get
    @route("/configuration")
    @operationId("getClubGamificationConfiguration")
    @summary("Read club templates and levels")
    @doc("Returns the effective immutable configuration snapshot to an active member; private ledgers and anti-fraud data are not included.")
    configuration(@path clubId: Uuid, ...RequestHeaders):
        | GamificationOk<ClubGamificationConfiguration>
        | GamificationReadErrors;

    @put
    @route("/configuration")
    @operationId("updateClubGamificationConfiguration")
    @summary("Version club templates and levels")
    @doc("Club owner/admin may select only the three allowlisted sources, coefficient 0.5..2.0 in 0.1 steps and 1..20 increasing level thresholds. Formulae, scripts, manual/negative XP and retroactive changes are rejected.")
    updateConfiguration(
        @path clubId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: UpdateClubGamificationConfiguration,
    ): GamificationOk<ClubGamificationConfiguration> | GamificationMutationErrors;
}
