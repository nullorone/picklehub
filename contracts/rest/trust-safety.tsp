using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum ReviewTag {
    RESPECT,
    COMMUNICATION,
    FAIR_PLAY,
}

enum SafetySignalKind {
    NO_SHOW,
    SAFETY,
    CONTENT,
    VENUE,
    RESULT,
}

enum SafetyReason {
    THREAT,
    HARASSMENT,
    HATE_OR_DISCRIMINATION,
    STALKING,
    PHYSICAL_SAFETY,
    OTHER_SAFETY,
}

enum ContentReportReason {
    SPAM,
    HARASSMENT,
    HATE,
    THREAT,
    OTHER,
}

enum TrustVenueReportReason {
    PRIVATE_RESIDENCE,
    DUPLICATE,
    CLOSED,
}

enum ResultReportReason {
    WRONG_SCORE,
    WRONG_WINNER,
    MATCH_NOT_PLAYED,
    OTHER,
}

enum NoShowReason {
    DID_NOT_ARRIVE,
    LEFT_BEFORE_PLAY,
    UNREACHABLE_AT_START,
}

enum NoShowResponseDisposition {
    AGREE,
    DISPUTE,
    PROVIDE_CONTEXT,
}

enum SafetyReceiptStatus {
    RECEIVED,
    IN_REVIEW,
    RESOLVED,
}

enum SafetyOutcomeClass {
    NO_ACTION,
    ACTION_TAKEN,
    ROUTED,
    CANNOT_REVIEW,
}

enum ReportTimeBucket {
    NOW,
    TODAY,
    LAST_7_DAYS,
    LAST_30_DAYS,
    OVER_30_DAYS,
}

enum ReportSourceKind {
    MATCH,
    CHAT_MESSAGE,
    PROFILE,
    VENUE,
    MATCH_RESULT,
}

@minLength(1)
@maxLength(500)
@doc("Normalized plain text. It is encrypted at rest and never copied to logs, analytics, audit or events.")
scalar ReviewText extends string;

@minLength(1)
@maxLength(2000)
@doc("Restricted plain text without active HTML, uploads or location fields. It is authenticated-encrypted at rest.")
scalar SafetyEvidenceText extends string;

model ReviewSubmission {
    @minValue(1) @maxValue(5) experienceRating: int32;
    @maxItems(3) tags: ReviewTag[];
    text?: ReviewText;
}

model OwnReview {
    reviewId: Uuid;
    matchId: Uuid;
    subjectPlayerId: Uuid;
    @minValue(1) revision: int32;
    @minValue(1) @maxValue(5) experienceRating: int32;
    @maxItems(3) tags: ReviewTag[];
    text: ReviewText | null;
    withdrawnAt: Timestamp | null;
    editableUntil: Timestamp;
    updatedAt: Timestamp;
}

model NoShowReportSubmission {
    subjectPlayerId: Uuid;
    reason: NoShowReason;
    evidence?: SafetyEvidenceText;
}

model SafetyIncidentReport {
    kind: "SAFETY";
    reason: SafetyReason;
    subjectPlayerId?: Uuid;
    sourceKind: ReportSourceKind;
    sourceId: Uuid;
    @minValue(1) sourceRevision: int64;
    timeBucket: ReportTimeBucket;
    evidence?: SafetyEvidenceText;
}

model ContentSafetyReport {
    kind: "CONTENT";
    reason: ContentReportReason;
    sourceKind: "CHAT_MESSAGE" | "MATCH" | "PROFILE";
    sourceId: Uuid;
    @minValue(1) sourceRevision: int64;
    evidence?: SafetyEvidenceText;
}

model VenueSafetyReport {
    kind: "VENUE";
    reason: TrustVenueReportReason;
    sourceKind: "VENUE";
    sourceId: Uuid;
    @minValue(1) sourceRevision: int64;
    evidence?: SafetyEvidenceText;
}

model ResultSafetyReport {
    kind: "RESULT";
    reason: ResultReportReason;
    sourceKind: "MATCH_RESULT";
    sourceId: Uuid;
    @minValue(1) sourceRevision: int64;
    evidence?: SafetyEvidenceText;
}

union ReportSubmission {
    safety: SafetyIncidentReport,
    content: ContentSafetyReport,
    venue: VenueSafetyReport,
    result: ResultSafetyReport,
}

