using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum TournamentFormatCode {
    AMERICANO,
    ROUND_ROBIN,
    SINGLE_ELIMINATION,
    DOUBLE_ELIMINATION,
    POOL_PLAY,
    SWISS,
    LADDER,
    KING_OF_COURT,
    CUSTOM_DSL,
}

enum TournamentState {
    DRAFT,
    PUBLISHED,
    CHECK_IN,
    SEEDED,
    IN_PROGRESS,
    PAUSED,
    COMPLETED,
    CANCELLED,
}
enum TournamentRegistrationGate {
    OPEN,
    CLOSED,
}
enum TournamentPlayMode {
    INDIVIDUAL_DOUBLES,
    SINGLES,
    FIXED_TEAM_DOUBLES,
}
enum TournamentEntryKind {
    INDIVIDUAL,
    TEAM,
}
enum TournamentEntrantState {
    ELIGIBLE,
    WAITLISTED,
    WITHDRAWN,
    REPLACED,
    NO_SHOW,
}
enum TournamentMemberState {
    PENDING_CONFIRMATION,
    CONFIRMED,
    WITHDRAWN,
    REPLACED,
    NO_SHOW,
}
enum TournamentCheckInState {
    NOT_REQUIRED,
    PENDING,
    ARRIVED,
    WITHDRAWN,
    NO_SHOW,
}
enum TournamentPaymentState {
    NOT_REQUIRED,
    PENDING_EXTERNAL,
    MARKED_PAID,
    WAIVED,
    REFUND_REPORTED,
}
enum TournamentPartnerIntentState {
    PENDING,
    PAIRED,
    WAITLISTED,
    WITHDRAWN,
    EXPIRED,
}
enum TournamentStageKind {
    LEAGUE,
    POOL,
    WINNERS,
    LOSERS,
    PLAYOFF,
    FINAL,
    BRONZE,
    LADDER,
    COURT,
}
enum TournamentRoundState {
    PLANNED,
    READY,
    IN_PROGRESS,
    COMPLETED,
}
enum TournamentMatchState {
    PLANNED,
    READY,
    IN_PROGRESS,
    COMPLETED,
    BYE,
    WALKOVER,
    DOUBLE_WALKOVER,
    VOID,
}
enum TournamentOutcomeKind {
    PLAYED,
    BYE,
    WALKOVER,
    DOUBLE_WALKOVER,
}
enum TournamentScoringProfile {
    ONE_GAME_11_WIN_BY_2_CAP_15,
    BEST_OF_3_11_WIN_BY_2_CAP_15,
    TIMED_GOLDEN_POINT,
}
enum TournamentSeedingPolicy {
    MANUAL,
    RANDOM,
    REGISTRATION_ORDER,
    RATING_SNAPSHOT,
}
enum TournamentCorrectionDecision {
    APPLY,
    RESULT_STANDS,
}

@minLength(1)
@maxLength(120)
scalar TournamentName extends string;
@pattern("^[A-Z][A-Z0-9_]{1,95}$")
scalar TournamentReasonCode extends string;
@pattern("^[A-Z]{3}$")
@example("RUB")
@doc("ISO 4217 alphabetic code validated against the server's versioned currency table.")
scalar CurrencyCode extends string;
@pattern("^[a-f0-9]{64}$")
@example("5eb63bbbe01eeed093cb22bb8f5acdc3d85b8f5a1ca92f781b95a1b63a4c7f10")
scalar Sha256Checksum extends string;
@pattern("^[1-9][0-9]*\\.[0-9]+\\.[0-9]+$")
@example("1.0.0")
scalar TournamentStrategyVersion extends string;
@minValue(0)
@example(0)
scalar TournamentMoneyMinor extends int64;

model FormatDefinition {
    formatCode: TournamentFormatCode;
    strategyVersion: TournamentStrategyVersion;
    playMode: TournamentPlayMode;
    scoringProfile: TournamentScoringProfile;
    seedingPolicy: TournamentSeedingPolicy;
    configuration: TournamentPresetConfiguration;
}

