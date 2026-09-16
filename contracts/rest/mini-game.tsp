using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum GameMode {
    STANDARD,
    CALM,
}

enum GameDirection {
    LEFT,
    CENTER,
    RIGHT,
}

enum GameSessionState {
    ISSUED,
    COMPLETED,
    REJECTED,
    EXPIRED,
}

enum GameResultOutcome {
    ACCEPTED,
    REJECTED,
}

enum GameResultReason {
    NONE,
    CHALLENGE_EXPIRED,
    CHALLENGE_REPLAYED,
    CHALLENGE_INVALID,
    CONFIGURATION_MISMATCH,
    MODE_MISMATCH,
    DURATION_INVALID,
    COUNTERS_INVALID,
    RATE_IMPOSSIBLE,
    NONCE_REUSED,
    REWARD_UNAVAILABLE,
}

enum GameGoalCode {
    DAILY_WARM_UP,
    DAILY_ACCURACY,
    DAILY_DIRECTIONS,
}

enum GameGoalState {
    INCOMPLETE,
    COMPLETED,
    REVERSED,
}

enum GameRewardKind {
    PRACTICE_MARK,
    COSMETIC,
    GLOBAL_XP,
}

enum GameRewardState {
    PENDING,
    GRANTED,
    CAPPED,
    REJECTED,
    REVERSED,
    REINSTATED,
}

enum GameCosmeticCode {
    SEASON_CARD_BACKGROUND,
    BALL_COLOR,
    BALL_TRAIL,
    GAME_PROFILE_FRAME,
}

enum GameCosmeticState {
    UNLOCKED,
    REVOKED,
    REINSTATED,
}

enum GameCosmeticCriterion {
    DISTINCT_COMPLETION_DAYS,
    PRACTICE_MARKS,
}

enum GameCosmeticProgressState {
    LOCKED,
    UNLOCKED,
    REVOKED,
}

@pattern("^[1-9][0-9]*\\.[0-9]+\\.[0-9]+$")
@maxLength(32)
scalar GameDefinitionVersion extends string;

@pattern("^mgc1_[A-Za-z0-9_-]{43,512}$")
@doc("Opaque server-signed challenge. It is accepted only in a request body, is never logged and contains no client signing secret.")
scalar GameChallengeProof extends string;

@pattern("^mgr1_[A-Za-z0-9_-]{43,512}$")
@doc("Opaque server-signed result confirmation bound to the terminal receipt. It is accepted only in a request body and is never logged.")
scalar GameResultProof extends string;

@pattern("^[A-Za-z0-9_-]{22,86}$")
@doc("At least 128 bits of caller randomness, sent only in the request body and scoped to one game session.")
scalar GameResultNonce extends string;

@pattern("^mgl1_[A-Za-z0-9_-]{43,256}$")
@doc("Single-use mobile WebView launch capability. It is passed only in a same-origin POST body and never in a URL, log or bridge message.")
scalar GameLaunchCapability extends string;

@pattern("^mga1_[A-Za-z0-9_-]{43,512}$")
@doc("Non-ambient game-only bearer. It cannot refresh identity, open arbitrary routes or call non-game APIs.")
scalar GameAccessToken extends string;

@format("uri")
@pattern("^https://[^/?#]+$")
@maxLength(255)
scalar GameHttpsOrigin extends string;

model GameScoreFormula {
    successfulReturnPoints: 10;
    targetDirectionPoints: 5;
    streakLength: 5;
    streakBonusPoints: 10;
}

model GameConfiguration {
    id: Uuid;
    version: GameDefinitionVersion;
    mode: GameMode;
    activeDurationMilliseconds: int32 | null;
    turnCount: int32 | null;
    pauseResumeTtlSeconds: 600;

    @minItems(3)
    @maxItems(3)
    directions: GameDirection[];

    scoreFormula: GameScoreFormula;
    publishedAt: Timestamp;
}

model GameSeason {
    id: Uuid;
    version: GameDefinitionVersion;
    startsAt: Timestamp;
    endsAt: Timestamp;
    state: "SCHEDULED" | "ACTIVE" | "CLOSED";
}

model GameTask {
    id: Uuid;
    configurationId: Uuid;
    configurationVersion: GameDefinitionVersion;
    seasonId: Uuid;
    mode: GameMode;
    dailyWindowStartedAt: Timestamp;
    dailyWindowEndsAt: Timestamp;
}

@doc("A short-lived online eligibility session. The signed challenge is a bearer secret and never belongs in a URL, log or analytics event.")
model GameSession {
    id: Uuid;
    state: GameSessionState;
    task: GameTask;
    configuration: GameConfiguration;
    challengeProof: GameChallengeProof;
    issuedAt: Timestamp;
    expiresAt: Timestamp;
    resultSubmissionLimit: 1;
}

model CreateGameSessionInput {
    mode: GameMode;
    configurationVersion: GameDefinitionVersion;
}