model SafetyReceipt {
    receiptId: Uuid;
    kind: SafetySignalKind;
    status: SafetyReceiptStatus;
    outcome: SafetyOutcomeClass | null;

    @doc("Broad, safe policy reason intended for the reporting player; never a sanction detail or another party's response.")
    outcomeReason: string | null;

    canWithdraw: boolean;
    canRespond: boolean;
    canAppeal: boolean;
    appealDeadline: Timestamp | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

model SafetyReceiptPage {
    items: SafetyReceipt[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}

model OwnSafetyTextEntry {
    entryId: Uuid;
    text: SafetyEvidenceText;
    createdAt: Timestamp;
}

@doc("Caller-only detail. It may replay the caller's own retained text, but never another party's response or internal evidence.")
model OwnSafetyReportDetail {
    receipt: SafetyReceipt;
    submittedEvidence: SafetyEvidenceText | null;
    ownResponses: OwnSafetyTextEntry[];
    ownAppeal: OwnSafetyTextEntry | null;
}

model WithdrawalRequest {
    @doc("A withdrawal request is append-only and does not erase the signal or mandatory safety review.")
    requested: true;
}

model CaseResponseSubmission {
    noShowDisposition?: NoShowResponseDisposition;

    @doc("The response is visible only to its author and assigned reviewers, encrypted at rest and retained by policy.")
    text: SafetyEvidenceText;
}

model BlockPage {
    items: UserBlock[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}

model AppealSubmission {
    reason: "FACTUAL_ERROR" | "POLICY_MISAPPLIED" | "NEW_INFORMATION" | "OTHER";
    text?: SafetyEvidenceText;
}

model PublicReviewAggregate {
    available: boolean;
    @minValue(1) @maxValue(5) averageRating: float64 | null;
    @minValue(5) reviewCount: int64 | null;
    calculatedAt: Timestamp;
}

model TrustSafetyResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}

model TrustSafetyOk<T> {
    @statusCode statusCode: 200;
    ...TrustSafetyResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model TrustSafetyCreated<T> {
    @statusCode statusCode: 201;
    ...TrustSafetyResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model TrustSafetyNoContent {
    @statusCode statusCode: 204;
    ...TrustSafetyResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
}

model TrustSafetyError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model TrustSafetyFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...TrustSafetyResponseHeaders;
    @body body: TrustSafetyError<Code>;
}

@error
model TrustSafetyRateLimited {
    @statusCode statusCode: 429;
    ...TrustSafetyResponseHeaders;
    ...RetryAfterHeader;
    @body body: TrustSafetyError<"RATE_LIMITED">;
}

alias TrustSafetyReadErrors =
    | TrustSafetyFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR" | "CURSOR_EXPIRED">
    | TrustSafetyFailure<401, "SESSION_INVALID">
    | TrustSafetyFailure<404, "SAFETY_RECEIPT_NOT_FOUND" | "PROFILE_NOT_AVAILABLE">
    | TrustSafetyRateLimited;

alias TrustSafetyMutationErrors =
    | TrustSafetyFailure<400, "VALIDATION_FAILED" | "SUBMISSION_WINDOW_CLOSED" | "REPORT_NOT_ELIGIBLE">
    | TrustSafetyFailure<401, "SESSION_INVALID">
    | TrustSafetyFailure<403, "ONBOARDING_REQUIRED" | "CONSENT_REQUIRED" | "INTERACTION_NOT_ALLOWED">
    | TrustSafetyFailure<404, "SAFETY_RECEIPT_NOT_FOUND">
    | TrustSafetyFailure<409, "IDEMPOTENCY_KEY_REUSED" | "REVIEW_REVISION_CONFLICT" | "APPEAL_ALREADY_SUBMITTED">
    | TrustSafetyFailure<503, "SAFETY_WRITE_UNAVAILABLE">
    | TrustSafetyRateLimited;

@tag("TrustSafety")
@route("/matches/{matchId}/reviews/{subjectPlayerId}")
@useAuth(BearerAuth)
interface MatchReviews {
    @put
    @operationId("submitMatchReview")
    @summary("Create or replace the caller's review in its eligibility window")
    @doc("Keeps one effective author-subject-match review and appends an encrypted revision. Rating, tags and text are private; an unverified allegation is never published.")
    submit(
        @path matchId: Uuid,
        @path subjectPlayerId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: ReviewSubmission,
    ): TrustSafetyOk<OwnReview> | TrustSafetyCreated<OwnReview> | TrustSafetyMutationErrors;

    @delete
    @operationId("withdrawMatchReview")
    @summary("Withdraw the caller's effective review")
    @doc("Appends a withdrawal revision during the 14-day window. Retained history remains restricted and the public aggregate is reversibly rebuilt.")
    withdraw(
        @path matchId: Uuid,
        @path subjectPlayerId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
    ): TrustSafetyNoContent | TrustSafetyMutationErrors;
}

@tag("TrustSafety")
@route("/matches/{matchId}/no-show-reports")
@useAuth(BearerAuth)
interface MatchNoShowReports {
    @post
    @operationId("submitNoShowReport")
    @summary("Report a possible no-show")
    @doc("Creates one immutable reporter-subject-match signal. It never changes attendance or reputation until a final human moderation decision creates one authoritative effect.")
    submit(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: NoShowReportSubmission,
    ): TrustSafetyCreated<SafetyReceipt> | TrustSafetyOk<SafetyReceipt> | TrustSafetyMutationErrors;
}

@tag("TrustSafety")
@route("/safety-reports")
@useAuth(BearerAuth)
interface SafetyReports {
    @post
    @operationId("submitSafetyReport")
    @summary("Submit a safety, content, venue or result report")
    @doc("Validates access to the exact source revision, stores optional evidence only as authenticated ciphertext, and returns a minimal receipt. A result report alone never changes score or statistics.")
    submit(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: ReportSubmission):
        | TrustSafetyCreated<SafetyReceipt>
        | TrustSafetyOk<SafetyReceipt>
        | TrustSafetyMutationErrors;
}

@tag("TrustSafety")
@route("/me/safety-reports")
@useAuth(BearerAuth)
interface OwnSafetyReports {
    @get
    @operationId("listOwnSafetyReports")
    @summary("List the caller's minimal safety receipts")
    @doc("The cursor is bound to the authenticated reporter and snapshot. Case links, other reporters, target identity, evidence, assignment and sanctions are absent.")
    list(...RequestHeaders, ...PaginationParameters): TrustSafetyOk<SafetyReceiptPage> | TrustSafetyReadErrors;

    @get
    @route("/{receiptId}")
    @operationId("getOwnSafetyReport")
    @summary("Read one caller-owned safety receipt")
    @doc("A receipt belonging to anyone else returns the same SAFETY_RECEIPT_NOT_FOUND response as an absent receipt.")
    get(@path receiptId: Uuid, ...RequestHeaders): TrustSafetyOk<OwnSafetyReportDetail> | TrustSafetyReadErrors;

    @post
    @route("/{receiptId}/withdrawal")
    @operationId("requestSafetyReportWithdrawal")
    @summary("Request withdrawal without erasing the report")
    @doc("Records an append-only withdrawal intent. It does not erase accepted evidence, stop a mandatory safety review or imply that another party was notified.")
    requestWithdrawal(
        @path receiptId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: WithdrawalRequest,
    ): TrustSafetyOk<SafetyReceipt> | TrustSafetyMutationErrors;

    @post
    @route("/{receiptId}/responses")
    @operationId("respondToSafetyCase")
    @summary("Append a restricted response to an eligible case")
    @doc("Accepts one caller-authored encrypted response within the notified response window. It does not expose the reporter, other responses, evidence or internal notes.")
    respond(
        @path receiptId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: CaseResponseSubmission,
    ): TrustSafetyCreated<SafetyReceipt> | TrustSafetyMutationErrors;

    @post
    @route("/{receiptId}/appeals")
    @operationId("appealSafetyDecision")
    @summary("Submit the caller's one appeal for the current decision")
    @doc("The appeal window is 14 days after notice. It never exposes another party's evidence and requires a reviewer different from the original decision author.")
    appeal(
        @path receiptId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: AppealSubmission,
    ): TrustSafetyCreated<SafetyReceipt> | TrustSafetyMutationErrors;
}

@tag("TrustSafety")
@route("/me/blocks")
@useAuth(BearerAuth)
interface OwnBlocks {
    @get
    @operationId("listOwnBlocks")
    @summary("List active blocks created by the caller")
    @doc("Returns only caller-owned active preferences. It never reveals reciprocal blocks. Mutations remain at /communication-blocks/{blockedUserId} for backward compatibility and enforce the platform-wide direct-interaction deny.")
    list(...RequestHeaders, ...PaginationParameters): TrustSafetyOk<BlockPage> | TrustSafetyReadErrors;
}

@tag("TrustSafety")
@route("/players/{playerId}/reputation")
@useAuth(NoAuth | BearerAuth)
interface PlayerReputation {
    @get
    @operationId("getPublicPlayerReputation")
    @summary("Read the thresholded public review aggregate")
    @doc("Publishes only a reversible average after five eligible authors from distinct matches. Pending reports, text, tags, blocks, sanctions and no-show signals are never exposed; authenticated blocked/private/deleted lookups share PROFILE_NOT_AVAILABLE.")
    get(@path playerId: Uuid, ...RequestHeaders): TrustSafetyOk<PublicReviewAggregate> | TrustSafetyReadErrors;
}
