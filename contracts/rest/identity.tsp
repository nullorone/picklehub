using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

@doc("Opaque 256-bit credential encoded as 43 unpadded base64url characters. Secret: never log or persist raw.")
@minLength(43)
@maxLength(43)
@pattern("^[A-Za-z0-9_-]{43}$")
scalar IdentitySecret extends string;

@doc("Email input is trimmed, domain is IDNA-normalized and the ASCII local part and domain are lowercased. No quoted local parts; local part <=64 and canonical address <=254 characters. Dots and +suffix are preserved. Never log this field.")
@minLength(3)
@maxLength(320)
scalar EmailInput extends string;

@doc("Untrusted Telegram init data; verify signature, bot context, unique keys and -30 <= now-auth_date < 300 seconds on the server. A verified fingerprint is single-use. Never log this field.")
@minLength(1)
@maxLength(8192)
scalar TelegramInitData extends string;

@minLength(2)
@maxLength(50)
@doc("Trimmed NFC plain text, 2-50 Unicode code points without control characters. Server performs normalization before validation.")
scalar DisplayName extends string;

@minLength(1)
@maxLength(64)
@doc("An identifier present in the server IANA timezone database, including UTC. Unknown zones are rejected.")
scalar TimeZone extends string;

@minLength(1)
@maxLength(128)
@pattern("^[A-Za-z0-9_-]+$")
scalar DocumentVersion extends string;

@pattern("^[a-f0-9]{64}$")
scalar Sha256 extends string;

@doc("HTTPS profile link only. Exact host/path allowlist is deployment configuration approved under ADR 0004; the capability is disabled until approved. Reject credentials, query, fragment, non-default port and unapproved hosts/paths; never fetch the URL.")
@format("uri")
@maxLength(2048)
@pattern("^https://[^/?#@]+/[^?#]+$")
scalar DuprProfileUrl extends string;

enum IdentityProvider {
    TELEGRAM,
    EMAIL,
}
enum ClientPlatform {
    WEB,
    TMA,
    MOBILE,
}
enum OnboardingStatus {
    DRAFT,
    COMPLETED,
}
enum ConsentPurpose {
    TERMS,
    PERSONAL_DATA,
    ANALYTICS,
    MARKETING,
}
enum ConsentAction {
    ACCEPTED,
    WITHDRAWN,
}
enum GameFormat {
    SINGLES,
    DOUBLES,
}
union SkillLevel {
    1.0,
    1.5,
    2.0,
    2.5,
    3.0,
    3.5,
    4.0,
    4.5,
    5.0,
}

model IdentityPrivateHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
    @header("Pragma") pragma: "no-cache";
}

model BrowserMutationHeaders {
    @header("Origin")
    @doc("Exact browser origin from the configured allowlist; required even for anonymous mutations. Cross-site and missing origins are rejected.")
    origin: string;

    @header("X-CSRF-Token")
    @doc("Secret bound to the HttpOnly browser context cookie from GET /auth/context. Never log. Validate origin, context cookie and token together before mutation.")
    csrfToken: IdentitySecret;
}

model SessionMutationHeaders {
    @header("Origin")
    @doc("Required with X-CSRF-Token for WEB/TMA sessions and rejected when missing or cross-origin. Omit for MOBILE sessions; the server derives the platform from the access credential and never trusts a caller platform header.")
    origin?: string;

    @header("X-CSRF-Token")
    @doc("Required with Origin for WEB/TMA sessions and validated against the browser context cookie. Omit for MOBILE sessions, whose bearer credential is non-ambient. Supplying only one browser header is rejected.")
    csrfToken?: IdentitySecret;
}

model MutationKey {
    @header("Idempotency-Key") idempotencyKey: UuidV4;
}

@doc("Required response header for issuing or clearing browser cookies. OpenAPI models the Set-Cookie field as a string; when both context and refresh change, runtime emits separate Set-Cookie field lines and never comma-joins them. __Secure-ph-refresh: Path=/v1/auth, Secure, HttpOnly, SameSite=Lax, no Domain; Max-Age is min(7 days, remaining absolute lifetime). Context cookie is rotated on new login.")
model CookieHeaders {
    @header("Set-Cookie") setCookie: string;
}