model PresetBase {
    schemaVersion: "1.0.0";
    @minValue(1) courtCount: int32;
}
model AmericanoPreset {
    ...PresetBase;
    formatCode: "AMERICANO";
    @minValue(3) @maxValue(63) rounds: int32;
}
model RoundRobinPreset {
    ...PresetBase;
    formatCode: "ROUND_ROBIN";
    @minValue(1) @maxValue(2) legs: int32;
}
model SingleEliminationPreset {
    ...PresetBase;
    formatCode: "SINGLE_ELIMINATION";
    bronzeMatch: boolean;
}
model DoubleEliminationPreset {
    ...PresetBase;
    formatCode: "DOUBLE_ELIMINATION";
    grandFinalReset: true;
}
model PoolPlayPreset {
    ...PresetBase;
    formatCode: "POOL_PLAY";
    @minValue(2) @maxValue(16) poolCount: int32;
    @minValue(1) @maxValue(5) qualifiersPerPool: int32;
    @minValue(0) @maxValue(31) wildcardCount: int32;
    @minValue(2) @maxValue(32) playoffSize: int32;
}
model SwissPreset {
    ...PresetBase;
    formatCode: "SWISS";
    @minValue(3) @maxValue(9) rounds: int32;
}
model LadderPreset {
    ...PresetBase;
    formatCode: "LADDER";
    @minValue(3) @maxValue(20) rounds: int32;
    @minValue(1) @maxValue(5) challengeSpan: int32;
}
model KingOfCourtPreset {
    ...PresetBase;
    formatCode: "KING_OF_COURT";
    @minValue(1) @maxValue(20) rounds: int32;
}

union TournamentPresetConfiguration {
    americano: AmericanoPreset,
    roundRobin: RoundRobinPreset,
    singleElimination: SingleEliminationPreset,
    doubleElimination: DoubleEliminationPreset,
    poolPlay: PoolPlayPreset,
    swiss: SwissPreset,
    ladder: LadderPreset,
    kingOfCourt: KingOfCourtPreset,
}

