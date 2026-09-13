using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum ContentSourceState {
    PROPOSED,
    ENABLED,
    PAUSED,
    REVOKED,
}

enum ContentIntegrationKind {
    RSS,
    API,
}

enum ContentReviewState {
    PENDING,
    APPROVED,
    REJECTED,
    EXPIRED,
}

enum ContentUseClass {
    FETCH_METADATA,
    STORE_METADATA,
    STORE_EXCERPT,
    TRANSFORM,
    PUBLISH_ATTRIBUTION,
    STORE_FULL_TEXT,
    PUBLISH_FULL_TEXT,
    STORE_MEDIA,
    PUBLISH_MEDIA,
    CACHE,
}

enum IngestCandidateState {
    NEW,
    DUPLICATE,
    DISMISSED,
    SELECTED,
    RIGHTS_HOLD,
}

enum ContentDuplicateKind {
    CANONICAL_URL,
    PROVIDER_ID,
    FINGERPRINT,
    CROSS_SOURCE_SIMILARITY,
}

enum ArticleState {
    DRAFT,
    IN_REVIEW,
    APPROVED,
    SCHEDULED,
    PUBLISHED,
    UNPUBLISHED,
    ARCHIVED,
}

enum ArticleOriginKind {
    ORIGINAL,
    DERIVED,
}

enum ContentTransformationKind {
    ORIGINAL_EDITORIAL,
    RESEARCH_SUMMARY,
    TRANSLATION,
    ADAPTATION,
}

enum ContentDecisionKind {
    SUBMIT_REVIEW,
    RETURN_TO_DRAFT,
    APPROVE,
    SCHEDULE,
    CANCEL_SCHEDULE,
    PUBLISH,
    UNPUBLISH,
    ARCHIVE,
}

enum ContentDecisionReason {
    EDITORIAL_READY,
    EDITORIAL_REVISION_REQUIRED,
    SCHEDULE_CHANGED,
    CORRECTION,
    RIGHTS_REVOKED,
    LEGAL_TAKEDOWN,
    SAFETY_REQUEST,
    SOURCE_UNAVAILABLE,
    ARCHIVE_POLICY,
}

enum SafeRichTextBlockKind {
    PARAGRAPH,
    HEADING,
    BULLETED_LIST,
    NUMBERED_LIST,
    QUOTE,
}

enum SafeRichTextMark {
    STRONG,
    EMPHASIS,
    CODE,
}

@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
@minLength(1)
@maxLength(96)
scalar ContentSlug extends string;

@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
@minLength(1)
@maxLength(64)
scalar ContentTaxonomySlug extends string;

@pattern("^[0-9a-f]{64}$")
@example("8f14e45fceea167a5a36dedd4bea2543c9f08aaef67a8e16355d8d8b6f2f4f90")
scalar ContentSha256 extends string;

@format("uri")
@pattern("^https://")
@maxLength(2048)
@example("https://content.example.test/articles/pickleball-basics")
scalar ContentHttpsUrl extends string;

@pattern("^[1-9][0-9]*\\.[0-9]+\\.[0-9]+$")
@maxLength(32)
@example("1.0.0")
scalar ContentPolicyVersion extends string;

@doc("Allowlisted inline content. It contains text, optional presentation marks and an HTTPS link only; raw HTML, scripts, embeds, styles and event handlers have no representation.")
model SafeRichTextInline {
    @minLength(1)
    @maxLength(4000)
    text: string;

    @maxItems(3)
    marks?: SafeRichTextMark[];

    href?: ContentHttpsUrl;
}

@doc("One allowlisted block. HEADING requires level 2 or 3; list blocks contain one or more item arrays. The server rejects incompatible fields.")
model SafeRichTextBlock {
    kind: SafeRichTextBlockKind;

    @minValue(2)
    @maxValue(3)
    headingLevel?: int32;

    @maxItems(100)
    inlines?: SafeRichTextInline[];

    @maxItems(50)
    items?: SafeRichTextInline[][];
}

