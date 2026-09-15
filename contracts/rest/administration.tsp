using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum PlatformRole {
    SUPERADMIN,
    MODERATOR,
    EDITOR,
    ADS_MANAGER,
}

enum AdminCapability {
    ADMIN_SESSION_ACCESS,
    ROLE_GRANT_MANAGE,
    USER_LOOKUP,
    SAFETY_CASE_ROUTE,
    SAFETY_CASE_DECIDE,
    USER_RESTRICT,
    VENUE_MODERATE,
    AUDIT_SEARCH,
    BREAK_GLASS_MANAGE,
    CONTENT_SOURCE_READ,
    CONTENT_SOURCE_PROPOSE,
    CONTENT_SOURCE_PAUSE,
    CONTENT_SOURCE_GOVERN,
    CONTENT_CANDIDATE_REVIEW,
    CONTENT_EDIT,
    CONTENT_PREVIEW,
    CONTENT_PUBLISH,
    CONTENT_EMERGENCY_UNPUBLISH,
    AD_CAMPAIGN_MANAGE,
    AD_CREATIVE_MANAGE,
    AD_PLACEMENT_MANAGE,
    AD_CAMPAIGN_REVIEW,
    AD_CAMPAIGN_PAUSE,
    AD_REPORT_READ,
    AD_PROVIDER_GOVERN,
}

enum AdminPurpose {
    SUPPORT,
    SECURITY,
    MODERATION,
    VENUE_QUALITY,
    ACCESS_GOVERNANCE,
    INCIDENT_RESPONSE,
}

enum AdminReasonCode {
    APPROVED_ACCESS_REQUEST,
    STAFF_DUTY_CHANGE,
    ACCESS_REVIEW,
    POLICY_VIOLATION,
    USER_SAFETY,
    DUPLICATE_VENUE,
    INVALID_VENUE,
    INCIDENT_RESPONSE,
    OTHER,
}

enum AdminRestrictionScope {
    DIRECT_INTERACTIONS,
    MATCH_CREATION,
    PLATFORM_ACCESS,
}

enum AdminRestrictionState {
    ACTIVE,
    REVOKED,
    EXPIRED,
}

enum AdminAssignmentState {
    UNASSIGNED,
    ASSIGNED_TO_ME,
    ASSIGNED_TO_OTHER,
}

enum AdminCaseState {
    OPEN,
    TRIAGED,
    ASSIGNED,
    INVESTIGATING,
    DECIDED,
    CLOSED,
    REOPENED,
}

enum AdminCasePriority {
    URGENT,
    HIGH,
    NORMAL,
}

enum AdminAgeBucket {
    LT_1_HOUR,
    H1_24,
    D1_7,
    D8_30,
    GT_30_DAYS,
}

enum AdminVenueQueueKind {
    CANDIDATE,
    REVISION,
    REPORT,
}

enum AdminVenueQueueState {
    AWAITING_MATCH_COMPLETION,
    PENDING_REVIEW,
    APPROVED,
    REJECTED,
    PENDING,
    RESOLVED,
    MERGED,
}

enum AdminVenueSourceClass {
    PLAYER,
    OSM,
    PROVIDER,
}

enum AdminVenueDecision {
    APPROVE,
    REJECT,
}

enum AuditOutcome {
    SUCCEEDED,
    DENIED,
    FAILED,
    CONFLICT,
}

@minLength(2)
@maxLength(96)
@pattern("^[A-Z][A-Z0-9_]{1,95}$")
scalar AdminActionCode extends string;

@minLength(2)
@maxLength(96)
@pattern("^[A-Z][A-Z0-9_]{1,95}$")
scalar AdminTargetType extends string;