model Tournament {
    id: Uuid;
    version: int32;
    state: TournamentState;
    registrationGate: TournamentRegistrationGate;
    organizerId: Uuid;
    clubId: Uuid | null;
    venueId: Uuid;
    name: TournamentName;
    @maxLength(2000) description: string;
    timeZone: string;
    startsAt: Timestamp;
    registrationOpensAt: Timestamp;
    registrationClosesAt: Timestamp;
    checkInClosesAt: Timestamp | null;
    @minValue(2) @maxValue(128) capacity: int32;
    @minValue(0) entrantCount: int32;
    priceMinor: TournamentMoneyMinor | null;
    currency: CurrencyCode | null;
    format: FormatDefinition;
    projectionRevision: int64;
    projectionChecksum: Sha256Checksum | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

model EntrantMember {
    id: Uuid;
    entrantId: Uuid;
    userId: Uuid;
    state: TournamentMemberState;
    revision: int32;
}
model PaymentMark {
    id: Uuid;
    entrantId: Uuid;
    revision: int32;
    state: TournamentPaymentState;
    markedAt: Timestamp;
}
model Entrant {
    id: Uuid;
    tournamentId: Uuid;
    kind: TournamentEntryKind;
    state: TournamentEntrantState;
    revision: int32;
    fifoSequence: int64 | null;
    seed: int32 | null;
    tieBreakLot: int64 | null;
    checkInState: TournamentCheckInState;
    members: EntrantMember[];
    payment: PaymentMark;
    registeredAt: Timestamp;
}
model PartnerIntent {
    id: Uuid;
    tournamentId: Uuid;
    userId: Uuid;
    revision: int32;
    state: TournamentPartnerIntentState;
    matchingOptIn: true;
    fifoSequence: int64;
    registeredAt: Timestamp;
}
union TournamentRegistrationResult {
    entrant: Entrant,
    partnerIntent: PartnerIntent,
}
model Stage {
    id: Uuid;
    tournamentId: Uuid;
    sequence: int32;
    kind: TournamentStageKind;
    strategyKey: string;
}
model Round {
    id: Uuid;
    stageId: Uuid;
    sequence: int32;
    revision: int32;
    state: TournamentRoundState;
    generation: int32;
}
model TournamentMatchSlot {
    position: int32;
    entrantId: Uuid | null;
    sourceMatchId: Uuid | null;
    sourceOutcome: "WINNER" | "LOSER" | null;
}
model CourtAssignment {
    id: Uuid;
    tournamentMatchId: Uuid;
    revision: int32;
    courtRank: int32;
    batch: int32;
    startsAt: Timestamp | null;
}
model TournamentGameScore {
    game: int32;
    sideOne: int32;
    sideTwo: int32;
}
model TournamentMatch {
    id: Uuid;
    tournamentId: Uuid;
    stageId: Uuid;
    roundId: Uuid;
    sequence: int32;
    revision: int32;
    resultRevision: int32;
    state: TournamentMatchState;
    slots: TournamentMatchSlot[];
    winnerEntrantId: Uuid | null;
    outcome: TournamentOutcomeKind | null;
    scores: TournamentGameScore[];
    courtAssignment: CourtAssignment | null;
}
model Standing {
    tournamentId: Uuid;
    stageId: Uuid | null;
    entrantId: Uuid;
    revision: int32;
    rank: int32;
    matchPoints: int32;
    wins: int32;
    gameDifferential: int32;
    pointDifferential: int32;
    pointsScored: int32;
    tieBreakLot: int64;
}

model TournamentPage {
    items: Tournament[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}
model EntrantPage {
    items: Entrant[];
    pageInfo: PageInfo;
}
model TournamentPlan {
    tournamentId: Uuid;
    projectionRevision: int64;
    projectionChecksum: Sha256Checksum;
    stages: Stage[];
    rounds: Round[];
    matches: TournamentMatch[];
    standings: Standing[];
}
model ExpectedTournamentVersion {
    @minValue(0) expectedVersion: int32;
}
model ExpectedTournamentResourceRevision {
    @minValue(0) expectedTournamentVersion: int32;
    @minValue(0) expectedRevision: int32;
}
model TournamentReasonedCommand {
    ...ExpectedTournamentVersion;
    reasonCode: TournamentReasonCode;
}

model CreateTournamentInput {
    clubId?: Uuid | null;
    venueId: Uuid;
    name: TournamentName;
    @maxLength(2000) description: string;
    @minLength(1) @maxLength(64) timeZone: string;
    startsAt: Timestamp;
    registrationOpensAt: Timestamp;
    registrationClosesAt: Timestamp;
    checkInClosesAt?: Timestamp | null;
    @minValue(2) @maxValue(128) capacity: int32;
    priceMinor?: TournamentMoneyMinor | null;
    currency?: CurrencyCode | null;
    format: FormatDefinition;
}
model UpdateTournamentInput {
    ...ExpectedTournamentVersion;
    name?: TournamentName;
    @maxLength(2000) description?: string;
    registrationOpensAt?: Timestamp;
    registrationClosesAt?: Timestamp;
    checkInClosesAt?: Timestamp | null;
    priceMinor?: TournamentMoneyMinor | null;
    currency?: CurrencyCode | null;
}
model RegisterTournamentInput {
    ...ExpectedTournamentVersion;
    kind: TournamentEntryKind;
    memberIds: Uuid[];
    partnerMatchingOptIn?: boolean;
}
model EntrantCommand {
    ...ExpectedTournamentResourceRevision;
}
model PaymentMarkInput {
    ...ExpectedTournamentResourceRevision;
    state: TournamentPaymentState;
    reasonCode: TournamentReasonCode;
}
model SeedInput {
    ...ExpectedTournamentVersion;
    orderedEntrantIds: Uuid[];
}
model StartRoundInput {
    ...ExpectedTournamentResourceRevision;
}
model CompleteRoundInput {
    ...ExpectedTournamentResourceRevision;
}
model ScoreTournamentMatchInput {
    ...ExpectedTournamentResourceRevision;

    @minValue(0)
    expectedResultRevision: int32;

    outcome: "PLAYED";
    winnerEntrantId: Uuid;
    scores: TournamentGameScore[];
}
model WalkoverTournamentMatchInput {
    ...ExpectedTournamentResourceRevision;

    @minValue(0)
    expectedResultRevision: int32;

    outcome: "BYE" | "WALKOVER" | "DOUBLE_WALKOVER";
    winnerEntrantId: Uuid | null;
    reasonCode: TournamentReasonCode;
}
model CorrectTournamentMatchInput {
    ...ExpectedTournamentResourceRevision;

    @minValue(0)
    expectedResultRevision: int32;

    decision: TournamentCorrectionDecision;
    winnerEntrantId?: Uuid | null;
    scores?: TournamentGameScore[];
    reasonCode: TournamentReasonCode;
}

@doc("Pure deterministic strategy input. The implementation may read only this immutable snapshot, ordered seeds/lots and authoritative terminal result revisions.")
model TournamentFormatStrategyInput {
    definition: FormatDefinition;
    entrants: Entrant[];
    authoritativeMatches: TournamentMatch[];
    projectionRevision: int64;
}
@doc("Pure strategy output persisted only after aggregate-version and projection-checksum validation.")
model TournamentFormatStrategyOutput {
    plan: TournamentPlan;
    requiredTerminalMatchIds: Uuid[];
    championEntrantId: Uuid | null;
}

model TournamentResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}
model TournamentOk<T> {
    @statusCode statusCode: 200;
    ...TournamentResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}
model TournamentCreated<T> {
    @statusCode statusCode: 201;
    ...TournamentResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}
model TournamentNoContent {
    @statusCode statusCode: 204;
    ...TournamentResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
}
model TournamentError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}
@error
model TournamentFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...TournamentResponseHeaders;
    @body body: TournamentError<Code>;
}
@error
model TournamentRateLimited {
    @statusCode statusCode: 429;
    ...TournamentResponseHeaders;
    ...RetryAfterHeader;
    @body body: TournamentError<"RATE_LIMITED">;
}
alias TournamentReadErrors =
    | TournamentFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR">
    | TournamentFailure<404, "TOURNAMENT_NOT_FOUND">
    | TournamentRateLimited;
