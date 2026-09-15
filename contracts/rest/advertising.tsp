using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum AdDecisionSource {
    DIRECT,
    EXTERNAL_FALLBACK,
    HOUSE,
    NO_FILL,
}

enum AdNoFillReason {
    NO_ELIGIBLE_CAMPAIGN,
    PLACEMENT_PAUSED,
    CRITICAL_STATE,
    FREQUENCY_CAPPED,
    BUDGET_EXHAUSTED,
    COUNTER_UNAVAILABLE,
    PROVIDER_DISABLED,
    PROVIDER_CONSENT_REQUIRED,
    PROVIDER_TIMEOUT,
    CREATIVE_REJECTED,
}

enum AdClientKind {
    WEB,
    TMA,
    MOBILE,
}

enum AdFormFactor {
    NARROW,
    REGULAR,
    WIDE,
}

enum AdConnectivityClass {
    OFFLINE,
    CONSTRAINED,
    REGULAR,
}

enum AdCreativeFormat {
    STATIC_IMAGE,
    TEXT_IMAGE_CARD,
}

enum AdCampaignState {
    DRAFT,
    IN_REVIEW,
    APPROVED,
    SCHEDULED,
    ACTIVE,
    PAUSED,
    EXHAUSTED,
    COMPLETED,
    REJECTED,
}

enum AdReviewDecision {
    SUBMIT,
    APPROVE,
    REJECT,
}

enum AdBillingModel {
    CPM,
    CPC,
    FIXED_SPONSORSHIP,
}

enum AdPriorityTier {
    HOUSE_EMERGENCY,
    GUARANTEED_DIRECT,
    STANDARD_DIRECT,
}

enum AdTargetDimension {
    SURFACE,
    CLIENT_KIND,
    LOCALE,
    FORM_FACTOR,
    OBJECT_CLASS,
    CONTENT_CATEGORY,
    COUNTRY,
    REGION,
    CITY,
    CONNECTIVITY,
}

enum AdTargetOperator {
    INCLUDE,
    EXCLUDE,
}

enum AdDeliveryEventKind {
    ISSUED,
    VIEWABLE_IMPRESSION,
    VALID_CLICK,
    INVALID_CLICK,
    RESERVATION_RELEASED,
}

enum AdInvalidReason {
    REPLAY,
    EXPIRED,
    NOT_VIEWABLE,
    BACKGROUND,
    UNTRUSTED_ACTIVATION,
    RATE_LIMITED,
    AUTOMATED_TRAFFIC,
    POLICY_UNAVAILABLE,
}

enum AdPauseReason {
    MANUAL,
    BUDGET_GUARD,
    PRODUCT_GUARDRAIL,
    ACCESSIBILITY,
    PRIVACY,
    SAFETY,
    LEGAL,
    PROVIDER_REVIEW_EXPIRED,
    INCIDENT,
}

@pattern("^[A-Z0-9]+(?:_[A-Z0-9]+)*$")
@minLength(3)
@maxLength(80)
scalar AdPlacementCode extends string;

@pattern("^[A-Z0-9]+(?:_[A-Z0-9]+)*$")
@minLength(2)
@maxLength(80)
scalar AdContextCode extends string;