@minLength(1)
@maxLength(128)
@pattern("^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
scalar PolicyVersion extends string;

@minLength(1)
@maxLength(160)
@doc("Opaque approval, incident or ticket reference. It must not contain narrative or personal data.")
scalar AdminReference extends string;

@minLength(1)
@maxLength(500)
@doc("Restricted exception justification. It is never copied to generic audit, telemetry, cursors or events.")
scalar AdminJustification extends string;

@minLength(1)
@maxLength(64)
@doc("One-time server-issued confirmation proof bound to actor, action, exact target, consequences and a short expiry.")
scalar AdminConfirmationToken extends string;

@minLength(1)
@maxLength(320)
@doc("Exact normalized identity lookup value. It is transient request data and must never be retained outside identity lookup.")
scalar AdminExactIdentity extends string;

model AdminPagination {
    @query cursor?: Cursor;

    @query
    @minValue(1)
    @maxValue(100)
    limit?: int32 = 25;
}

model AdminMutationContext {
    reasonCode: AdminReasonCode;
    policyVersion: PolicyVersion;
    @minValue(0) expectedRevision: int64;
    confirmationToken?: AdminConfirmationToken;
}

model AdminSessionContext {
    sessionId: Uuid;
    activeRole: PlatformRole;
    @maxItems(9) capabilities: AdminCapability[];
    mfaVerifiedAt: Timestamp;
    reauthenticatedAt: Timestamp | null;
    idleExpiresAt: Timestamp;
    absoluteExpiresAt: Timestamp;
}

model PlatformRoleGrant {
    grantId: Uuid;
    subjectUserId: Uuid;
    role: PlatformRole;
    revision: int64;
    validUntil: Timestamp | null;
    reviewAt: Timestamp;
    revokedAt: Timestamp | null;
}

model CreateRoleGrant {
    ...AdminMutationContext;
    subjectUserId: Uuid;
    role: PlatformRole;
    approvalReference: AdminReference;
    validUntil?: Timestamp;
    reviewAt: Timestamp;
}

model RevokeRoleGrant {
    ...AdminMutationContext;
}

union AdminUserLookupKey {
    user: {
        userId: Uuid,
    },
    receipt: {
        receiptId: Uuid,
    },
    email: {
        exactEmail: EmailInput,
    },
    telegram: {
        exactTelegramSubject: AdminExactIdentity,
    },
}

model AdminUserLookupRequest {
    purpose: AdminPurpose;
    key: AdminUserLookupKey;
    includeMaskedIdentity?: boolean = false;
}

model AdminUserProjection {
    userId: Uuid;
    accountState: "ACTIVE" | "DELETION_PENDING" | "DELETED";
    displayName: string | null;
    maskedIdentity: string | null;
    @maxItems(3) restrictionScopes: AdminRestrictionScope[];
}

model AdminCaseSummary {
    caseId: Uuid;
    kind: SafetySignalKind;
    state: AdminCaseState;
    priority: AdminCasePriority;
    assignmentState: AdminAssignmentState;
    actionableAt: Timestamp;
    revision: int64;
}

model AdminCasePage {
    items: AdminCaseSummary[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}

model AdminCaseDetail {
    summary: AdminCaseSummary;
    sourceCount: int32;
    policyVersion: PolicyVersion;
    restrictedNarrative: SafetyEvidenceText | null;
    restrictedResponses: SafetyEvidenceText[] | null;
    restrictedAppeal: SafetyEvidenceText | null;
}

model AssignAdminCase {
    ...AdminMutationContext;
    assigneeUserId: Uuid;
}

model DecideAdminCase {
    ...AdminMutationContext;
    outcome:
        | "NO_VIOLATION"
        | "CONTENT_RESTRICTED"
        | "WARNING"
        | "INTERACTION_RESTRICTED"
        | "ACCOUNT_RESTRICTED"
        | "NO_SHOW_CONFIRMED"
        | "RESULT_CORRECTED"
        | "VENUE_ROUTED";
    restrictionScope?: AdminRestrictionScope;
    restrictionExpiresAt?: Timestamp;
}

model UserRestriction {
    restrictionId: Uuid;
    userId: Uuid;
    decisionId: Uuid;
    scope: AdminRestrictionScope;
    state: AdminRestrictionState;
    revision: int64;
    expiresAt: Timestamp | null;
    createdAt: Timestamp;
    revokedAt: Timestamp | null;
}

model ChangeUserRestriction {
    ...AdminMutationContext;
    decisionId: Uuid;
    scope: AdminRestrictionScope;
    expiresAt?: Timestamp;
}

model RevokeUserRestriction {
    ...AdminMutationContext;
}

model AdminVenueQueueItem {
    itemId: Uuid;
    kind: AdminVenueQueueKind;
    state: AdminVenueQueueState;
    sourceClass: AdminVenueSourceClass;
    locality: string;
    ageBucket: AdminAgeBucket;
    revision: int64;
    createdAt: Timestamp;
}

model AdminVenueQueuePage {
    items: AdminVenueQueueItem[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}

model AdminVenueCandidateDetail {
    item: AdminVenueQueueItem;
    name: string;
    normalizedAddress: string;
    longitude: float64;
    latitude: float64;
    @maxItems(20) provenance: string[];
    @maxItems(20) nearbyPublishedVenueIds: Uuid[];
}

model DecideAdminVenue {
    ...AdminMutationContext;
    decision: AdminVenueDecision;
}

model MergeAdminVenue {
    ...AdminMutationContext;
    survivorVenueId: Uuid;
    duplicateVenueId: Uuid;
}

model BreakGlassGrant {
    grantId: Uuid;
    caseId: Uuid;
    incidentReference: AdminReference;
    expiresAt: Timestamp;
    revokedAt: Timestamp | null;
    revision: int64;
}

model CreateBreakGlassGrant {
    ...AdminMutationContext;
    caseId: Uuid;
    incidentReference: AdminReference;
    justification: AdminJustification;

    @doc("Requested expiry. The server rejects durations over 30 minutes and never extends a grant in place.")
    expiresAt: Timestamp;
}

model RevokeBreakGlassGrant {
    ...AdminMutationContext;
}

model SafeChangedFields {
    @maxItems(32) names: AdminActionCode[];
}

model AuditEntry {
    auditEntryId: Uuid;
    operationId: Uuid;
    actorType: "ADMIN" | "SYSTEM";
    actorId: Uuid | null;
    action: AdminActionCode;
    targetType: AdminTargetType;
    targetId: Uuid;
    outcome: AuditOutcome;
    reasonCode: AdminReasonCode;
    policyVersion: PolicyVersion;
    changedFields: SafeChangedFields;
    requestId: RequestId;
    correlationId: CorrelationId;
    source: AdminTargetType;
    createdAt: Timestamp;
}

model AuditEntryPage {
    items: AuditEntry[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}

model AdminResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}

model AdminOk<T> {
    @statusCode statusCode: 200;
    ...AdminResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model AdminCreated<T> {
    @statusCode statusCode: 201;
    ...AdminResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model AdminError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model AdminFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...AdminResponseHeaders;
    @body body: AdminError<Code>;
}

alias AdminReadErrors =
    | AdminFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR" | "CURSOR_EXPIRED" | "INVALID_TIME_RANGE">
    | AdminFailure<401, "ADMIN_SESSION_INVALID">
    | AdminFailure<403, "CAPABILITY_REQUIRED" | "ASSIGNMENT_REQUIRED" | "CONFLICT_OF_INTEREST" | "BREAK_GLASS_REQUIRED">
    | AdminFailure<404, "ADMIN_RESOURCE_NOT_FOUND">
    | AdminFailure<429, "RATE_LIMITED">
    | AdminFailure<503, "ADMIN_AUTHORIZATION_UNAVAILABLE" | "AUDIT_UNAVAILABLE">;

alias AdminMutationErrors =
    | AdminFailure<400, "VALIDATION_FAILED" | "CONFIRMATION_REQUIRED">
    | AdminFailure<401, "ADMIN_SESSION_INVALID">
    | AdminFailure<403, "CAPABILITY_REQUIRED" | "REAUTH_REQUIRED" | "ASSIGNMENT_REQUIRED" | "CONFLICT_OF_INTEREST">
    | AdminFailure<404, "ADMIN_RESOURCE_NOT_FOUND">
    | AdminFailure<409, "IDEMPOTENCY_KEY_REUSED" | "REVISION_CONFLICT" | "CONFLICTING_ACTIVE_GRANT">
    | AdminFailure<429, "RATE_LIMITED">
    | AdminFailure<503, "ADMIN_WRITE_UNAVAILABLE" | "AUDIT_UNAVAILABLE">;

@tag("Administration")
@route("/admin")
@useAuth(BearerAuth)
interface Administration {
    @get
    @route("/session")
    @operationId("getAdminSession")
    @extension("x-admin-capability", "ADMIN_SESSION_ACCESS")
    @extension("x-admin-roles", #["SUPERADMIN", "MODERATOR", "EDITOR", "ADS_MANAGER"])
    @summary("Read the active admin session")
    @doc("Requires a separate admin audience, an active code-defined platform role and phishing-resistant MFA. A player session receives 401; a role never implies wildcard capabilities.")
    session(...RequestHeaders): AdminOk<AdminSessionContext> | AdminReadErrors;

    @post
    @route("/role-grants")
    @operationId("createAdminRoleGrant")
    @extension("x-admin-capability", "ROLE_GRANT_MANAGE")
    @extension("x-admin-roles", #["SUPERADMIN"])
    @summary("Grant a fixed platform role")
    @doc("SUPERADMIN only. Self-grant is forbidden; fresh re-auth and a one-time confirmation are required. The grant and its audit entry commit atomically.")
    grantRole(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: CreateRoleGrant):
        | AdminCreated<PlatformRoleGrant>
        | AdminMutationErrors;

    @post
    @route("/role-grants/{grantId}/revoke")
    @operationId("revokeAdminRoleGrant")
    @extension("x-admin-capability", "ROLE_GRANT_MANAGE")
    @extension("x-admin-roles", #["SUPERADMIN"])
    @summary("Revoke a platform role grant")
    @doc("SUPERADMIN only. Revocation advances the grant and session epochs atomically with audit; an inaccessible or absent grant returns the same 404.")
    revokeRole(
        @path grantId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: RevokeRoleGrant,
    ): AdminOk<PlatformRoleGrant> | AdminMutationErrors;

    @post
    @route("/users/lookup")
    @operationId("lookupAdminUser")
    @extension("x-admin-capability", "USER_LOOKUP")
    @extension("x-admin-roles", #["SUPERADMIN", "MODERATOR"])
    @summary("Look up one exact user")
    @doc("Exact lookup only. The key is accepted in the body and is never logged, audited, retained, placed in a cursor or sent to analytics. Partial search, browse-all and enumeration are absent.")
    lookupUser(...RequestHeaders, ...BrowserMutationHeaders, @body body: AdminUserLookupRequest):
        | AdminOk<AdminUserProjection>
        | AdminReadErrors;

    @get
    @route("/cases")
    @operationId("listAdminCases")
    @extension("x-admin-capability", "SAFETY_CASE_ROUTE")
    @extension("x-admin-roles", #["SUPERADMIN", "MODERATOR"])
    @summary("List safe moderation case metadata")
    @doc("Routing metadata only. Cursor is signed and bound to actor, active role, capability, purpose, filters and snapshot. EDITOR and ADS_MANAGER receive 403; out-of-scope details use the same 404 as absent resources.")
    listCases(
        ...RequestHeaders,
        ...AdminPagination,
        @query kind?: SafetySignalKind,
        @query state?: AdminCaseState,
        @query priority?: AdminCasePriority,
        @query assignment?: AdminAssignmentState,
        @query age?: AdminAgeBucket,
    ): AdminOk<AdminCasePage> | AdminReadErrors;

    @get
    @route("/cases/{caseId}")
    @operationId("getAdminCase")
    @extension("x-admin-capability", "SAFETY_CASE_ROUTE")
    @extension("x-admin-roles", #["SUPERADMIN", "MODERATOR"])
    @extension("x-admin-resource-policy", "ASSIGNMENT_OR_EXACT_CASE_BREAK_GLASS")
    @summary("Read an authorized moderation case")
    @doc("Narrative is present only for the assigned conflict-free MODERATOR or an active grant for this exact case. SUPERADMIN alone is insufficient. Absence and lack of resource scope are indistinguishable 404 responses.")
    getCase(@path caseId: Uuid, ...RequestHeaders): AdminOk<AdminCaseDetail> | AdminReadErrors;

    @post
    @route("/cases/{caseId}/assignment")
    @operationId("assignAdminCase")
    @extension("x-admin-capability", "SAFETY_CASE_ROUTE")
    @extension("x-admin-roles", #["SUPERADMIN", "MODERATOR"])
    @summary("Assign a moderation case")
    @doc("Checks routing capability, conflict and expected case revision. Assignment, outbox and minimal audit are one owning-module transaction.")
    assignCase(
        @path caseId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: AssignAdminCase,
    ): AdminOk<AdminCaseSummary> | AdminMutationErrors;

    @post
    @route("/cases/{caseId}/decision")
    @operationId("decideAdminCase")
    @extension("x-admin-capability", "SAFETY_CASE_DECIDE")
    @extension("x-admin-roles", #["MODERATOR"])
    @extension("x-admin-resource-policy", "ASSIGNED_NO_CONFLICT")
    @summary("Decide an assigned moderation case")
    @doc("Assigned conflict-free MODERATOR only. Decision, versioned effect, outbox and audit commit atomically; break-glass never grants decision capability.")
    decideCase(
        @path caseId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: DecideAdminCase,
    ): AdminOk<AdminCaseSummary> | AdminMutationErrors;

    @post
    @route("/users/{userId}/restrictions")
    @operationId("createAdminUserRestriction")
    @extension("x-admin-capability", "USER_RESTRICT")
    @extension("x-admin-roles", #["MODERATOR"])
    @extension("x-admin-resource-policy", "DECISION_TARGET_MATCH")
    @summary("Create a policy-backed user restriction")
    @doc("Creates the narrowest policy-backed restriction from a moderation decision. Permanent or platform-wide scope additionally requires fresh re-auth and explicit confirmation.")
    restrictUser(
        @path userId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ChangeUserRestriction,
    ): AdminCreated<UserRestriction> | AdminMutationErrors;

    @post
    @route("/users/{userId}/restrictions/{restrictionId}/revoke")
    @operationId("revokeAdminUserRestriction")
    @extension("x-admin-capability", "USER_RESTRICT")
    @extension("x-admin-roles", #["MODERATOR"])
    @extension("x-admin-resource-policy", "DECISION_TARGET_MATCH")
    @summary("Revoke a user restriction")
    @doc("Appends a reversal of the effective restriction. Hard deletion is unavailable; stale revisions have no effect or audit success.")
    revokeRestriction(
        @path userId: Uuid,
        @path restrictionId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: RevokeUserRestriction,
    ): AdminOk<UserRestriction> | AdminMutationErrors;

    @get
    @route("/venue-candidates")
    @operationId("listAdminVenueCandidates")
    @extension("x-admin-capability", "VENUE_MODERATE")
    @extension("x-admin-roles", #["MODERATOR"])
    @summary("List venue moderation work")
    @doc("MODERATOR venue queue. Cursor and allowlisted filters are actor/capability/purpose/snapshot bound; exact coordinates are omitted from list rows.")
    listVenues(
        ...RequestHeaders,
        ...AdminPagination,
        @query kind?: AdminVenueQueueKind,
        @query state?: AdminVenueQueueState,
        @query sourceClass?: AdminVenueSourceClass,
        @query locality?: string,
        @query age?: AdminAgeBucket,
    ): AdminOk<AdminVenueQueuePage> | AdminReadErrors;

    @get
    @route("/venue-candidates/{itemId}")
    @operationId("getAdminVenueCandidate")
    @extension("x-admin-capability", "VENUE_MODERATE")
    @extension("x-admin-roles", #["MODERATOR"])
    @summary("Read a venue moderation item")
    @doc("Authorized card-only projection with provenance and bounded nearby published venues. A foreign or absent item uses the same 404.")
    getVenue(@path itemId: Uuid, ...RequestHeaders): AdminOk<AdminVenueCandidateDetail> | AdminReadErrors;

    @post
    @route("/venue-candidates/{itemId}/decision")
    @operationId("decideAdminVenueCandidate")
    @extension("x-admin-capability", "VENUE_MODERATE")
    @extension("x-admin-roles", #["MODERATOR"])
    @summary("Approve or reject a venue item")
    @doc("Approve or reject under candidate lock and expected revision. Publication or terminal state, provenance, outbox and audit commit atomically.")
    decideVenue(
        @path itemId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: DecideAdminVenue,
    ): AdminOk<AdminVenueQueueItem> | AdminMutationErrors;

    @post
    @route("/venue-candidates/{itemId}/merge")
    @operationId("mergeAdminVenueCandidate")
    @extension("x-admin-capability", "VENUE_MODERATE")
    @extension("x-admin-roles", #["MODERATOR"])
    @summary("Merge a duplicate venue into a survivor")
    @doc("Requires explicit distinct survivor and duplicate IDs, fresh re-auth and one-time confirmation. A stale revision leaves canonical routing unchanged.")
    mergeVenue(
        @path itemId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: MergeAdminVenue,
    ): AdminOk<AdminVenueQueueItem> | AdminMutationErrors;

    @get
    @route("/audit")
    @operationId("searchAdminAudit")
    @extension("x-admin-capability", "AUDIT_SEARCH")
    @extension("x-admin-roles", #["SUPERADMIN", "MODERATOR"])
    @extension("x-admin-resource-policy", "ROLE_SCOPED_AUDIT")
    @summary("Search immutable security audit")
    @doc("Allowlisted search over at most 31 UTC days. Narrative, evidence, identity query, before/after and exact totals are neither searchable nor returned. The search itself is audited.")
    searchAudit(
        ...RequestHeaders,
        ...AdminPagination,
        @query from: Timestamp,
        @query to: Timestamp,
        @query actorId?: Uuid,
        @query action?: AdminActionCode,
        @query targetType?: AdminTargetType,
        @query targetId?: Uuid,
        @query outcome?: AuditOutcome,
        @query("requestId") requestIdFilter?: RequestId,
        @query("correlationId") correlationIdFilter?: CorrelationId,
    ): AdminOk<AuditEntryPage> | AdminReadErrors;

    @post
    @route("/break-glass-grants")
    @operationId("createAdminBreakGlassGrant")
    @extension("x-admin-capability", "BREAK_GLASS_MANAGE")
    @extension("x-admin-roles", #["SUPERADMIN"])
    @summary("Create an exact-case break-glass grant")
    @doc("SUPERADMIN-only exact-case exception, disabled until operational notification and review exist. Requires fresh MFA, expires within 30 minutes, and cannot enable queue browse, export or decision.")
    createBreakGlass(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: CreateBreakGlassGrant):
        | AdminCreated<BreakGlassGrant>
        | AdminMutationErrors;

    @post
    @route("/break-glass-grants/{grantId}/revoke")
    @operationId("revokeAdminBreakGlassGrant")
    @extension("x-admin-capability", "BREAK_GLASS_MANAGE")
    @extension("x-admin-roles", #["SUPERADMIN"])
    @summary("Revoke a break-glass grant")
    @doc("Revokes rather than extends the exact-case grant. Grant, permitted and denied reads, revocation and expiry each create separate minimal audit entries.")
    revokeBreakGlass(
        @path grantId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: RevokeBreakGlassGrant,
    ): AdminOk<BreakGlassGrant> | AdminMutationErrors;
}