alias TournamentMutationErrors =
    | TournamentFailure<400, "VALIDATION_FAILED" | "CUSTOM_DSL_DISABLED">
    | TournamentFailure<401, "SESSION_INVALID">
    | TournamentFailure<403, "ONBOARDING_REQUIRED" | "TOURNAMENT_ACTION_FORBIDDEN">
    | TournamentFailure<404, "TOURNAMENT_NOT_FOUND" | "TOURNAMENT_RESOURCE_NOT_FOUND">
    | TournamentFailure<
          409,
          | "TOURNAMENT_VERSION_CONFLICT"
          | "TOURNAMENT_RESOURCE_REVISION_CONFLICT"
          | "TOURNAMENT_TRANSITION_NOT_ALLOWED"
          | "TOURNAMENT_CAPACITY_FULL"
          | "TOURNAMENT_ENTRY_CONFLICT"
          | "TOURNAMENT_DEPENDENCY_STARTED"
          | "TOURNAMENT_PROJECTION_MISMATCH"
          | "IDEMPOTENCY_KEY_REUSED"
      >
    | TournamentRateLimited;

model TournamentSearchFilters {
    @query format?: TournamentFormatCode;
    @query state?: TournamentState;
    @query venueId?: Uuid;
    @query clubId?: Uuid;

    @query
    @minLength(1)
    @maxLength(120)
    query?: string;
}

