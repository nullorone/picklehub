using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

@doc("WGS84 longitude rounded to no more than six decimal places. Values with greater precision are rejected, not silently rounded.")
@minValue(-180)
@maxValue(180)
scalar Longitude extends float64;

@doc("WGS84 latitude rounded to no more than six decimal places. Values with greater precision are rejected, not silently rounded.")
@minValue(-90)
@maxValue(90)
scalar Latitude extends float64;

@minLength(1)
@maxLength(160)
scalar VenueName extends string;

@minLength(1)
@maxLength(500)
scalar VenueAddress extends string;

@doc("Opaque short-lived geocoder selection token. It must not be logged or persisted as venue data.")
@minLength(16)
@maxLength(512)
@pattern("^[A-Za-z0-9_-]+$")
scalar GeocoderSelectionToken extends string;

enum VenuePublicationState {
    PUBLISHED,
    PRIVACY_REVIEW,
    CLOSED,
    MERGED,
}

enum VenueVerificationState {
    IMPORTED_UNREVIEWED,
    COMMUNITY_CONFIRMED,
    MODERATOR_VERIFIED,
    STALE,
}

enum VenueAccessMode {
    FREE,
    PAID,
    REGISTRATION_REQUIRED,
    MEMBERS_ONLY,
    UNKNOWN,
}

enum VenueEnvironment {
    INDOOR,
    OUTDOOR,
    MIXED,
    UNKNOWN,
}

enum VenueAmenityState {
    YES,
    NO,
    UNKNOWN,
}

enum VenueCandidateState {
    MATCH_ONLY,
    AWAITING_MATCH_COMPLETION,
    PENDING_REVIEW,
    APPROVED,
    REJECTED,
    MERGED,
    WITHDRAWN,
}

enum VenueContributionState {
    PENDING_REVIEW,
    APPROVED,
    REJECTED,
    WITHDRAWN,
}

enum VenueReportReason {
    PRIVATE_RESIDENCE,
    DUPLICATE,
    CLOSED,
}

enum VenueReportState {
    PENDING_REVIEW,
    RESOLVED,
    REJECTED,
}

enum VenueSourceKind {
    OPENSTREETMAP,
    GEOCODER,
    COMMUNITY,
    MODERATOR,
}

model GeoPoint {
    longitude: Longitude;
    latitude: Latitude;
}

model VenueAmenities {
    permanentNet: VenueAmenityState;
    lighting: VenueAmenityState;
    changingRoom: VenueAmenityState;
    toilet: VenueAmenityState;
    drinkingWater: VenueAmenityState;
    parking: VenueAmenityState;
    wheelchairAccess: VenueAmenityState;
}

enum Weekday {
    MONDAY,
    TUESDAY,
    WEDNESDAY,
    THURSDAY,
    FRIDAY,
    SATURDAY,
    SUNDAY,
}