model GameWebViewLaunch {
    origin: GameHttpsOrigin;
    capability: GameLaunchCapability;
    expiresAt: Timestamp;
    exchangeMethod: "POST_BODY";
}

model ExchangeGameWebViewLaunchInput {
    capability: GameLaunchCapability;
}

model GameWebViewSession {
    accessToken: GameAccessToken;
    expiresAt: Timestamp;
    allowedApiPrefix: "/v1/mini-game";
    allowedBridgeMessages: "READY_V1,CLOSE_V1,OPEN_SAFE_ROUTE_V1,HEALTH_V1";
}

model GameOriginHeaders {
    @header("Origin")
    @doc("Exact dedicated HTTPS game origin configured by the server. Missing, opaque, application-shell and unlisted origins are rejected.")
    origin: GameHttpsOrigin;
}

@doc("Bounded aggregate counters only. Pointer coordinates, per-input timing, frames, device fingerprint and score have no representation.")
model GameResultCounters {
    @minValue(1)
    @maxValue(180)
    attempts: int32;

    @minValue(0)
    @maxValue(180)
    successfulReturns: int32;

    @minValue(0)
    @maxValue(180)
    targetHits: int32;

    @minValue(0)
    @maxValue(36)
    streakBonuses: int32;

    @minValue(0)
    @maxValue(180)
    leftTargetHits: int32;

    @minValue(0)
    @maxValue(180)
    centerTargetHits: int32;

    @minValue(0)
    @maxValue(180)
    rightTargetHits: int32;
}

model SubmitGameResultInput {
    challengeProof: GameChallengeProof;
    nonce: GameResultNonce;
    configurationVersion: GameDefinitionVersion;
    mode: GameMode;

    @minValue(1)
    @maxValue(900000)
    activeDurationMilliseconds: int32;

    @minValue(0)
    @maxValue(600000)
    pausedDurationMilliseconds: int32;

    counters: GameResultCounters;
}

@doc("Terminal server receipt. Client score is deliberately absent and the signed proof attests only bounded reward eligibility, not sporting skill or honest local physics.")
model GameResult {
    id: Uuid;
    sessionId: Uuid;
    taskId: Uuid;
    outcome: GameResultOutcome;
    reason: GameResultReason;
    mode: GameMode;
    configurationVersion: GameDefinitionVersion;
    resultProof: GameResultProof | null;
    acceptedAt: Timestamp | null;
    rewardClaimExpiresAt: Timestamp | null;
}

model ClaimGameRewardsInput {
    resultProof: GameResultProof;
}

model RewardGrant {
    id: Uuid;
    receiptId: Uuid;
    kind: GameRewardKind;
    state: GameRewardState;
    goalCode: GameGoalCode | null;
    cosmeticCode: GameCosmeticCode | null;
    amount: int32;
    compensationOfGrantId: Uuid | null;
    grantedAt: Timestamp | null;
}

model CosmeticUnlock {
    id: Uuid;
    seasonId: Uuid;
    code: GameCosmeticCode;
    state: GameCosmeticState;
    unlockedByGrantId: Uuid;
    changedAt: Timestamp;
}

model GameGoalProgress {
    code: GameGoalCode;
    state: GameGoalState;
    current: int32;
    target: int32;
    practiceMarksGranted: int32;
}

model GameCosmeticProgress {
    code: GameCosmeticCode;
    criterion: GameCosmeticCriterion;
    current: int32;
    target: int32;
    state: GameCosmeticProgressState;
    unlock: CosmeticUnlock | null;
}

@example(#{
    season: #{
        id: "0182f000-0000-7000-8000-000000000010",
        version: "1.0.0",
        startsAt: "2026-09-16T00:00:00.000Z",
        endsAt: "2026-12-09T00:00:00.000Z",
        state: "ACTIVE",
    },
    distinctCompletionDays: 1,
    practiceMarks: 2,
    goals: #[
        #{
            code: GameGoalCode.DAILY_WARM_UP,
            state: GameGoalState.COMPLETED,
            current: 1,
            target: 1,
            practiceMarksGranted: 1,
        },
        #{
            code: GameGoalCode.DAILY_ACCURACY,
            state: GameGoalState.COMPLETED,
            current: 12,
            target: 12,
            practiceMarksGranted: 1,
        },
        #{
            code: GameGoalCode.DAILY_DIRECTIONS,
            state: GameGoalState.INCOMPLETE,
            current: 1,
            target: 2,
            practiceMarksGranted: 0,
        }
    ],
    cosmetics: #[
        #{
            code: GameCosmeticCode.SEASON_CARD_BACKGROUND,
            criterion: GameCosmeticCriterion.DISTINCT_COMPLETION_DAYS,
            current: 1,
            target: 5,
            state: GameCosmeticProgressState.LOCKED,
            unlock: null,
        }
    ],
})
model GameSeasonProgress {
    season: GameSeason;
    distinctCompletionDays: int32;
    practiceMarks: int32;
    goals: GameGoalProgress[];
    cosmetics: GameCosmeticProgress[];
}