@doc("Executable-free SAFE_RICH_TEXT_V1 document. Unknown nodes and attributes are rejected before storage.")
model SafeRichTextDocument {
    format: "SAFE_RICH_TEXT_V1";

    @minItems(1)
    @maxItems(300)
    blocks: SafeRichTextBlock[];
}

model ContentMediaReference {
    id: Uuid;
    url: ContentHttpsUrl;

    @pattern("^image/(?:avif|jpeg|png|webp)$")
    @example("image/webp")
    mediaType: string;

    @minValue(1)
    @maxValue(10485760)
    byteLength: int64;

    sha256: ContentSha256;
    rightsPolicyVersion: ContentPolicyVersion;
    altText: string;
}

model ContentCategory {
    id: Uuid;
    slug: ContentTaxonomySlug;
    locale: Locale;

    @minLength(1)
    @maxLength(80)
    name: string;
}

model ContentTag {
    id: Uuid;
    slug: ContentTaxonomySlug;
    locale: Locale;

    @minLength(1)
    @maxLength(50)
    name: string;
}

model PublicArticleAttribution {
    sourceId: Uuid;
    sourceDisplayName: string;
    originalTitle: string;
    originalAuthor: string | null;
    originalPublisher: string | null;
    canonicalUrl: ContentHttpsUrl;
    originallyPublishedAt: Timestamp | null;
    licenseNotice: string | null;
    transformationKind: ContentTransformationKind;
    sourceAvailable: boolean;
}

model ArticleSeoMetadata {
    title: string;
    description: string;
    canonicalUrl: ContentHttpsUrl;
    indexable: boolean;
    openGraphImageUrl: ContentHttpsUrl | null;
}

model PublicArticleCard {
    id: Uuid;
    version: int64;
    locale: Locale;
    slug: ContentSlug;
    title: string;
    subtitle: string | null;
    summary: string;
    category: ContentCategory;
    tags: ContentTag[];
    originKind: ArticleOriginKind;
    attribution: PublicArticleAttribution[];
    coverMedia: ContentMediaReference | null;
    publishedAt: Timestamp;
    updatedAt: Timestamp;
}

model PublicArticle extends PublicArticleCard {
    body: SafeRichTextDocument;
    seo: ArticleSeoMetadata;
    correctionNote: string | null;
    languageAlternatives: PublicArticleAlternative[];
}

model PublicArticleAlternative {
    locale: Locale;
    slug: ContentSlug;
    canonicalUrl: ContentHttpsUrl;
}

model PublicArticlePage {
    items: PublicArticleCard[];
    pageInfo: PageInfo;
    snapshotAt: Timestamp;
}

model ContentSearchInput {
    @minLength(2)
    @maxLength(120)
    query: string;

    locale: Locale;
    category?: ContentTaxonomySlug;
    tag?: ContentTaxonomySlug;
    cursor?: Cursor;

    @minValue(1)
    @maxValue(50)
    limit?: int32 = 20;
}

model BookmarkItem {
    articleId: Uuid;
    available: boolean;
    article: PublicArticleCard | null;
    createdAt: Timestamp;
}

model BookmarkPage {
    items: BookmarkItem[];
    pageInfo: PageInfo;
}

model BookmarkState {
    articleId: Uuid;
    bookmarked: boolean;
    changedAt: Timestamp;
}

model ContentSourceRights {
    useClasses: ContentUseClass[];

    @minValue(0)
    @maxValue(2000)
    maximumExcerptCharacters: int32;

    fullTextLicenseEvidenceId: Uuid | null;
    mediaLicenseEvidenceId: Uuid | null;
    termsUrl: ContentHttpsUrl;
    termsVersion: string;
    rightsBasis: string;
    territory: string;
    languages: Locale[];
    validFrom: Timestamp;
    validUntil: Timestamp | null;
    reviewedAt: Timestamp | null;
    reviewDueAt: Timestamp;
    legalReview: ContentReviewState;
    securityReview: ContentReviewState;
    privacyReview: ContentReviewState;
    commercialReview: ContentReviewState;
}