@pattern("^[A-Za-z0-9_-]{43,256}$")
@doc("Opaque signed purpose-bound capability. It is never a targeting dimension and must never be logged.")
@example("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
scalar AdOpaqueToken extends string;

@format("uri")
@pattern("^https://")
@maxLength(2048)
@example("https://ads.example.test/approved")
scalar AdHttpsUrl extends string;

@pattern("^[A-Z]{3}$")
scalar AdCurrency extends string;

@pattern("^[1-9][0-9]*\\.[0-9]+\\.[0-9]+$")
@maxLength(32)
scalar AdPolicyVersion extends string;

model AdCoarseGeography {
    @pattern("^[A-Z]{2}$")
    countryCode: string;

    @maxLength(100)
    regionCode?: string;

    @maxLength(120)
    cityCode?: string;
}

@doc("Allowlisted context of the current surface only. URLs, object identifiers, coordinates, identity and history have no representation.")
model AdDecisionContext {
    placementCode: AdPlacementCode;
    surface: AdContextCode;
    clientKind: AdClientKind;
    locale: Locale;
    formFactor: AdFormFactor;
    objectClass?: AdContextCode;
    contentCategory?: AdContextCode;
    geography?: AdCoarseGeography;
    connectivity: AdConnectivityClass;
    criticalState: boolean;
    providerConsent: boolean;

    @doc("Purpose-bound first-party cap capability. It limits frequency but never participates in campaign eligibility.")
    capToken?: AdOpaqueToken;
}

model AdDecisionRequest {
    context: AdDecisionContext;
}

model AdLegalLabel {
    label: "Реклама";
    advertiserName: string;
    registrationToken: string | null;
    disclosure: string | null;
}

model AdCreativeAsset {
    format: AdCreativeFormat;
    assetUrl: AdHttpsUrl;

    @pattern("^image/(?:avif|jpeg|png|webp)$")
    @example("image/webp")
    mediaType: string;

    @minValue(1)
    @maxValue(1048576)
    byteLength: int64;

    @minLength(1)
    @maxLength(500)
    altText: string;

    headline: string | null;
    body: string | null;
}

model AdCreativeDecision {
    source: "DIRECT" | "EXTERNAL_FALLBACK" | "HOUSE";
    deliveryToken: AdOpaqueToken;
    clickToken: AdOpaqueToken;
    campaignId: Uuid;
    campaignRevisionId: Uuid;
    creativeId: Uuid;
    placementId: Uuid;
    expiresAt: Timestamp;
    refreshAfterSeconds: 300;
    legal: AdLegalLabel;
    creative: AdCreativeAsset;
}

model AdNoFillDecision {
    source: "NO_FILL";
    reason: AdNoFillReason;
    retryAfterSeconds: int32 | null;
}

@example(#{ source: "NO_FILL", reason: AdNoFillReason.NO_ELIGIBLE_CAMPAIGN, retryAfterSeconds: null })
union AdDecision {
    AdCreativeDecision,
    AdNoFillDecision,
}

model AdViewableImpressionInput {
    deliveryToken: AdOpaqueToken;

    @minValue(50)
    @maxValue(100)
    visiblePercent: int32;

    @minValue(1000)
    @maxValue(600000)
    continuousForegroundMilliseconds: int32;
}

model AdMeasurementReceipt {
    receiptId: Uuid;
    event: AdDeliveryEventKind;
    accepted: boolean;
    duplicate: boolean;
    invalidReason: AdInvalidReason | null;
    recordedAt: Timestamp;
}

model AdClickInput {
    clickToken: AdOpaqueToken;
    trustedActivation: boolean;
}

model AdClickReceipt extends AdMeasurementReceipt {
    @doc("Exact approved HTTPS destination. The client opens it only after an accepted trusted activation.")
    redirectUrl: AdHttpsUrl | null;
}

model AdPlacement {
    id: Uuid;
    version: int64;
    code: AdPlacementCode;
    surface: AdContextCode;
    format: AdCreativeFormat;
    enabled: boolean;
    fallbackEnabled: boolean;
    minimumWidth: int32;
    minimumHeight: int32;
    updatedAt: Timestamp;
}

model AdPlacementInput {
    expectedVersion: int64;
    code: AdPlacementCode;
    surface: AdContextCode;
    format: AdCreativeFormat;
    enabled: boolean;
    fallbackEnabled: boolean;

    @minValue(1)
    @maxValue(4096)
    minimumWidth: int32;

    @minValue(1)
    @maxValue(4096)
    minimumHeight: int32;
}

model AdTargetRuleInput {
    dimension: AdTargetDimension;
    operator: AdTargetOperator;

    @minItems(1)
    @maxItems(100)
    values: AdContextCode[];
}

model AdCreativeInput {
    campaignId: Uuid;
    expectedCampaignVersion: int64;
    format: AdCreativeFormat;
    assetId: Uuid;
    mediaType: string;
    byteLength: int64;
    sha256: Sha256;
    altText: string;
    headline?: string;
    body?: string;
    landingUrl: AdHttpsUrl;

    @maxItems(10)
    approvedRedirectHosts: string[];
}

model AdCreativeRecord {
    id: Uuid;
    campaignId: Uuid;
    revision: int32;
    format: AdCreativeFormat;
    assetId: Uuid;
    altText: string;
    landingUrl: AdHttpsUrl;
    immutable: boolean;
    createdAt: Timestamp;
}

model AdCampaignInput {
    advertiserName: string;
    advertiserLegalId: string;
    timezone: TimeZone;
    startsAt: Timestamp;
    endsAt: Timestamp;
    currency: AdCurrency;

    @minValue(1)
    budgetMinor: int64;

    billingModel: AdBillingModel;

    @minValue(0)
    rateMinor: int64;

    priorityTier: AdPriorityTier;

    @minValue(1)
    @maxValue(3)
    cap24Hours: int32;

    @minValue(1)
    @maxValue(10)
    cap7Days: int32;

    placementIds: Uuid[];
    targetRules: AdTargetRuleInput[];
    legalLabel: AdLegalLabel;
    policyVersion: AdPolicyVersion;
}

model AdCampaignRevisionInput extends AdCampaignInput {
    expectedVersion: int64;
    creativeIds: Uuid[];
}

model AdCampaign {
    id: Uuid;
    version: int64;
    state: AdCampaignState;
    currentRevisionId: Uuid | null;
    approvedRevisionId: Uuid | null;
    advertiserName: string;
    startsAt: Timestamp;
    endsAt: Timestamp;
    currency: AdCurrency;
    budgetMinor: int64;
    reservedMinor: int64;
    spentMinor: int64;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

model AdCampaignRevision {
    id: Uuid;
    campaignId: Uuid;
    revision: int32;
    snapshot: AdCampaignRevisionInput;
    snapshotHash: Sha256;
    approvedAt: Timestamp | null;
    createdAt: Timestamp;
}

model AdCampaignDecisionInput {
    expectedVersion: int64;
    revisionId: Uuid;
    decision: AdReviewDecision;
    reason: AdPauseReason;
    checklistVersion: AdPolicyVersion;
    independentReviewer: boolean;
}

model AdCampaignStateInput {
    expectedVersion: int64;
    reason: AdPauseReason;
}

model AdProviderState {
    code: AdContextCode;
    enabled: boolean;
    reviewState: ContentReviewState;
    reviewDueAt: Timestamp;
    policyVersion: AdPolicyVersion;
    allowedFields: AdTargetDimension[];
    updatedAt: Timestamp;
}

model AdProviderStateInput {
    expectedVersion: int64;
    enabled: boolean;
    reason: AdPauseReason;
    termsUrl: AdHttpsUrl;
    termsVersion: string;
    reviewDueAt: Timestamp;
    policyVersion: AdPolicyVersion;
    allowedFields: AdTargetDimension[];
}

model AdReportInput {
    campaignId?: Uuid;
    creativeId?: Uuid;
    placementId?: Uuid;
    from: Timestamp;
    until: Timestamp;
}

model AdReportRow {
    day: string;
    campaignId: Uuid;
    creativeId: Uuid | null;
    placementId: Uuid | null;
    eligible: int64;
    served: int64;
    viewable: int64;
    validClicks: int64;
    invalidEvents: int64;
    spendMinor: int64;
    suppressed: boolean;
}

model AdReport {
    rows: AdReportRow[];
    minimumCohortSize: 20;
    generatedAt: Timestamp;
}

model AdPage<T> {
    items: T[];
    pageInfo: PageInfo;
}

model AdPrivateHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "private, no-store";
}

model AdOk<T> {
    @statusCode statusCode: 200;
    ...AdPrivateHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model AdCreated<T> {
    @statusCode statusCode: 201;
    ...AdPrivateHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model AdError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model AdFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...AdPrivateHeaders;
    @body body: AdError<Code>;
}

alias AdDecisionErrors = AdFailure<400, "VALIDATION_FAILED"> | AdFailure<429, "RATE_LIMITED">;

alias AdMeasurementErrors =
    | AdFailure<400, "VALIDATION_FAILED">
    | AdFailure<409, "IDEMPOTENCY_KEY_REUSED" | "TOKEN_REPLAYED">
    | AdFailure<410, "DELIVERY_TOKEN_EXPIRED">
    | AdFailure<429, "RATE_LIMITED">
    | AdFailure<503, "AD_POLICY_UNAVAILABLE">;

alias AdAdminErrors =
    | AdFailure<400, "VALIDATION_FAILED" | "INVALID_STATE_TRANSITION" | "INVALID_TIME_RANGE">
    | AdFailure<401, "ADMIN_SESSION_INVALID" | "REAUTH_REQUIRED">
    | AdFailure<403, "CAPABILITY_REQUIRED" | "CONFLICT_OF_INTEREST">
    | AdFailure<404, "AD_RESOURCE_NOT_FOUND">
    | AdFailure<409, "REVISION_CONFLICT" | "IDEMPOTENCY_KEY_REUSED" | "BUDGET_CONFLICT">
    | AdFailure<422, "APPROVAL_REQUIRED" | "LEGAL_EVIDENCE_REQUIRED" | "TARGETING_REJECTED">
    | AdFailure<429, "RATE_LIMITED">
    | AdFailure<503, "AD_WRITE_UNAVAILABLE" | "AUDIT_UNAVAILABLE">;

@tag("Advertising")
@route("/advertising")
@useAuth(NoAuth)
interface AdvertisingDelivery {
    @post
    @route("/decisions")
    @operationId("selectAdvertisingDecision")
    @summary("Select an advertising decision")
    @doc("Selects from allowlisted current context only. DIRECT, EXTERNAL_FALLBACK, HOUSE and NO_FILL are explicit; no-fill never blocks product content.")
    decide(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: AdDecisionRequest):
        | AdOk<AdDecision>
        | AdDecisionErrors;

    @post
    @route("/impressions")
    @operationId("recordViewableAdvertisingImpression")
    @summary("Record a viewable advertising impression")
    @doc("Consumes a short-lived delivery token only after at least 50 percent was continuously visible for one foreground second. Issue/render alone is not an impression.")
    impression(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: AdViewableImpressionInput):
        | AdOk<AdMeasurementReceipt>
        | AdMeasurementErrors;

    @post
    @route("/clicks")
    @operationId("recordAdvertisingClick")
    @summary("Validate an advertising click")
    @doc("Consumes the click token once after trusted activation and returns only the exact approved HTTPS destination plus an idempotent receipt. No redirect tracker is accepted.")
    click(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: AdClickInput):
        | AdOk<AdClickReceipt>
        | AdMeasurementErrors;
}

@tag("Advertising")
@route("/admin/advertising")
@useAuth(BearerAuth)
interface AdvertisingAdministration {
    @get
    @route("/placements")
    @operationId("listAdminAdPlacements")
    @summary("List advertising placements")
    @doc("Lists governed placement definitions without delivery or user-level data.")
    @extension("x-admin-capability", "AD_PLACEMENT_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    listPlacements(...RequestHeaders, ...PaginationParameters): AdOk<AdPage<AdPlacement>> | AdAdminErrors;

    @post
    @route("/placements")
    @operationId("createAdminAdPlacement")
    @summary("Create an advertising placement")
    @doc("Creates a disabled or explicitly enabled fixed-format placement under optimistic concurrency.")
    @extension("x-admin-capability", "AD_PLACEMENT_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    createPlacement(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: AdPlacementInput):
        | AdCreated<AdPlacement>
        | AdAdminErrors;

    @put
    @route("/placements/{placementId}")
    @operationId("updateAdminAdPlacement")
    @summary("Update an advertising placement")
    @doc("Updates placement policy; disabling or fallback changes are audited and version checked.")
    @extension("x-admin-capability", "AD_PLACEMENT_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    updatePlacement(
        @path placementId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: AdPlacementInput,
    ): AdOk<AdPlacement> | AdAdminErrors;

    @get
    @route("/campaigns")
    @operationId("listAdminAdCampaigns")
    @summary("List advertising campaigns")
    @doc("Lists campaign lifecycle and aggregate budget state only; raw delivery trails are excluded.")
    @extension("x-admin-capability", "AD_CAMPAIGN_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    listCampaigns(...RequestHeaders, ...PaginationParameters, @query state?: AdCampaignState):
        | AdOk<AdPage<AdCampaign>>
        | AdAdminErrors;

    @post
    @route("/campaigns")
    @operationId("createAdminAdCampaign")
    @summary("Create an advertising campaign")
    @doc("Creates a draft campaign that cannot deliver before a separately reviewed immutable revision is approved.")
    @extension("x-admin-capability", "AD_CAMPAIGN_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    createCampaign(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: AdCampaignInput):
        | AdCreated<AdCampaign>
        | AdAdminErrors;

    @get
    @route("/campaigns/{campaignId}")
    @operationId("getAdminAdCampaign")
    @summary("Read an advertising campaign")
    @doc("Returns one campaign root and immutable revision pointers to an authorized ads manager.")
    @extension("x-admin-capability", "AD_CAMPAIGN_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    getCampaign(@path campaignId: Uuid, ...RequestHeaders): AdOk<AdCampaign> | AdAdminErrors;

    @post
    @route("/campaigns/{campaignId}/revisions")
    @operationId("createAdminAdCampaignRevision")
    @summary("Append an advertising campaign revision")
    @doc("Appends an immutable advertiser, schedule, budget, rate, inventory, targeting and legal snapshot.")
    @extension("x-admin-capability", "AD_CAMPAIGN_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    createRevision(
        @path campaignId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: AdCampaignRevisionInput,
    ): AdCreated<AdCampaignRevision> | AdAdminErrors;

    @post
    @route("/campaigns/{campaignId}/decisions")
    @operationId("decideAdminAdCampaign")
    @summary("Review an advertising campaign revision")
    @doc("Submits, approves or rejects an exact revision; approval requires an independent reviewer and checklist.")
    @extension("x-admin-capability", "AD_CAMPAIGN_REVIEW")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    decideCampaign(
        @path campaignId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: AdCampaignDecisionInput,
    ): AdOk<AdCampaign> | AdAdminErrors;

    @post
    @route("/campaigns/{campaignId}/pause")
    @operationId("pauseAdminAdCampaign")
    @summary("Pause an advertising campaign")
    @doc("Stops new decisions immediately with a closed audited reason and does not extend the schedule.")
    @extension("x-admin-capability", "AD_CAMPAIGN_PAUSE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    pauseCampaign(
        @path campaignId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: AdCampaignStateInput,
    ): AdOk<AdCampaign> | AdAdminErrors;

    @post
    @route("/campaigns/{campaignId}/resume")
    @operationId("resumeAdminAdCampaign")
    @summary("Resume an advertising campaign")
    @doc("Resumes the same approved revision within its original schedule and remaining hard budget.")
    @extension("x-admin-capability", "AD_CAMPAIGN_PAUSE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    resumeCampaign(
        @path campaignId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: AdCampaignStateInput,
    ): AdOk<AdCampaign> | AdAdminErrors;

    @post
    @route("/creatives")
    @operationId("createAdminAdCreative")
    @summary("Append an advertising creative")
    @doc("Stores a static first-party creative revision and exact HTTPS landing approval inputs.")
    @extension("x-admin-capability", "AD_CREATIVE_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    createCreative(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: AdCreativeInput):
        | AdCreated<AdCreativeRecord>
        | AdAdminErrors;

    @get
    @route("/creatives/{creativeId}")
    @operationId("getAdminAdCreative")
    @summary("Read an advertising creative")
    @doc("Returns one immutable creative record to an authorized ads manager for review.")
    @extension("x-admin-capability", "AD_CREATIVE_MANAGE")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    getCreative(@path creativeId: Uuid, ...RequestHeaders): AdOk<AdCreativeRecord> | AdAdminErrors;

    @get
    @route("/providers")
    @operationId("listAdminAdProviders")
    @summary("List advertising provider policies")
    @doc("Lists the deny-by-default external provider registry and current review state to superadmin only.")
    @extension("x-admin-capability", "AD_PROVIDER_GOVERN")
    @extension("x-admin-roles", #["SUPERADMIN"])
    listProviders(...RequestHeaders): AdOk<AdProviderState[]> | AdAdminErrors;

    @post
    @route("/providers/{providerCode}/state")
    @operationId("changeAdminAdProviderState")
    @summary("Govern an advertising provider")
    @doc("Appends provider governance and fails closed unless all reviews, evidence and allowed fields are current.")
    @extension("x-admin-capability", "AD_PROVIDER_GOVERN")
    @extension("x-admin-roles", #["SUPERADMIN"])
    changeProvider(
        @path providerCode: AdContextCode,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: AdProviderStateInput,
    ): AdOk<AdProviderState> | AdAdminErrors;

    @post
    @route("/reports")
    @operationId("getAdminAdReport")
    @summary("Read an aggregate advertising report")
    @extension("x-admin-capability", "AD_REPORT_READ")
    @extension("x-admin-roles", #["ADS_MANAGER"])
    @doc("Returns daily aggregates only. Cohorts below the fixed threshold are suppressed; raw delivery, cap subject and exact timestamps have no API representation.")
    report(...RequestHeaders, ...BrowserMutationHeaders, @body body: AdReportInput): AdOk<AdReport> | AdAdminErrors;
}