model IdentityOk<T> {
    @statusCode statusCode: 200;
    ...IdentityPrivateHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model IdentityAccepted<T> {
    @statusCode statusCode: 202;
    ...IdentityPrivateHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model IdentityCookieOk<T> {
    @statusCode statusCode: 200;
    ...IdentityPrivateHeaders;
    ...CookieHeaders;
    @body body: T;
}

model IdentityCookieAccepted<T> {
    @statusCode statusCode: 202;
    ...IdentityPrivateHeaders;
    ...CookieHeaders;
    @body body: T;
}

model IdentityError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model IdentityFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...IdentityPrivateHeaders;
    @body body: IdentityError<Code>;
}

@error
model IdentityRateLimited {
    @statusCode statusCode: 429;
    ...IdentityPrivateHeaders;
    ...RetryAfterHeader;
    @body body: IdentityError<"RATE_LIMITED">;
}

@error
model IdentityUnavailable {
    @statusCode statusCode: 503;
    ...IdentityPrivateHeaders;
    ...RetryAfterHeader;
    @body body: IdentityError<"AUTH_TEMPORARILY_UNAVAILABLE">;
}

alias InvalidInput = IdentityFailure<400, "VALIDATION_FAILED">;
alias InvalidSession = IdentityFailure<401, "SESSION_INVALID">;
alias ForbiddenIdentity = IdentityFailure<
    403,
    "REQUEST_NOT_ALLOWED" | "REAUTHENTICATION_REQUIRED" | "ONBOARDING_REQUIRED" | "CONSENT_REQUIRED"
>;
alias IdentityConflict = IdentityFailure<
    409,
    | "IDENTITY_LINK_FAILED"
    | "LAST_IDENTITY_REQUIRED"
    | "DRAFT_VERSION_CONFLICT"
    | "CONSENT_VERSION_CHANGED"
    | "IDEMPOTENCY_KEY_REUSED"
>;
alias IdentityErrors =
    | InvalidInput
    | InvalidSession
    | ForbiddenIdentity
    | IdentityConflict
    | IdentityRateLimited
    | IdentityUnavailable;
alias LoginErrors = InvalidInput | ForbiddenIdentity | IdentityRateLimited | IdentityUnavailable;

model BrowserContext {
    csrfToken: IdentitySecret;
    expiresAt: Timestamp;
}

model LoginTelegram {
    initData: TelegramInitData;
    platform: ClientPlatform;
}
model LoginEmailRequest {
    email: EmailInput;
    platform: ClientPlatform;
}
model LoginEmailConsume {
    token: IdentitySecret;
    platform: ClientPlatform;
}

@example(#{ status: "ACCEPTED", message: "Если адрес можно использовать, письмо со ссылкой придёт в ближайшее время" })
model MagicLinkRequested {
    status: "ACCEPTED";
    message: "Если адрес можно использовать, письмо со ссылкой придёт в ближайшее время";
}

model User {
    id: Uuid;
    status: "ACTIVE";
    onboardingStatus: OnboardingStatus;
    completedAt: Timestamp | null;
    requiredConsentsSatisfied: boolean;
    createdAt: Timestamp;
}

@doc("A private projection of the authenticated session. No credential hashes, IP, device fingerprint or provider identifier is exposed.")
model Session {
    id: Uuid;
    status: "ACTIVE";
    createdAt: Timestamp;
    idleExpiresAt: Timestamp;
    absoluteExpiresAt: Timestamp;
}

model AccessSession {
    tokenType: "Bearer";
    accessToken: IdentitySecret;
    accessExpiresAt: Timestamp;
    session: Session;
    user: User;
}

model AuthenticatedSession extends AccessSession {
    csrfToken: IdentitySecret;
}

@doc("Rotating native refresh credential returned only in a MOBILE response body. Store in Keychain/Keystore-backed secure storage; never put it in a URL, cookie, log, analytics, clipboard, AsyncStorage or backup.")
model NativeAuthenticatedSession extends AccessSession {
    refreshToken: IdentitySecret;
    refreshExpiresAt: Timestamp;
    destination: MobileDeepLinkTarget | null;
}

@oneOf
union MobileDeepLinkTarget {
    matches: {
        kind: "MATCHES",
    },
    match: {
        kind: "MATCH",
        matchId: Uuid,
    },
    matchChat: {
        kind: "MATCH_CHAT",
        matchId: Uuid,
    },
    venues: {
        kind: "VENUES",
    },
    venue: {
        kind: "VENUE",
        venueId: Uuid,
    },
    notifications: {
        kind: "NOTIFICATIONS",
    },
    profile: {
        kind: "PROFILE",
    },
    player: {
        kind: "PLAYER",
        playerId: Uuid,
    },
    account: {
        kind: "ACCOUNT",
    },
    safety: {
        kind: "SAFETY",
    },
    safetyReceipt: {
        kind: "SAFETY_RECEIPT",
        receiptId: Uuid,
    },
}

@minLength(43)
@maxLength(128)
@pattern("^[A-Za-z0-9._~-]+$")
@doc("High-entropy native verifier generated on-device. Never log or persist outside Keychain/Keystore-backed secure storage.")
scalar NativeCodeVerifier extends string;

@minLength(43)
@maxLength(43)
@pattern("^[A-Za-z0-9_-]{43}$")
@doc("Unpadded base64url SHA-256 digest of a native verifier (S256). It is safe to bind to a pending login link but is not a credential.")
scalar NativeCodeChallenge extends string;

model NativeLoginEmailRequest {
    email: EmailInput;
    platform: "MOBILE";
    codeChallenge: NativeCodeChallenge;
    destination?: MobileDeepLinkTarget;
}

model NativeLoginEmailConsume {
    token: IdentitySecret;
    platform: "MOBILE";
    codeVerifier: NativeCodeVerifier;
}

model NativeRefreshRequest {
    refreshToken: IdentitySecret;
}

@doc("Self-only identity projection: email and Telegram subject are deliberately absent, including masked values.")
model Identity {
    id: Uuid;
    provider: IdentityProvider;
    linkedAt: Timestamp;
}
model IdentityList {
    items: Identity[];
}
model Me {
    user: User;
    session: Session;
    identities: Identity[];
}
model LogoutResult {
    status: "SIGNED_OUT";
}
model EmptyRequest {}

model ConsentDocument {
    purpose: ConsentPurpose;
    version: DocumentVersion;
    checksum: Sha256;
    @minLength(1) @maxLength(200) title: string;
    @minLength(1) @maxLength(100000) text: string;
    required: boolean;
    effectiveAt: Timestamp;
}
model ConsentDocuments {
    items: ConsentDocument[];
}
model Consent {
    id: Uuid;
    purpose: ConsentPurpose;
    version: DocumentVersion;
    checksum: Sha256;
    action: ConsentAction;
    occurredAt: Timestamp;
    platform: ClientPlatform;
}
model ConsentHistory {
    items: Consent[];
    pageInfo: PageInfo;
}
model ConsentChange {
    purpose: ConsentPurpose;
    version: DocumentVersion;
    action: ConsentAction;
    platform: ClientPlatform;
}
model ConsentState {
    purpose: ConsentPurpose;
    acceptedVersion: DocumentVersion | null;
}

model Locality {
    id: Uuid;
    @minLength(1) @maxLength(120) name: string;
    @pattern("^[A-Z]{2}$") countryCode: string;
    @minLength(1) @maxLength(120) region: string;
}
model LocalityPage {
    items: Locality[];
    pageInfo: PageInfo;
}
model OnboardingOptions {
    @minValue(1) catalogueVersion: int32;
    duprLinksEnabled: boolean;

    @doc("Empty until official URL policy is approved. Patterns are anchored server-owned expressions, never executable user code.")
    duprAllowedPatterns: string[];

    supportedTimeZones: TimeZone[];
}

model PlayerProfileDraft {
    userId: Uuid;
    status: OnboardingStatus;
    @minValue(0) version: int32;
    displayName: DisplayName | null;
    timeZone: TimeZone | null;
    localityId: Uuid | null;

    @minItems(0)
    @maxItems(2)
    @doc("Distinct game formats only; duplicates are rejected.")
    gameFormats: GameFormat[];

    skillSelfAssessment: SkillLevel | null;
    duprProfileUrl: DuprProfileUrl | null;
    completedAt: Timestamp | null;
    updatedAt: Timestamp;
}

@doc("Only present fields change. Null explicitly clears a nullable field; empty gameFormats clears the selection. At least one field besides expectedVersion is required. Save requires DRAFT state and a matching version; no lost update. Unknown fields are rejected.")
model UpdateDraft {
    @minValue(0) expectedVersion: int32;
    displayName?: DisplayName | null;
    timeZone?: TimeZone | null;
    localityId?: Uuid | null;

    @minItems(0)
    @maxItems(2)
    @doc("Distinct game formats only; duplicates are rejected.")
    gameFormats?: GameFormat[];

    skillSelfAssessment?: SkillLevel | null;
    duprProfileUrl?: DuprProfileUrl | null;
}
model CompleteOnboarding {
    @minValue(0) expectedVersion: int32;

    @doc("Current TERMS document explicitly accepted through POST /me/consents.")
    termsVersion: DocumentVersion;

    @doc("Current PERSONAL_DATA document explicitly accepted through POST /me/consents.")
    personalDataVersion: DocumentVersion;
}
model Onboarding {
    draft: PlayerProfileDraft;
    consents: ConsentState[];
    requiredConsentsSatisfied: boolean;
}

@oneOf
union StartIdentityAttempt {
    link: {
        action: "LINK",
        targetProvider: IdentityProvider,
    },
    unlink: {
        action: "UNLINK",
        identityId: Uuid,
    },
    deletion: {
        action: "DELETE_ACCOUNT",
    },
}
model IdentityAttempt {
    id: Uuid;
    action: "LINK" | "UNLINK" | "DELETE_ACCOUNT";
    status: "PENDING" | "READY" | "CONSUMED" | "EXPIRED" | "REVOKED";
    expiresAt: Timestamp;
    currentProofExpiresAt: Timestamp | null;
    targetProofExpiresAt: Timestamp | null;
}
enum ProofSide {
    CURRENT,
    TARGET,
}
model TelegramProof {
    side: ProofSide;
    initData: TelegramInitData;
}
model EmailProofRequest {
    side: ProofSide;
    email: EmailInput;
}
model EmailProofConsume {
    token: IdentitySecret;
}
model FinishIdentityAttempt {
    attemptId: Uuid;
}
model DeleteAccount {
    attemptId: Uuid;
    confirmed: true;
}
model DeletionAccepted {
    status: "DELETION_PENDING";
    requestedAt: Timestamp;
}

@tag("Identity")
@route("/auth")
@useAuth(NoAuth)
interface IdentityAuthentication {
    @get
    @route("/context")
    @operationId("getBrowserAuthContext")
    @summary("Obtain a browser CSRF context")
    @doc("Same-origin bootstrap (Sec-Fetch-Site or validated Origin); never grant cross-origin read access. Sets __Host-ph-context: Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600. Returns an existing valid context or creates a new one; does not create or rotate a session. Rate: 30/minute/IP. No credentials in URL.")
    getContext(...RequestHeaders): IdentityCookieOk<BrowserContext> | LoginErrors;

    @post
    @route("/telegram")
    @operationId("exchangeTelegramInitData")
    @summary("Exchange a fresh Telegram proof for a browser session")
    @doc("Atomic first login or existing identity login. Reject replay and invalid/stale Telegram proof with TELEGRAM_AUTH_INVALID. Never auto-link to the current account. No generic idempotency or automatic retry; all credentials are newly issued. Rates: 20/5m/IP and 10/5m/verified subject.")
    telegram(...RequestHeaders, ...BrowserMutationHeaders, @body body: LoginTelegram):
        | IdentityCookieOk<AuthenticatedSession>
        | LoginErrors
        | IdentityFailure<401, "TELEGRAM_AUTH_INVALID">;

    @post
    @route("/magic-links/request")
    @operationId("requestMagicLink")
    @summary("Request a sign-in email without disclosing registration")
    @doc("Same 202 body/headers/timing path for new, existing, deleting or address-throttled identities and delivery outcomes. No account or link ID returned. Rates: 10/10m and 30/h/IP; 1/60s and 5/h/address+purpose silently suppress delivery. Redis/provider-wide outage returns 503 before lookup. No generic idempotency. The new accepted request revokes the previous pending login link.")
    requestLink(...RequestHeaders, ...BrowserMutationHeaders, @body body: LoginEmailRequest):
        | IdentityAccepted<MagicLinkRequested>
        | LoginErrors;

    @post
    @route("/magic-links/consume")
    @operationId("consumeMagicLink")
    @summary("Confirm and consume a single-use login link")
    @doc("Explicit user POST only, never GET. Links last 600 seconds and contain 256 random bits. Unknown, expired, consumed, revoked or wrong-purpose secrets all produce MAGIC_LINK_INVALID. Transaction creates at most one account and session. Browser confirming the link receives the session; no automatic account switching/linking. Rate: 10/5m and 30/h/IP. No generic idempotency; lost response requires a new login link.")
    consumeLink(...RequestHeaders, ...BrowserMutationHeaders, @body body: LoginEmailConsume):
        | IdentityCookieOk<AuthenticatedSession>
        | LoginErrors
        | IdentityFailure<401, "MAGIC_LINK_INVALID">;

    @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "__Secure-ph-refresh">)
    @post
    @route("/refresh")
    @operationId("refreshSession")
    @summary("Rotate the browser refresh credential")
    @doc("Refresh cookie only; no refresh token in JSON. 300s access, 7d inactivity and 30d absolute session lifetime. Reuse of any rotated hash revokes the whole family, including new access; no grace window or credential response replay. Client serializes across tabs. Rates: 30/5m/family, 120/5m/IP. Loss of response requires login.")
    refresh(...RequestHeaders, ...BrowserMutationHeaders, @body body: EmptyRequest):
        | IdentityCookieOk<AuthenticatedSession>
        | IdentityErrors;

    @post
    @route("/logout")
    @operationId("logoutSession")
    @summary("Revoke the cookie session and clear browser credentials")
    @doc("Accepts the refresh cookie when present; absent/already revoked cookie is still success after CSRF validation. Revocation is intrinsically idempotent, without Idempotency-Key. Clears refresh cookie with Max-Age=0 and matching attributes. Rate: 10/min/user and 30/min/IP shared with logout-all.")
    logout(...RequestHeaders, ...BrowserMutationHeaders, @body body: EmptyRequest):
        | IdentityCookieOk<LogoutResult>
        | LoginErrors;

    @useAuth(BearerAuth)
    @post
    @route("/logout-all")
    @operationId("logoutAllSessions")
    @summary("Revoke all current sessions and pending proofs")
    @doc("Atomically increments user auth epoch and revokes sessions/links/attempts; serialize with login and refresh. Clear refresh cookie. No generic credential replay. Repeating with revoked access returns SESSION_INVALID, never a new effect. Rate shared with logout.")
    logoutAll(...RequestHeaders, ...SessionMutationHeaders, @body body: EmptyRequest):
        | IdentityCookieOk<LogoutResult>
        | IdentityErrors;
}

@tag("Identity")
@route("/auth/mobile")
@useAuth(NoAuth)
interface NativeIdentityAuthentication {
    @post
    @route("/magic-links/request")
    @operationId("requestNativeMagicLink")
    @summary("Request a proof-bound native sign-in email")
    @doc("Neutral response and delivery suppression match the browser request. The server stores only the S256 challenge and an optional closed destination with the 10-minute link. MOBILE is literal; Origin, browser context cookies and CSRF headers are neither required nor accepted. No generic idempotency or automatic retry.")
    requestLink(...RequestHeaders, @body body: NativeLoginEmailRequest):
        | IdentityAccepted<MagicLinkRequested>
        | LoginErrors;

    @post
    @route("/magic-links/consume")
    @operationId("consumeNativeMagicLink")
    @summary("Consume a native magic link and issue body credentials")
    @doc("Foreground explicit POST only. Atomically consume the link after constant-time S256 verifier comparison and issue a 300-second in-memory access token plus one rotating refresh token. Unknown, expired, used, revoked, wrong-platform or wrong-verifier links all return MAGIC_LINK_INVALID. No cookies, CSRF headers, URL credentials, response replay or automatic retry; a lost response requires a new link.")
    consumeLink(...RequestHeaders, @body body: NativeLoginEmailConsume):
        | IdentityOk<NativeAuthenticatedSession>
        | LoginErrors
        | IdentityFailure<401, "MAGIC_LINK_INVALID">;

    @post
    @route("/refresh")
    @operationId("refreshNativeSession")
    @summary("Rotate a native refresh credential")
    @doc("Refresh token is accepted only in the JSON body over TLS and redacted before logging. It is never accepted from a cookie, URL or query. Rotation, 7-day inactivity, 30-day absolute lifetime and family-wide reuse detection match browser sessions; the client serializes refresh and atomically replaces secure storage. Loss of response or reuse revokes the family and requires login.")
    refresh(...RequestHeaders, @body body: NativeRefreshRequest):
        | IdentityOk<NativeAuthenticatedSession>
        | IdentityErrors;

    @post
    @route("/logout")
    @operationId("logoutNativeSession")
    @summary("Revoke one native session")
    @doc("Revokes the presented native refresh family and is intrinsically idempotent. An unknown, already revoked or locally deleted credential returns SIGNED_OUT without disclosing state. The client clears access, secure refresh, push registration and its user cache even when offline; an offline logout is not queued or retried after credential erasure and may be completed server-side by logout-all from another session or expiry.")
    logout(...RequestHeaders, @body body: NativeRefreshRequest): IdentityOk<LogoutResult> | LoginErrors;
}

@tag("Identity")
@useAuth(BearerAuth)
@route("/me")
interface IdentitySelf {
    @get
    @operationId("getCurrentUser")
    @summary("Read the current user and session")
    @doc("Self only, including incomplete onboarding. Verify session revocation and user auth epoch on every request. Reads share 60/min/user and 240/min/IP.")
    getMe(...RequestHeaders): IdentityOk<Me> | IdentityErrors;

    @get
    @route("/identities")
    @operationId("listMyIdentities")
    @summary("List own linked sign-in methods")
    @doc("Returns opaque IDs and provider kinds only. Shares self-read limits.")
    identities(...RequestHeaders): IdentityOk<IdentityList> | IdentityErrors;

    @post
    @route("/identity-attempts")
    @operationId("startIdentityAttempt")
    @summary("Start an operation-bound proof attempt")
    @doc("10 minute attempt bound to user, session and action. LINK requires CURRENT and TARGET independent proofs; UNLINK requires CURRENT proof from a remaining identity; DELETE_ACCOUNT requires CURRENT proof. Missing/foreign identities return IDENTITY_LINK_FAILED. Idempotency retains only safe result 24h. Limit: 5 attempts/h/user and 20/h/IP; proof steps do not consume another attempt budget but use provider-specific limits.")
    startAttempt(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: StartIdentityAttempt):
        | IdentityOk<IdentityAttempt>
        | IdentityErrors;

    @get
    @route("/identity-attempts/{attemptId}")
    @operationId("getIdentityAttempt")
    @summary("Read the status of an own proof attempt")
    @doc("Require owning user AND originating session; unknown/foreign attempt returns IDENTITY_LINK_FAILED. Shares self-read limits. READY is derived from unexpired proofs and does not promise that a target is available.")
    getAttempt(@path attemptId: Uuid, ...RequestHeaders): IdentityOk<IdentityAttempt> | IdentityErrors;

    @post
    @route("/identity-attempts/{attemptId}/telegram")
    @operationId("proveTelegramIdentity")
    @summary("Prove a Telegram identity for this attempt")
    @doc("No session issuance. Atomically consume verified Telegram fingerprint and bind side/subject to attempt. CURRENT must belong to actor (and remain after UNLINK); TARGET only for LINK. Proof lasts 300s, bounded by attempt expiry. No generic idempotency. Rates match Telegram exchange.")
    telegramProof(@path attemptId: Uuid, ...RequestHeaders, ...SessionMutationHeaders, @body body: TelegramProof):
        | IdentityOk<IdentityAttempt>
        | IdentityErrors
        | IdentityFailure<401, "TELEGRAM_AUTH_INVALID">;

    @post
    @route("/identity-attempts/{attemptId}/email/request")
    @operationId("requestIdentityEmailProof")
    @summary("Request an email proof bound to this attempt")
    @doc("Always neutral email response for a valid owned attempt, including wrong current address and occupied target. Bind link to attempt, session, side and normalized address; no account creation. Same email request rate limits and silent address suppression. No generic idempotency.")
    requestEmailProof(
        @path attemptId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        @body body: EmailProofRequest,
    ): IdentityAccepted<MagicLinkRequested> | IdentityErrors;

    @post
    @route("/identity-attempts/{attemptId}/email/consume")
    @operationId("consumeIdentityEmailProof")
    @summary("Consume an email proof in the originating session")
    @doc("Requires originating authenticated browser session, unlike login links. Wrong session, purpose or side cannot transfer proof. Bind verified subject without revealing occupancy. Proof lasts 300s bounded by attempt expiry. No generic idempotency. Rates match magic consume.")
    consumeEmailProof(
        @path attemptId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        @body body: EmailProofConsume,
    ): IdentityOk<IdentityAttempt> | IdentityErrors | IdentityFailure<401, "MAGIC_LINK_INVALID">;

    @post
    @route("/identities/link")
    @operationId("linkIdentity")
    @summary("Link a proven identity and replace the session")
    @doc("Consume LINK attempt with both proofs younger than 300s. Transaction locks user, enforces provider subject uniqueness and one identity/provider/user. Occupied target returns only IDENTITY_LINK_FAILED; no merging. Revoke all old sessions and issue new credentials. Attempt is single-use; no generic credential replay. Commit uses the reserved attempt budget, no additional attempt charge.")
    link(...RequestHeaders, ...SessionMutationHeaders, @body body: FinishIdentityAttempt):
        | IdentityCookieOk<AuthenticatedSession>
        | IdentityErrors;

    @post
    @route("/identities/{identityId}/unlink")
    @operationId("unlinkIdentity")
    @summary("Unlink a method after proving the remaining method")
    @doc("UNLINK attempt must target identityId. Lock user, enforce at least one remaining identity and consume fresh proof. Revoke all sessions and issue new credentials. No generic idempotency; lost response requires login. Commit uses the reserved attempt budget.")
    unlink(@path identityId: Uuid, ...RequestHeaders, ...SessionMutationHeaders, @body body: FinishIdentityAttempt):
        | IdentityCookieOk<AuthenticatedSession>
        | IdentityErrors;

    @get
    @route("/onboarding")
    @operationId("getOnboarding")
    @summary("Resume own saved onboarding draft")
    @doc("Returns server state in DRAFT or COMPLETED, never a public profile. Shares self-read rate limits.")
    onboarding(...RequestHeaders): IdentityOk<Onboarding> | IdentityErrors;

    @patch
    @route("/onboarding")
    @operationId("updateOnboardingDraft")
    @summary("Save a versioned partial draft")
    @doc("Idempotency-Key required; 24h safe response retention encrypted at rest because draft is personal data. Match expectedVersion, increment version once, reject completed/stale writes with DRAFT_VERSION_CONFLICT. Validate locality, timezone and DUPR capability on server. Mutation limits: 30/min/user, 120/min/IP shared with completion and consent changes.")
    saveDraft(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: UpdateDraft):
        | IdentityOk<Onboarding>
        | IdentityErrors;

    @post
    @route("/onboarding/complete")
    @operationId("completeOnboarding")
    @summary("Atomically complete onboarding once")
    @doc("Require all non-null mandatory fields, nonempty formats, current accepted TERMS/PERSONAL_DATA versions and matching draft version. Optional analytics, marketing and DUPR do not gate completion. Lock document publication and consent updates through commit. Existing COMPLETED returns prior completedAt even on a new key. One profile and one domain event; no repeat activation. Shares draft mutation limits; 24h idempotency.")
    complete(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: CompleteOnboarding):
        | IdentityOk<Onboarding>
        | IdentityErrors;

    @get
    @route("/consents")
    @operationId("listMyConsents")
    @summary("Read own consent history")
    @doc("Cursor ordered by occurredAt DESC, id DESC; snapshot upper bound prevents new entries changing page traversal. Cursor bound to user, valid 15m. Shares self-read limits.")
    consents(...RequestHeaders, ...PaginationParameters):
        | IdentityOk<ConsentHistory>
        | IdentityErrors
        | IdentityFailure<400, "INVALID_CURSOR">;

    @post
    @route("/consents")
    @operationId("changeMyConsent")
    @summary("Append explicit acceptance or withdrawal")
    @doc("Only active document version may be accepted; withdrawal targets own accepted version. Required acceptance is never bundled with analytics/marketing. Same state is a no-op. Store immutable document checksum and source, no automatic acceptance on upgrade. Shares draft mutation limits and 24h idempotency.")
    changeConsent(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: ConsentChange):
        | IdentityOk<Consent>
        | IdentityErrors;

    @post
    @route("/deletion")
    @operationId("requestAccountDeletion")
    @summary("Revoke access and schedule account erasure")
    @doc("Requires single-use DELETE_ACCOUNT proof younger than 300s and explicit confirmed=true. Serialize with identity/login, set DELETION_PENDING, hide profile, revoke all sessions/proofs/links and enqueue one erasure event in same transaction. Clear refresh cookie. 202 is acceptance, not completed erasure; no restoration. Repeated request with revoked access gets SESSION_INVALID without another task. Rate: 3/h/user, 10/h/IP.")
    deleteAccount(...RequestHeaders, ...SessionMutationHeaders, @body body: DeleteAccount):
        | IdentityCookieAccepted<DeletionAccepted>
        | IdentityErrors;
}

@tag("Identity")
@useAuth(NoAuth)
@route("/identity/documents")
interface IdentityDocuments {
    @get
    @operationId("listIdentityDocuments")
    @summary("Read current legal and consent documents")
    @doc("Immutable text and SHA-256 checksum, Russian fallback. Only effective approved versions; missing required documents makes auth/onboarding unavailable in production. Read limit: 60/min/IP.")
    list(...RequestHeaders): IdentityOk<ConsentDocuments> | LoginErrors;
    @get
    @route("/{purpose}/{version}")
    @operationId("getIdentityDocumentVersion")
    @summary("Read a historical consent document")
    @doc("Public immutable non-personal document. Read limit shared with document list. Unknown version returns DOCUMENT_NOT_FOUND.")
    version(@path purpose: ConsentPurpose, @path version: DocumentVersion, ...RequestHeaders):
        | IdentityOk<ConsentDocument>
        | LoginErrors
        | IdentityFailure<404, "DOCUMENT_NOT_FOUND">;
}

@tag("Identity")
@useAuth(BearerAuth)
@route("/identity/onboarding-options")
interface IdentityOptions {
    @get
    @operationId("getOnboardingOptions")
    @summary("Read allowed onboarding reference values")
    @doc("Server-approved timezone catalogue and disabled-by-default DUPR URL policy. Shares self-read limits; no provider calls.")
    options(...RequestHeaders): IdentityOk<OnboardingOptions> | IdentityErrors;
    @get
    @route("/localities")
    @operationId("listOnboardingLocalities")
    @summary("Select a preferred locality")
    @doc("Approved local static catalogue, synthetic only until licence/provenance review. Query never logged. Sort name ASC, id ASC; 15m cursor bound to query, user and catalogue version. No device coordinates, address geocoding or venue APIs. Shares self-read limits.")
    localities(
        ...RequestHeaders,
        ...PaginationParameters,

        @query
        @minLength(1)
        @maxLength(120)
        query?: string,
    ): IdentityOk<LocalityPage> | IdentityErrors | IdentityFailure<400, "INVALID_CURSOR">;
}