model ContentSource {
    id: Uuid;
    version: int64;
    state: ContentSourceState;
    integrationKind: ContentIntegrationKind;
    legalName: string;
    displayName: string;
    canonicalOrigin: ContentHttpsUrl;
    endpoint: ContentHttpsUrl;
    attributionTemplate: string;
    licenseNotice: string | null;
    policyVersion: ContentPolicyVersion;
    rights: ContentSourceRights;
    reviewedByUserId: Uuid | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

model ContentSourceInput {
    @minValue(0)
    expectedVersion: int64;

    integrationKind: ContentIntegrationKind;
    legalName: string;
    displayName: string;
    canonicalOrigin: ContentHttpsUrl;
    endpoint: ContentHttpsUrl;
    attributionTemplate: string;
    licenseNotice?: string;
    policyVersion: ContentPolicyVersion;
    rights: ContentSourceRights;
}

model ChangeContentSourceState {
    @minValue(0)
    expectedVersion: int64;

    state: ContentSourceState;
    reason: ContentDecisionReason;
    reauthenticationProof: UuidV4;
}

model PauseContentSource {
    @minValue(0)
    expectedVersion: int64;

    reason: ContentDecisionReason;
}

model ContentSourcePage {
    items: ContentSource[];
    pageInfo: PageInfo;
}

model IngestCandidateRevision {
    id: Uuid;
    revision: int64;
    sourcePolicyVersion: ContentPolicyVersion;
    providerId: string | null;
    canonicalUrl: ContentHttpsUrl;
    title: string;
    author: string | null;
    publisher: string | null;
    excerpt: string | null;
    originallyPublishedAt: Timestamp | null;
    receivedAt: Timestamp;
    fingerprint: ContentSha256;
    sourceHash: ContentSha256;
}

model IngestCandidate {
    id: Uuid;
    sourceId: Uuid;
    state: IngestCandidateState;
    version: int64;
    currentRevision: IngestCandidateRevision;
    duplicateGroupId: Uuid | null;
    duplicateKind: ContentDuplicateKind | null;
    selectedArticleId: Uuid | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

model IngestCandidatePage {
    items: IngestCandidate[];
    pageInfo: PageInfo;
}

model DecideIngestCandidate {
    @minValue(0)
    expectedVersion: int64;

    state: IngestCandidateState;
    duplicateGroupId?: Uuid;
    duplicateKind?: ContentDuplicateKind;
    selectedArticleId?: Uuid;
    reason: ContentDecisionReason;
}

model ArticleOrigin {
    id: Uuid;
    sourceId: Uuid;
    sourcePolicyVersion: ContentPolicyVersion;
    candidateRevisionId: Uuid | null;
    originalTitle: string;
    originalAuthor: string | null;
    originalPublisher: string | null;
    canonicalUrl: ContentHttpsUrl;
    originallyPublishedAt: Timestamp | null;
    receivedAt: Timestamp;
    transformationKind: ContentTransformationKind;
    rightsBasis: string;
    licenseNotice: string | null;
}

model ArticleRevision {
    id: Uuid;
    articleId: Uuid;
    revision: int64;
    locale: Locale;
    slug: ContentSlug;
    title: string;
    subtitle: string | null;
    summary: string;
    body: SafeRichTextDocument;
    categoryId: Uuid;
    tagIds: Uuid[];
    originKind: ArticleOriginKind;
    origins: ArticleOrigin[];
    media: ContentMediaReference[];
    seo: ArticleSeoMetadata;
    correctionNote: string | null;
    translationOfRevisionId: Uuid | null;
    changedFields: string[];
    createdByUserId: Uuid;
    createdAt: Timestamp;
}

model ArticleRevisionInput {
    @minValue(0)
    expectedArticleVersion: int64;

    locale: Locale;
    slug: ContentSlug;
    title: string;
    subtitle?: string;
    summary: string;
    body: SafeRichTextDocument;
    categoryId: Uuid;

    @maxItems(20)
    tagIds: Uuid[];

    originKind: ArticleOriginKind;

    @maxItems(20)
    origins: ArticleOrigin[];

    @maxItems(20)
    media: ContentMediaReference[];

    seo: ArticleSeoMetadata;
    correctionNote?: string;
    translationOfRevisionId?: Uuid;
}

model ArticleRevisionSummary {
    id: Uuid;
    revision: int64;
    locale: Locale;
    slug: ContentSlug;
    changedFields: string[];
    createdByUserId: Uuid;
    createdAt: Timestamp;
}

model ArticleRevisionPage {
    items: ArticleRevisionSummary[];
    pageInfo: PageInfo;
}

model AdminArticle {
    id: Uuid;
    version: int64;
    state: ArticleState;
    currentDraftRevisionId: Uuid | null;
    approvedRevisionId: Uuid | null;
    publishedRevisionId: Uuid | null;
    scheduledRevisionId: Uuid | null;
    scheduledFor: Timestamp | null;
    firstPublishedAt: Timestamp | null;
    updatedAt: Timestamp;
}

model AdminArticlePage {
    items: AdminArticle[];
    pageInfo: PageInfo;
}

model CreateArticleInput {
    originKind: ArticleOriginKind;
    candidateId?: Uuid;
}

model ContentChecklistConfirmation {
    version: ContentPolicyVersion;
    factsChecked: true;
    textRightsChecked: true;
    mediaRightsChecked: true;
    attributionChecked: true;
    privacyChecked: true;
    accessibilityChecked: true;
    languageChecked: true;
    selfReview: boolean;
}

model ContentDecisionInput {
    @minValue(0)
    expectedArticleVersion: int64;

    revisionId: Uuid;
    decision: ContentDecisionKind;
    reason: ContentDecisionReason;
    checklist?: ContentChecklistConfirmation;
    scheduledFor?: Timestamp;
    reauthenticationProof?: UuidV4;
}

model EmergencyUnpublishContentInput {
    @minValue(0)
    expectedArticleVersion: int64;

    revisionId: Uuid;
    decision: "UNPUBLISH";
    reason: "CORRECTION" | "RIGHTS_REVOKED" | "LEGAL_TAKEDOWN" | "SAFETY_REQUEST";
    reauthenticationProof: UuidV4;
}

model ContentPublicationDecision {
    id: Uuid;
    articleId: Uuid;
    revisionId: Uuid;
    articleVersion: int64;
    decision: ContentDecisionKind;
    reason: ContentDecisionReason;
    checklistVersion: ContentPolicyVersion | null;
    actorUserId: Uuid;
    reviewerUserId: Uuid | null;
    selfReview: boolean;
    scheduledFor: Timestamp | null;
    committedAt: Timestamp;
}

model ContentResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "private, no-store";
}

model PublicContentResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "public, max-age=60, stale-while-revalidate=300";
}