model VenueOpeningPeriod {
    day: Weekday;

    @pattern("^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    opensAt: string;

    @pattern("^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    closesAt: string;
}

model VenueAttribution {
    sourceKind: VenueSourceKind;

    @minLength(1)
    @maxLength(300)
    text: string;

    @format("uri")
    @maxLength(2048)
    link?: string;

    observedAt: Timestamp;
}

model VenueSummary {
    id: Uuid;
    name: VenueName;
    normalizedAddress: VenueAddress;

    @minLength(1)
    @maxLength(160)
    locality: string;

    location: GeoPoint;
    publicationState: "PUBLISHED";
    verificationState: VenueVerificationState;
    accessMode: VenueAccessMode;
    environment: VenueEnvironment;

    @minValue(0)
    @maxValue(100000)
    distanceMeters?: int32;

    @minValue(1)
    version: int32;

    lastVerifiedAt: Timestamp;
    attribution: VenueAttribution[];
}

model Venue {
    ...VenueSummary;

    @minLength(1)
    @maxLength(64)
    timeZone: string;

    @minValue(1)
    @maxValue(100)
    pickleballCourtCount: int32 | null;

    @minLength(1)
    @maxLength(120)
    surfaceType: string | null;

    amenities: VenueAmenities;

    @doc("Provider-neutral weekly local-time periods, or null when unknown. Clients must not infer 24/7 availability from null.")
    @maxItems(28)
    openingHours: VenueOpeningPeriod[] | null;

    @minLength(1)
    @maxLength(500)
    seasonality: string | null;

    closedUntil: Timestamp | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

model VenuePage {
    items: VenueSummary[];
    pageInfo: PageInfo;

    @doc("UTC time of the catalogue snapshot represented by this page and its cursor.")
    snapshotAt: Timestamp;
}

model GeocodingSuggestion {
    selectionToken: GeocoderSelectionToken;

    @minLength(1)
    @maxLength(500)
    label: string;

    location?: GeoPoint;
    attribution: VenueAttribution;
}

model GeocodingSuggestions {
    @maxItems(10)
    items: GeocodingSuggestion[];
}

@oneOf
union VenueCandidateSource {
    manual: {
        kind: "MANUAL_PIN",
    },
    geocoder: {
        kind: "ALLOWED_GEOCODER",

        @doc("The server resolves this token and stores only fields allowed by the adapter capability.")
        selectionToken: GeocoderSelectionToken,
    },
}

model CreateVenueCandidate {
    @doc("Opaque ID of the match that may qualify this candidate. The candidate remains non-public until that match is confirmed as played and moderation approves publication.")
    sourceMatchId: Uuid;

    name: VenueName;
    normalizedAddress: VenueAddress;

    @minLength(1)
    @maxLength(160)
    locality: string;

    @minLength(1)
    @maxLength(64)
    timeZone: string;

    location: GeoPoint;
    source: VenueCandidateSource;
}

@doc("Private self projection. Address, point and contributor identity are deliberately absent after submission.")
model VenueCandidate {
    id: Uuid;
    sourceMatchId: Uuid;
    state: VenueCandidateState;
    canonicalVenueId: Uuid | null;
    createdAt: Timestamp;
    decidedAt: Timestamp | null;
}

model ProposeVenueRevision {
    @minValue(1)
    baseVersion: int32;

    name?: VenueName;
    normalizedAddress?: VenueAddress;
    location?: GeoPoint;
    accessMode?: VenueAccessMode;
    environment?: VenueEnvironment;
    amenities?: VenueAmenities;

    @doc("At least one proposed field besides baseVersion is required. Unknown fields are rejected.")
    @minLength(1)
    @maxLength(500)
    seasonality?: string | null;
}

model VenueRevision {
    id: Uuid;
    venueId: Uuid;

    @minValue(1)
    baseVersion: int32;

    state: VenueContributionState;
    createdAt: Timestamp;
    decidedAt: Timestamp | null;
}

model CreateVenueReport {
    reason: VenueReportReason;
}

model VenueReport {
    id: Uuid;
    venueId: Uuid;
    reason: VenueReportReason;
    state: VenueReportState;
    createdAt: Timestamp;
    resolvedAt: Timestamp | null;
}

model VenueResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}

model VenueOk<T> {
    @statusCode statusCode: 200;
    ...VenueResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model VenueCreated<T> {
    @statusCode statusCode: 201;
    ...VenueResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model VenueError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model VenueFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...VenueResponseHeaders;
    @body body: VenueError<Code>;
}

@error
model VenueRateLimited {
    @statusCode statusCode: 429;
    ...VenueResponseHeaders;
    ...RetryAfterHeader;
    @body body: VenueError<"RATE_LIMITED">;
}

@error
model VenueProviderUnavailable {
    @statusCode statusCode: 503;
    ...VenueResponseHeaders;
    ...RetryAfterHeader;
    @body body: VenueError<"GEOCODER_TEMPORARILY_UNAVAILABLE">;
}

alias VenueReadErrors =
    | VenueFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR" | "SEARCH_AREA_TOO_LARGE">
    | VenueFailure<404, "VENUE_NOT_FOUND">
    | VenueRateLimited;
alias VenueMutationErrors =
    | VenueFailure<400, "VALIDATION_FAILED">
    | VenueFailure<401, "SESSION_INVALID">
    | VenueFailure<403, "ONBOARDING_REQUIRED" | "REQUEST_NOT_ALLOWED">
    | VenueFailure<404, "VENUE_NOT_FOUND" | "MATCH_NOT_FOUND">
    | VenueFailure<409, "VENUE_VERSION_CONFLICT" | "IDEMPOTENCY_KEY_REUSED" | "VENUE_ALREADY_REPORTED">
    | VenueRateLimited;

model VenueFilters {
    @query accessMode?: VenueAccessMode;
    @query environment?: VenueEnvironment;
    @query permanentNet?: VenueAmenityState;
    @query lighting?: VenueAmenityState;
    @query publicationState?: "PUBLISHED";
}

@tag("Venues")
@route("/venues")
@useAuth(NoAuth)
interface VenueCatalogue {
    @get
    @route("/map")
    @operationId("searchVenueMap")
    @summary("Search published venues in a map rectangle")
    @doc("All four WGS84 bounds are required. Antimeridian-crossing boxes are rejected. PostGIS applies ST_Intersects to the GiST-indexed venue geography. Width and height must each be at most 100 km. Cursor is bound to bounds, filters and snapshot for 15 minutes; sort is name ASC, id ASC. Limit defaults to 100 and cannot exceed 200. Exact search bounds are request-only and never logged, persisted or placed in analytics/Redis keys.")
    map(
        ...RequestHeaders,
        ...VenueFilters,
        @query west: Longitude,
        @query south: Latitude,
        @query east: Longitude,
        @query north: Latitude,
        @query cursor?: Cursor,

        @query
        @minValue(1)
        @maxValue(200)
        limit?: int32 = 100,
    ): VenueOk<VenuePage> | VenueReadErrors;

    @get
    @operationId("searchVenues")
    @summary("Search published venues by radius or catalogue text")
    @doc("Choose exactly one mode: radius requires longitude, latitude and radiusMeters together; text requires query and forbids origin/radius. Radius is at most 50,000 m and uses ST_DWithin against the GiST-indexed geography, ordered distance ASC, id ASC. Text searches the stored catalogue only, ordered relevance DESC, normalized name ASC, id ASC; it never calls a geocoder. Cursor is filter/mode/snapshot-bound for 15 minutes. Limit defaults to 20 and cannot exceed 100. Origin and raw query are never logged, persisted or used in analytics/Redis keys.")
    list(
        ...RequestHeaders,
        ...VenueFilters,
        ...PaginationParameters,
        @query longitude?: Longitude,
        @query latitude?: Latitude,

        @query
        @minValue(1)
        @maxValue(50000)
        radiusMeters?: int32,

        @query
        @minLength(1)
        @maxLength(160)
        query?: string,
    ): VenueOk<VenuePage> | VenueReadErrors;

    @get
    @route("/geocoding/suggestions")
    @useAuth(BearerAuth)
    @operationId("suggestVenueAddresses")
    @summary("Request transient address suggestions")
    @doc("Explicit user action only. Suggestions and provider payload stay in memory for no longer than 10 minutes and are not Venue records. The active adapter must pass its production legal/residency capability gate. Query is never logged. Limit: 30/min/user and 120/min/IP.")
    suggest(
        ...RequestHeaders,

        @query
        @minLength(2)
        @maxLength(160)
        query: string,

        @query
        @minValue(1)
        @maxValue(10)
        limit?: int32 = 5,
    ):
        | VenueOk<GeocodingSuggestions>
        | VenueFailure<400, "VALIDATION_FAILED">
        | VenueFailure<401, "SESSION_INVALID">
        | VenueFailure<403, "ONBOARDING_REQUIRED" | "REQUEST_NOT_ALLOWED">
        | VenueRateLimited
        | VenueProviderUnavailable;

    @get
    @route("/{venueId}")
    @operationId("getVenue")
    @summary("Read a published venue")
    @doc("Returns only PUBLISHED venues. A permanent merged alias resolves to the canonical survivor and returns that survivor body; private, review and closed records are not disclosed through this public operation.")
    detail(@path venueId: Uuid, ...RequestHeaders): VenueOk<Venue> | VenueReadErrors;

    @post
    @route("/candidates")
    @useAuth(BearerAuth)
    @operationId("createVenueCandidate")
    @summary("Create a match-only venue candidate")
    @doc("Requires completed onboarding and an owned match creation flow. The point must be a public sports object, never a home. Candidate address/location remain restricted. One candidate per source match; confirmed completion later moves it once to PENDING_REVIEW but never auto-publishes or auto-merges. A selected geocoder value is stored only when adapter capability permits every field. Idempotency response is encrypted and retained 24 hours.")
    createCandidate(...RequestHeaders, ...BrowserMutationHeaders, ...MutationKey, @body body: CreateVenueCandidate):
        | VenueCreated<VenueCandidate>
        | VenueMutationErrors;

    @post
    @route("/{venueId}/revisions")
    @useAuth(BearerAuth)
    @operationId("proposeVenueRevision")
    @summary("Propose a versioned correction")
    @doc("Requires at least one changed field and the current base version. Public venue is unchanged until moderation. Exact proposed location is restricted; provenance is immutable. Idempotency response is encrypted and retained 24 hours.")
    revise(
        @path venueId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: ProposeVenueRevision,
    ): VenueCreated<VenueRevision> | VenueMutationErrors;

    @post
    @route("/{venueId}/reports")
    @useAuth(BearerAuth)
    @operationId("reportVenue")
    @summary("Report a private, duplicate or closed venue")
    @doc("Structured reason only. PRIVATE_RESIDENCE atomically changes the venue to PRIVACY_REVIEW before success; other reasons mark review without hiding it. No free text or moderator identity is exposed. One open report per reporter, venue and reason. Idempotency response is encrypted and retained 24 hours.")
    report(
        @path venueId: Uuid,
        ...RequestHeaders,
        ...BrowserMutationHeaders,
        ...MutationKey,
        @body body: CreateVenueReport,
    ): VenueCreated<VenueReport> | VenueMutationErrors;
}

@tag("Venues")
@route("/venue-candidates")
@useAuth(BearerAuth)
interface VenueCandidateStatus {
    @get
    @route("/{candidateId}")
    @operationId("getMyVenueCandidate")
    @summary("Read the safe state of an own candidate")
    @doc("Self-only status projection; unknown or foreign candidate returns VENUE_NOT_FOUND. Exact address/location and moderation identity/evidence are absent.")
    candidate(@path candidateId: Uuid, ...RequestHeaders): VenueOk<VenueCandidate> | VenueMutationErrors;
}