@tag("Tournaments")
@route("/tournaments")
@useAuth(NoAuth)
interface Tournaments {
    @get
    @operationId("searchTournaments")
    @summary("Search published tournaments")
    @doc("Returns only published tournament projections in stable start-time and ID order; private drafts and participant state cannot be enumerated.")
    search(...RequestHeaders, ...TournamentSearchFilters, ...PaginationParameters):
        | TournamentOk<TournamentPage>
        | TournamentReadErrors;
    @post
    @useAuth(BearerAuth)
    @operationId("createTournament")
    @summary("Create a tournament draft")
    @doc("Creates one shared aggregate from an allowlisted versioned preset. CUSTOM_DSL is reserved but always rejected with CUSTOM_DSL_DISABLED.")
    create(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: CreateTournamentInput):
        | TournamentCreated<Tournament>
        | TournamentMutationErrors;
    @get
    @route("/{tournamentId}")
    @operationId("getTournament")
    @summary("Read a tournament")
    @doc("Returns the public projection after publication, or the scoped projection to an authorized organizer or entrant.")
    detail(@path tournamentId: Uuid, ...RequestHeaders): TournamentOk<Tournament> | TournamentReadErrors;
    @patch
    @route("/{tournamentId}")
    @useAuth(BearerAuth)
    @operationId("updateTournament")
    @summary("Update a tournament draft")
    @doc("Updates only mutable fields using expectedVersion; seeded format snapshots and entrants are immutable.")
    update(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: UpdateTournamentInput,
    ): TournamentOk<Tournament> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/publish")
    @useAuth(BearerAuth)
    @operationId("publishTournament")
    @summary("Publish tournament rules")
    @doc("Validates capacity, courts, windows and preset schema, then publishes immutable rule/version information without creating payment services.")
    publish(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedTournamentVersion,
    ): TournamentOk<Tournament> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/registrations")
    @useAuth(BearerAuth)
    @operationId("registerForTournament")
    @summary("Register an entrant or partner intent")
    @doc("Creates one individual or confirmed team entrant, or an explicit partner-matching intent; full capacity uses server FIFO without duplicate membership.")
    register(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: RegisterTournamentInput,
    ): TournamentCreated<TournamentRegistrationResult> | TournamentMutationErrors;
    @get
    @route("/{tournamentId}/entrants")
    @useAuth(BearerAuth)
    @operationId("listTournamentEntrants")
    @summary("List scoped entrants")
    @doc("Returns a bounded tournament-scoped page; public search never exposes waitlist, payment, check-in or pairing state.")
    entrants(@path tournamentId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | TournamentOk<EntrantPage>
        | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/entrants/{entrantId}/check-in")
    @useAuth(BearerAuth)
    @operationId("checkInTournamentEntrant")
    @summary("Mark entrant arrival")
    @doc("Applies the published check-in and external-payment policy once using aggregate and entrant revisions.")
    checkIn(
        @path tournamentId: Uuid,
        @path entrantId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: EntrantCommand,
    ): TournamentOk<Entrant> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/entrants/{entrantId}/withdraw")
    @useAuth(BearerAuth)
    @operationId("withdrawTournamentEntrant")
    @summary("Withdraw an entrant")
    @doc("Ends the entrant without deleting history and promotes at most the first compatible FIFO candidate before seeding.")
    withdraw(
        @path tournamentId: Uuid,
        @path entrantId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: EntrantCommand,
    ): TournamentOk<Entrant> | TournamentMutationErrors;
    @put
    @route("/{tournamentId}/entrants/{entrantId}/payment-mark")
    @useAuth(BearerAuth)
    @operationId("markTournamentExternalPayment")
    @summary("Record external payment state")
    @doc("Stores a manual informational state only; no checkout, provider transaction, evidence, refund or payment credential is accepted.")
    payment(
        @path tournamentId: Uuid,
        @path entrantId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: PaymentMarkInput,
    ): TournamentOk<PaymentMark> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/seed")
    @useAuth(BearerAuth)
    @operationId("seedTournament")
    @summary("Freeze seeds and strategy snapshot")
    @doc("Locks the aggregate and persists ordered entrants, public unique lots and deterministic initial plan with a checksum.")
    seed(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: SeedInput,
    ): TournamentOk<TournamentPlan> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/start")
    @useAuth(BearerAuth)
    @operationId("startTournament")
    @summary("Start the seeded tournament")
    @doc("Starts only a checksum-valid seeded plan whose required initial dependencies are ready.")
    start(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedTournamentVersion,
    ): TournamentOk<Tournament> | TournamentMutationErrors;
    @get
    @route("/{tournamentId}/plan")
    @operationId("getTournamentPlan")
    @summary("Read bracket and standings")
    @doc("Returns the current public bracket and standings projection; restricted roster, payment, audit and correction reasons are omitted.")
    plan(@path tournamentId: Uuid, ...RequestHeaders): TournamentOk<TournamentPlan> | TournamentReadErrors;
    @post
    @route("/{tournamentId}/rounds/{roundId}/start")
    @useAuth(BearerAuth)
    @operationId("startTournamentRound")
    @summary("Start a ready round")
    @doc("Checks the round generation and all source matches in PostgreSQL; a retry cannot generate duplicate slots or matches.")
    startRound(
        @path tournamentId: Uuid,
        @path roundId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: StartRoundInput,
    ): TournamentOk<Round> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/rounds/{roundId}/complete")
    @useAuth(BearerAuth)
    @operationId("completeTournamentRound")
    @summary("Complete a terminal round")
    @doc("Commits deterministic next-round generation once after every required match is terminal and the projection checksum matches.")
    completeRound(
        @path tournamentId: Uuid,
        @path roundId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: CompleteRoundInput,
    ): TournamentOk<TournamentPlan> | TournamentMutationErrors;
    @put
    @route("/{tournamentId}/matches/{tournamentMatchId}/score")
    @useAuth(BearerAuth)
    @operationId("scoreTournamentMatch")
    @summary("Record a played score")
    @doc("Appends one authoritative result revision and advances projections once; draw scores are invalid for every built-in profile.")
    score(
        @path tournamentId: Uuid,
        @path tournamentMatchId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ScoreTournamentMatchInput,
    ): TournamentOk<TournamentMatch> | TournamentMutationErrors;
    @put
    @route("/{tournamentId}/matches/{tournamentMatchId}/walkover")
    @useAuth(BearerAuth)
    @operationId("recordTournamentWalkover")
    @summary("Record bye or walkover")
    @doc("Records one terminal bye, walkover or double walkover. An empty elimination source propagates without selecting a random winner.")
    walkover(
        @path tournamentId: Uuid,
        @path tournamentMatchId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: WalkoverTournamentMatchInput,
    ): TournamentOk<TournamentMatch> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/matches/{tournamentMatchId}/corrections")
    @useAuth(BearerAuth)
    @operationId("correctTournamentMatch")
    @summary("Append a result correction")
    @doc("Replaces an authoritative result only before a dependency starts. A later winner change pauses execution and permits only audited RESULT_STANDS or cancellation.")
    correct(
        @path tournamentId: Uuid,
        @path tournamentMatchId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: CorrectTournamentMatchInput,
    ): TournamentOk<TournamentPlan> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/pause")
    @useAuth(BearerAuth)
    @operationId("pauseTournament")
    @summary("Pause tournament execution")
    @doc("Stops new starts while preserving the immutable strategy snapshot, results and generated graph.")
    pause(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: TournamentReasonedCommand,
    ): TournamentOk<Tournament> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/resume")
    @useAuth(BearerAuth)
    @operationId("resumeTournament")
    @summary("Resume after deterministic recovery")
    @doc("Requires a rebuilt matching checksum and resolved closed reason; no worker may choose a winner to force recovery.")
    resume(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: TournamentReasonedCommand,
    ): TournamentOk<TournamentPlan> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/complete")
    @useAuth(BearerAuth)
    @operationId("completeTournament")
    @summary("Finalize unique standings")
    @doc("Creates exactly one completion marker only when all required matches are terminal and every final rank is unique.")
    complete(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ExpectedTournamentVersion,
    ): TournamentOk<TournamentPlan> | TournamentMutationErrors;
    @post
    @route("/{tournamentId}/cancel")
    @useAuth(BearerAuth)
    @operationId("cancelTournament")
    @summary("Cancel without deleting history")
    @doc("Organizer-only terminal transition that retains committed results and audit; external refunds remain outside PickleHub.")
    cancel(
        @path tournamentId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: TournamentReasonedCommand,
    ): TournamentNoContent | TournamentMutationErrors;
}