model PublicContentOk<T> {
    @statusCode statusCode: 200;
    ...PublicContentResponseHeaders;
    @body body: T;
}

model ContentOk<T> {
    @statusCode statusCode: 200;
    ...ContentResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model ContentCreated<T> {
    @statusCode statusCode: 201;
    ...ContentResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model ContentNoContent {
    @statusCode statusCode: 204;
    ...ContentResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
}

model ContentError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model ContentFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...ContentResponseHeaders;
    @body body: ContentError<Code>;
}

alias PublicContentErrors =
    | ContentFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR">
    | ContentFailure<404, "ARTICLE_NOT_AVAILABLE">
    | ContentFailure<429, "RATE_LIMITED">
    | ContentFailure<503, "CONTENT_SEARCH_UNAVAILABLE">;

alias BookmarkErrors =
    | PublicContentErrors
    | ContentFailure<401, "SESSION_INVALID">
    | ContentFailure<403, "ONBOARDING_REQUIRED">
    | ContentFailure<409, "IDEMPOTENCY_KEY_REUSED">;

alias ContentAdminErrors =
    | ContentFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR" | "INVALID_STATE_TRANSITION">
    | ContentFailure<401, "SESSION_INVALID" | "REAUTHENTICATION_REQUIRED">
    | ContentFailure<403, "CONTENT_ACTION_FORBIDDEN">
    | ContentFailure<404, "CONTENT_RESOURCE_NOT_FOUND">
    | ContentFailure<409, "REVISION_CONFLICT" | "SLUG_CONFLICT" | "RIGHTS_HOLD" | "IDEMPOTENCY_KEY_REUSED">
    | ContentFailure<422, "CONTENT_FORMAT_REJECTED" | "CHECKLIST_REQUIRED" | "ORIGIN_REQUIRED">
    | ContentFailure<429, "RATE_LIMITED">;

@tag("Content")
@route("/content")
@useAuth(NoAuth)
interface PublicContent {
    @get
    @route("/articles")
    @operationId("listPublishedArticles")
    @summary("List published articles")
    @doc("Returns only the committed published revision in publishedAt DESC, articleId DESC order. Draft, preview, scheduled, unpublished and archived metadata are indistinguishable from absence.")
    feed(
        ...RequestHeaders,
        ...PaginationParameters,
        @query locale?: Locale,
        @query category?: ContentTaxonomySlug,
        @query tag?: ContentTaxonomySlug,
    ): PublicContentOk<PublicArticlePage> | PublicContentErrors;

    @get
    @route("/articles/{locale}/{slug}")
    @operationId("getPublishedArticle")
    @summary("Read one published article")
    @doc("Resolves only an active committed publication pointer. Every non-public lifecycle state returns the same ARTICLE_NOT_AVAILABLE response and no title or body.")
    article(@path locale: Locale, @path slug: ContentSlug, ...RequestHeaders):
        | PublicContentOk<PublicArticle>
        | PublicContentErrors;

    @post
    @route("/search")
    @operationId("searchPublishedArticles")
    @summary("Search published articles")
    @doc("The query is accepted in the body so it is not placed in URLs or access logs. Search covers only the current published revision in the requested locale.")
    search(...RequestHeaders, @body body: ContentSearchInput): ContentOk<PublicArticlePage> | PublicContentErrors;
}

@tag("Content")
@route("/content/bookmarks")
@useAuth(BearerAuth)
interface ContentBookmarks {
    @get
    @operationId("listOwnContentBookmarks")
    @summary("List own bookmarks")
    @doc("Returns bookmarks of the authenticated user only. An unavailable article has a null article projection, so a bookmark cannot preserve or leak its title or body.")
    list(...RequestHeaders, ...PaginationParameters): ContentOk<BookmarkPage> | BookmarkErrors;

    @put
    @route("/{articleId}")
    @operationId("putOwnContentBookmark")
    @summary("Idempotently add a bookmark")
    @doc("Creates the authenticated user's unique bookmark for a currently published article, or returns its existing state on retry.")
    put(@path articleId: Uuid, ...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey):
        | ContentOk<BookmarkState>
        | BookmarkErrors;

    @delete
    @route("/{articleId}")
    @operationId("deleteOwnContentBookmark")
    @summary("Idempotently remove a bookmark")
    @doc("Removes only the authenticated user's bookmark. Repeating the operation succeeds without changing the article.")
    remove(@path articleId: Uuid, ...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey):
        | ContentNoContent
        | BookmarkErrors;
}

@tag("Content")
@route("/admin/content")
@useAuth(BearerAuth)
interface ContentAdministration {
    @get
    @route("/sources")
    @operationId("listAdminContentSources")
    @summary("List governed content sources")
    @doc("Returns the deny-by-default source registry and current rights policy to authorized editorial staff only.")
    @extension("x-admin-capability", "CONTENT_SOURCE_READ")
    @extension("x-admin-roles", #["SUPERADMIN", "EDITOR"])
    listSources(...RequestHeaders, ...PaginationParameters): ContentOk<ContentSourcePage> | ContentAdminErrors;

    @post
    @route("/sources")
    @operationId("createAdminContentSource")
    @summary("Propose a content source")
    @doc("Creates a PROPOSED source and policy; it cannot fetch candidates until separately governed and enabled.")
    @extension("x-admin-capability", "CONTENT_SOURCE_PROPOSE")
    @extension("x-admin-roles", #["EDITOR"])
    createSource(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: ContentSourceInput):
        | ContentCreated<ContentSource>
        | ContentAdminErrors;

    @put
    @route("/sources/{sourceId}")
    @operationId("updateAdminContentSource")
    @summary("Version a proposed source policy")
    @doc("Appends a policy revision under optimistic concurrency; an editor cannot enable or revoke the source.")
    @extension("x-admin-capability", "CONTENT_SOURCE_PROPOSE")
    @extension("x-admin-roles", #["EDITOR"])
    updateSource(
        @path sourceId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ContentSourceInput,
    ): ContentOk<ContentSource> | ContentAdminErrors;

    @post
    @route("/sources/{sourceId}/state")
    @operationId("changeAdminContentSourceState")
    @summary("Govern content source state")
    @doc("Requires superadmin re-authentication and current evidence. Enabling fails closed unless every required review is approved.")
    @extension("x-admin-capability", "CONTENT_SOURCE_GOVERN")
    @extension("x-admin-roles", #["SUPERADMIN"])
    changeSourceState(
        @path sourceId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ChangeContentSourceState,
    ): ContentOk<ContentSource> | ContentAdminErrors;

    @post
    @route("/sources/{sourceId}/pause")
    @operationId("pauseAdminContentSource")
    @summary("Pause content source ingestion")
    @doc("Allows an editor to fail closed by pausing new fetches. Only superadmin governance can enable or revoke a source.")
    @extension("x-admin-capability", "CONTENT_SOURCE_PAUSE")
    @extension("x-admin-roles", #["EDITOR"])
    pauseSource(
        @path sourceId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: PauseContentSource,
    ): ContentOk<ContentSource> | ContentAdminErrors;

    @get
    @route("/candidates")
    @operationId("listAdminContentCandidates")
    @summary("List private ingest candidates")
    @doc("Returns only allowlisted candidate metadata to an editor; candidates and duplicate groups are never public content.")
    @extension("x-admin-capability", "CONTENT_CANDIDATE_REVIEW")
    @extension("x-admin-roles", #["EDITOR"])
    listCandidates(...RequestHeaders, ...PaginationParameters, @query state?: IngestCandidateState):
        | ContentOk<IngestCandidatePage>
        | ContentAdminErrors;

    @get
    @route("/candidates/{candidateId}")
    @operationId("getAdminContentCandidate")
    @summary("Read a private ingest candidate")
    @doc("Returns one candidate with its current allowed snapshot and deduplication hint to an authorized editor only.")
    @extension("x-admin-capability", "CONTENT_CANDIDATE_REVIEW")
    @extension("x-admin-roles", #["EDITOR"])
    getCandidate(@path candidateId: Uuid, ...RequestHeaders): ContentOk<IngestCandidate> | ContentAdminErrors;

    @post
    @route("/candidates/{candidateId}/decision")
    @operationId("decideAdminContentCandidate")
    @summary("Record a candidate decision")
    @doc("Records a manual terminal or selection decision. Duplicate detection may suggest a group but cannot publish or merge provenance.")
    @extension("x-admin-capability", "CONTENT_CANDIDATE_REVIEW")
    @extension("x-admin-roles", #["EDITOR"])
    decideCandidate(
        @path candidateId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: DecideIngestCandidate,
    ): ContentOk<IngestCandidate> | ContentAdminErrors;

    @post
    @route("/articles")
    @operationId("createAdminContentArticle")
    @summary("Create an editorial article draft")
    @doc("Creates only a stable DRAFT identity, optionally linked to a selected candidate; no revision becomes public.")
    @extension("x-admin-capability", "CONTENT_EDIT")
    @extension("x-admin-roles", #["EDITOR"])
    createArticle(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: CreateArticleInput):
        | ContentCreated<AdminArticle>
        | ContentAdminErrors;

    @get
    @route("/articles")
    @operationId("listAdminContentArticles")
    @summary("List editorial articles")
    @doc("Returns private lifecycle summaries in stable updated-time order for the editorial workspace.")
    @extension("x-admin-capability", "CONTENT_EDIT")
    @extension("x-admin-roles", #["EDITOR"])
    listArticles(...RequestHeaders, ...PaginationParameters, @query state?: ArticleState):
        | ContentOk<AdminArticlePage>
        | ContentAdminErrors;

    @get
    @route("/articles/{articleId}")
    @operationId("getAdminContentArticle")
    @summary("Read editorial article state")
    @doc("Returns private lifecycle and exact revision pointers to an authorized editor without granting public visibility.")
    @extension("x-admin-capability", "CONTENT_EDIT")
    @extension("x-admin-roles", #["EDITOR"])
    getArticle(@path articleId: Uuid, ...RequestHeaders): ContentOk<AdminArticle> | ContentAdminErrors;

    @get
    @route("/articles/{articleId}/revisions")
    @operationId("listAdminContentArticleRevisions")
    @summary("List immutable article revisions")
    @doc("Returns append-only revision summaries in stable revision order for editorial history.")
    @extension("x-admin-capability", "CONTENT_EDIT")
    @extension("x-admin-roles", #["EDITOR"])
    listRevisions(@path articleId: Uuid, ...RequestHeaders, ...PaginationParameters):
        | ContentOk<ArticleRevisionPage>
        | ContentAdminErrors;

    @get
    @route("/articles/{articleId}/revisions/{revisionId}")
    @operationId("getAdminContentArticleRevision")
    @summary("Read one immutable article revision")
    @doc("Returns one exact staff-only revision including safe rich text, origins, media, taxonomy and SEO fields.")
    @extension("x-admin-capability", "CONTENT_EDIT")
    @extension("x-admin-roles", #["EDITOR"])
    getRevision(@path articleId: Uuid, @path revisionId: Uuid, ...RequestHeaders):
        | ContentOk<ArticleRevision>
        | ContentAdminErrors;

    @post
    @route("/articles/{articleId}/revisions")
    @operationId("createAdminContentArticleRevision")
    @summary("Append an article revision")
    @doc("Validates SAFE_RICH_TEXT_V1 and appends a new immutable revision under optimistic article version control.")
    @extension("x-admin-capability", "CONTENT_EDIT")
    @extension("x-admin-roles", #["EDITOR"])
    createRevision(
        @path articleId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ArticleRevisionInput,
    ): ContentCreated<ArticleRevision> | ContentAdminErrors;

    @get
    @route("/articles/{articleId}/revisions/{revisionId}/preview")
    @operationId("previewAdminContentArticleRevision")
    @summary("Preview one article revision")
    @extension("x-admin-capability", "CONTENT_PREVIEW")
    @extension("x-admin-roles", #["EDITOR"])
    @doc("Staff-bound preview of one exact revision. The response is private, no-store and must be rendered with noindex; it is never a public capability URL.")
    preview(@path articleId: Uuid, @path revisionId: Uuid, ...RequestHeaders):
        | ContentOk<ArticleRevision>
        | ContentAdminErrors;

    @post
    @route("/articles/{articleId}/decisions")
    @operationId("decideAdminContentArticle")
    @summary("Apply an editorial lifecycle decision")
    @extension("x-admin-capability", "CONTENT_PUBLISH")
    @extension("x-admin-roles", #["EDITOR"])
    @doc("Applies an explicit transition to the exact revision. Approval/publish require the versioned checklist and current origin rights; scheduler retries the committed SCHEDULE decision only.")
    decideArticle(
        @path articleId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ContentDecisionInput,
    ): ContentOk<ContentPublicationDecision> | ContentAdminErrors;

    @post
    @route("/articles/{articleId}/emergency-unpublish")
    @operationId("emergencyUnpublishAdminContentArticle")
    @summary("Emergency-unpublish an article")
    @extension("x-admin-capability", "CONTENT_EMERGENCY_UNPUBLISH")
    @extension("x-admin-roles", #["SUPERADMIN"])
    @doc("Superadmin may only unpublish with re-authentication and a closed reason; this operation cannot edit a revision body.")
    emergencyUnpublish(
        @path articleId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: EmergencyUnpublishContentInput,
    ): ContentOk<ContentPublicationDecision> | ContentAdminErrors;
}