model GameRewardClaim {
    receiptId: Uuid;
    grants: RewardGrant[];
    cosmeticUnlocks: CosmeticUnlock[];
    progress: GameSeasonProgress;
    claimedAt: Timestamp;
}

model MiniGameResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "private, no-store";
    @header("Pragma") pragma: "no-cache";
}

model MiniGameOk<T> {
    @statusCode statusCode: 200;
    ...MiniGameResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model MiniGameCreated<T> {
    @statusCode statusCode: 201;
    ...MiniGameResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model MiniGameError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model MiniGameFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...MiniGameResponseHeaders;
    @body body: MiniGameError<Code>;
}

@error
model MiniGameRateLimited {
    @statusCode statusCode: 429;
    ...MiniGameResponseHeaders;
    ...RetryAfterHeader;
    @body body: MiniGameError<"RATE_LIMITED">;
}

alias MiniGameReadErrors =
    | MiniGameFailure<400, "VALIDATION_FAILED">
    | MiniGameFailure<401, "SESSION_INVALID">
    | MiniGameFailure<403, "ONBOARDING_REQUIRED">
    | MiniGameFailure<404, "GAME_SEASON_NOT_FOUND">
    | MiniGameRateLimited;

alias MiniGameMutationErrors =
    | MiniGameReadErrors
    | MiniGameFailure<409, "IDEMPOTENCY_KEY_REUSED" | "GAME_SESSION_TERMINAL" | "RESULT_NONCE_REUSED">
    | MiniGameFailure<410, "GAME_CHALLENGE_EXPIRED" | "REWARD_CLAIM_EXPIRED">
    | MiniGameFailure<422, "GAME_RESULT_IMPOSSIBLE" | "GAME_CHALLENGE_INVALID">
    | MiniGameFailure<503, "GAME_REWARDS_UNAVAILABLE">;

@tag("MiniGame")
@route("/mini-game")
@useAuth(BearerAuth)
interface MiniGame {
    @post
    @route("/webview-launches")
    @operationId("createMiniGameWebViewLaunch")
    @summary("Issue a mobile WebView launch capability")
    @doc("Available only to a server-known MOBILE access session. Returns a 60-second single-use capability for the exact dedicated HTTPS game origin; the capability is never placed in a URL and contains no native credential.")
    createWebViewLaunch(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey):
        | MiniGameCreated<GameWebViewLaunch>
        | MiniGameMutationErrors;

    @post
    @route("/webview-launches/exchange")
    @operationId("exchangeMiniGameWebViewLaunch")
    @summary("Exchange one WebView launch capability")
    @doc("Consumes the 60-second capability from a same-origin POST body and returns a 15-minute non-refreshable game-only bearer. Identical transport retry may replay the encrypted response; reuse from another request or origin is rejected.")
    @useAuth(NoAuth)
    exchangeWebViewLaunch(
        ...RequestHeaders,
        ...GameOriginHeaders,
        ...MutationKey,
        @body body: ExchangeGameWebViewLaunchInput,
    ): MiniGameCreated<GameWebViewSession> | MiniGameMutationErrors;

    @post
    @route("/sessions")
    @operationId("createMiniGameSession")
    @summary("Issue a short reward-eligible game session")
    @doc("Issues one server-signed challenge bound to the authenticated user, mode, immutable configuration, UTC day and active season. The challenge expires after 15 minutes, can produce one terminal result and is limited to 20 issues per user per UTC day.")
    createSession(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: CreateGameSessionInput):
        | MiniGameCreated<GameSession>
        | MiniGameMutationErrors;

    @post
    @route("/sessions/{sessionId}/results")
    @operationId("submitMiniGameResult")
    @summary("Submit one bounded aggregate result")
    @doc("Atomically consumes the challenge and nonce and returns the same terminal receipt on an identical retry. It validates signature, ownership, expiry, mode, configuration, duration, counter arithmetic and rate bounds but does not attest client score or replay local physics.")
    submitResult(
        @path sessionId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: SubmitGameResultInput,
    ): MiniGameCreated<GameResult> | MiniGameMutationErrors;

    @get
    @route("/progress")
    @operationId("getOwnMiniGameProgress")
    @summary("Read own daily goals and cosmetic progress")
    @doc("Returns only the authenticated player's current 84-day season progress and private cosmetic inventory. It never exposes score, another player or a leaderboard.")
    progress(...RequestHeaders): MiniGameOk<GameSeasonProgress> | MiniGameReadErrors;

    @post
    @route("/receipts/{receiptId}/reward-claim")
    @operationId("claimMiniGameRewards")
    @summary("Idempotently claim capped rewards")
    @doc("Claims independent practice-mark, cosmetic and global-XP outcomes for one accepted receipt. The signed result proof expires after 24 hours; identical retries return the stored claim and no grant is duplicated. XP is requested through gamification and is never written directly by mini-game storage.")
    claimRewards(
        @path receiptId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: ClaimGameRewardsInput,
    ): MiniGameOk<GameRewardClaim> | MiniGameMutationErrors;
}
