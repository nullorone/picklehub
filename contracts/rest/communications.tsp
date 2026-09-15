using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

enum ConversationState {
    WRITABLE,
    READ_ONLY,
}

enum MessageKind {
    USER,
    SYSTEM,
}

enum SystemMessageType {
    ROSTER_JOINED,
    ROSTER_LEFT,
    MATCH_CANCELLED,
    MATCH_TIME_CHANGED,
    MATCH_VENUE_CHANGED,
    MATCH_STARTED,
    RESULT_PROPOSED,
    RESULT_CONFIRMED,
    RESULT_DISPUTED,
}

enum NotificationCategory {
    ROSTER,
    REQUESTS,
    MATCH_CRITICAL,
    REMINDERS,
    RESULTS,
    CHAT,
}

enum NotificationChannel {
    IN_APP,
    TELEGRAM,
    EMAIL,
    PUSH,
}

enum NotificationDeliveryStatus {
    PENDING,
    DEFERRED,
    PROCESSING,
    ACCEPTED,
    DELIVERED,
    FAILED,
    SUPPRESSED,
    QUARANTINED,
}

enum NotificationType {
    ROSTER_CHANGED,
    JOIN_REQUESTED,
    JOIN_REQUEST_RESOLVED,
    WAITLIST_CHANGED,
    MATCH_CANCELLED,
    MATCH_CHANGED,
    MATCH_REMINDER,
    RESULT_ACTION_REQUIRED,
    RESULT_CONFIRMED,
    RESULT_DISPUTED,
    CHAT_MESSAGE,
}

enum CommunicationPlatform {
    WEB,
    TMA,
    MOBILE,
}

enum MobileOperatingSystem {
    IOS,
    ANDROID,
}

enum PushEnvironment {
    SANDBOX,
    PRODUCTION,
}

enum ChatReportReason {
    SPAM,
    HARASSMENT,
    HATE,
    THREAT,
    OTHER,
}

@minLength(1)
@maxLength(2000)
@doc("NFKC-normalized, trimmed plain text without control characters or HTML. Never log or copy to generic outbox/job data.")
scalar ChatText extends string;

@minLength(1)
@maxLength(64)
@pattern("^[A-Za-z][A-Za-z0-9_./-]*$")
scalar SafeNotificationRoute extends string;

model Conversation {
    id: Uuid;
    matchId: Uuid;
    state: ConversationState;
    @minValue(0) version: int32;
    @minValue(0) latestSequence: int64;
    @minValue(0) lastReadSequence: int64;
    @minValue(0) unreadCount: int32;
    accessExpiresAt: Timestamp | null;
    accessThroughSequence: int64 | null;
}

model Message {
    id: Uuid;
    conversationId: Uuid;
    @minValue(1) sequence: int64;
    kind: MessageKind;
    authorId: Uuid | null;
    text: ChatText | null;
    systemType: SystemMessageType | null;
    @minValue(1) revision: int32;
    editedAt: Timestamp | null;
    deletedAt: Timestamp | null;
    createdAt: Timestamp;
}

model ConversationSnapshot {
    conversation: Conversation;
    @maxItems(50) messages: Message[];
    backwardCursor: Cursor | null;
    catchUpCursor: Cursor;
}

model MessagePage {
    @maxItems(50) items: Message[];
    pageInfo: PageInfo;
    catchUpCursor: Cursor;
}

model SendMessageCommand {
    text: ChatText;
}

model EditMessageCommand {
    @minValue(1) expectedRevision: int32;
    text: ChatText;
}

model MarkConversationReadCommand {
    @minValue(0) throughSequence: int64;
}

model ConversationReadPosition {
    conversationId: Uuid;
    @minValue(0) lastReadSequence: int64;
    @minValue(0) unreadCount: int32;
}

model ReportMessageCommand {
    @minValue(1) revision: int32;
    reason: ChatReportReason;
}

model MessageReportReceipt {
    reportId: Uuid;
    status: "RECEIVED";
    createdAt: Timestamp;
}

model UserBlock {
    blockedUserId: Uuid;
    createdAt: Timestamp;
}

model Notification {
    id: Uuid;
    type: NotificationType;
    category: NotificationCategory;
    route: SafeNotificationRoute;

    @doc("Closed structured destination for native navigation. Null means open the notification inbox. It never contains a URL, query, fragment, secret or mutation command.")
    mobileTarget?: MobileDeepLinkTarget | null;

    readAt: Timestamp | null;
    createdAt: Timestamp;
    deliveries: NotificationDelivery[];
}

model NotificationDelivery {
    id: Uuid;
    channel: "TELEGRAM" | "EMAIL" | "PUSH";

    @doc("Transport state only. ACCEPTED/DELIVERED never means the person read the notification.")
    status: NotificationDeliveryStatus;

    notBefore: Timestamp;
    lastAttemptAt: Timestamp | null;
    terminalAt: Timestamp | null;
}

model NotificationPage {
    items: Notification[];
    pageInfo: PageInfo;
}

model NotificationReadReceipt {
    notificationId: Uuid;
    readAt: Timestamp;
}

model QuietHours {
    enabled: boolean;
    @pattern("^(?:[01]\\d|2[0-3]):[0-5]\\d$") startLocal: string;
    @pattern("^(?:[01]\\d|2[0-3]):[0-5]\\d$") endLocal: string;
}

model NotificationChannelPreference {
    category: NotificationCategory;
    channel: NotificationChannel;
    enabled: boolean;
}

model NotificationPreference {
    @minValue(0) version: int32;
    locale: Locale;
    @minLength(1) @maxLength(64) timeZone: string;
    @minLength(1) @maxLength(32) tzdataVersion: string;
    quietHours: QuietHours;
    channels: NotificationChannelPreference[];
    updatedAt: Timestamp;
}

model UpdateNotificationPreference {
    @minValue(0) expectedVersion: int32;
    locale: Locale;
    @minLength(1) @maxLength(64) timeZone: string;
    quietHours: QuietHours;
    channels: NotificationChannelPreference[];
}

model NotificationDevice {
    installationId: UuidV4;
    platform: CommunicationPlatform;
    createdAt: Timestamp;
    lastSeenAt: Timestamp;
    activePushRegistration?: PushRegistration | null;
}

model BindNotificationDevice {
    installationId: UuidV4;
    platform: CommunicationPlatform;
}

@minLength(1)
@maxLength(4096)
@doc("Opaque OS/provider push token accepted only in a TLS request body. It is encrypted at rest, keyed by HMAC for deduplication, and never returned, logged, audited, placed in events or sent to analytics.")
scalar PushToken extends string;

@minLength(1)
@maxLength(64)
@pattern("^[0-9A-Za-z][0-9A-Za-z.+_-]*$")
scalar MobileAppVersion extends string;

model RegisterPushToken {
    operatingSystem: MobileOperatingSystem;
    environment: PushEnvironment;
    appVersion: MobileAppVersion;
    token: PushToken;
}

model PushRegistration {
    id: Uuid;
    installationId: UuidV4;
    operatingSystem: MobileOperatingSystem;
    environment: PushEnvironment;
    appVersion: MobileAppVersion;
    createdAt: Timestamp;
    lastSeenAt: Timestamp;
    expiresAt: Timestamp;
    revokedAt: Timestamp | null;
}

model NotificationDevicePage {
    items: NotificationDevice[];
}

@doc("Neutral lock-screen payload. notificationId is an opaque refetch signal, not proof of state or read. No chat text, player, venue, address, safety data, route, token or provider URL is allowed.")
model NeutralPushPayload {
    schemaVersion: 1;
    notificationId: Uuid;
    action: "OPEN_NOTIFICATION";
}

@minLength(32)
@maxLength(256)
@pattern("^ws1_[A-Za-z0-9_-]+$")
scalar WebSocketTicket extends string;

model RealtimeTicket {
    @doc("Single-use secret presented as the first WebSocket message, never in a URL or log.")
    ticket: WebSocketTicket;

    expiresAt: Timestamp;
}

model CommunicationResponseHeaders {
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
}

model CommunicationOk<T> {
    @statusCode statusCode: 200;
    ...CommunicationResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model CommunicationCreated<T> {
    @statusCode statusCode: 201;
    ...CommunicationResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
    @body body: T;
}

model CommunicationNoContent {
    @statusCode statusCode: 204;
    ...CommunicationResponseHeaders;
    @header("Idempotency-Replayed") idempotencyReplayed?: boolean;
}

model CommunicationError<Code extends string> {
    error: {
        code: Code;
        message: string;
        details?: ErrorDetail[];
    };
    requestId: RequestId;
}

@error
model CommunicationFailure<Status extends int32, Code extends string> {
    @statusCode statusCode: Status;
    ...CommunicationResponseHeaders;
    @body body: CommunicationError<Code>;
}

@error
model CommunicationRateLimited {
    @statusCode statusCode: 429;
    ...CommunicationResponseHeaders;
    ...RetryAfterHeader;
    @body body: CommunicationError<"RATE_LIMITED">;
}

alias CommunicationReadErrors =
    | CommunicationFailure<400, "VALIDATION_FAILED" | "INVALID_CURSOR" | "CURSOR_EXPIRED" | "RESYNC_REQUIRED">
    | CommunicationFailure<401, "SESSION_INVALID">
    | CommunicationFailure<403, "CONVERSATION_ACCESS_DENIED">
    | CommunicationFailure<404, "CONVERSATION_NOT_FOUND" | "MESSAGE_NOT_FOUND" | "NOTIFICATION_NOT_FOUND">
    | CommunicationRateLimited;

alias CommunicationMutationErrors =
    | CommunicationFailure<400, "VALIDATION_FAILED">
    | CommunicationFailure<401, "SESSION_INVALID">
    | CommunicationFailure<403, "CONVERSATION_ACCESS_DENIED" | "MESSAGE_MUTATION_FORBIDDEN">
    | CommunicationFailure<
          404,
          | "CONVERSATION_NOT_FOUND"
          | "MESSAGE_NOT_FOUND"
          | "NOTIFICATION_NOT_FOUND"
          | "NOTIFICATION_DEVICE_NOT_FOUND"
          | "PUSH_REGISTRATION_NOT_FOUND"
      >
    | CommunicationFailure<409, "MESSAGE_REVISION_CONFLICT" | "IDEMPOTENCY_KEY_REUSED" | "PREFERENCE_VERSION_CONFLICT">
    | CommunicationRateLimited;

@tag("Communications")
@route("/matches/{matchId}/conversation")
@useAuth(BearerAuth)
interface MatchConversation {
    @get
    @operationId("getMatchConversation")
    @summary("Open an authorized conversation snapshot")
    @doc("Server authorizes current or bounded former membership on every request. Returns the last 50 accessible items in sequence order plus opaque backward and forward catch-up cursors. Pending applicants, waitlist entries, guests and invite capabilities grant no access.")
    snapshot(@path matchId: Uuid, ...RequestHeaders): CommunicationOk<ConversationSnapshot> | CommunicationReadErrors;

    @get
    @route("/messages")
    @operationId("listConversationMessages")
    @summary("Page history backward or catch up forward")
    @doc("Cursor is short-lived and bound to user, conversation, direction and access-through sequence. PostgreSQL sequence is authoritative; an expired/retained/gapped cursor returns RESYNC_REQUIRED and the client must reopen the snapshot.")
    history(
        @path matchId: Uuid,
        ...RequestHeaders,
        @query cursor: Cursor,

        @query
        @minValue(1)
        @maxValue(50)
        limit?: int32 = 50,
    ): CommunicationOk<MessagePage> | CommunicationReadErrors;

    @post
    @route("/messages")
    @operationId("sendConversationMessage")
    @summary("Send a REST fallback chat command")
    @doc("Online fallback for the WebSocket create command. Atomically authorizes membership, allocates one conversation sequence, stores text and a privacy-minimized outbox reference. A replay returns the same message and sequence.")
    send(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: SendMessageCommand,
    ): CommunicationCreated<Message> | CommunicationMutationErrors;

    @patch
    @route("/messages/{messageId}")
    @operationId("editConversationMessage")
    @summary("Edit an owned message within the policy window")
    @doc("Only the current author may append a normalized revision within 15 minutes while the conversation is writable. The sequence is unchanged and expectedRevision prevents lost updates.")
    edit(
        @path matchId: Uuid,
        @path messageId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: EditMessageCommand,
    ): CommunicationOk<Message> | CommunicationMutationErrors;

    @delete
    @route("/messages/{messageId}")
    @operationId("deleteConversationMessage")
    @summary("Replace an owned message with a tombstone")
    @doc("Only the current author may append a tombstone within 15 minutes while writable. The original sequence remains reserved and immutable report evidence is retained separately.")
    remove(
        @path matchId: Uuid,
        @path messageId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @query @minValue(1) expectedRevision: int32,
    ): CommunicationOk<Message> | CommunicationMutationErrors;

    @post
    @route("/read")
    @operationId("markConversationRead")
    @summary("Advance the foreground read position monotonically")
    @doc("Accepts only an accessible displayed sequence and applies max(previous, throughSequence). WebSocket/provider delivery does not invoke this operation or imply human read.")
    markRead(
        @path matchId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: MarkConversationReadCommand,
    ): CommunicationOk<ConversationReadPosition> | CommunicationMutationErrors;

    @post
    @route("/messages/{messageId}/reports")
    @operationId("reportConversationMessage")
    @summary("Report a specific immutable message revision")
    @doc("Creates one structured report and protected evidence snapshot for the selected revision. No free text is accepted and later message edits cannot alter evidence.")
    report(
        @path matchId: Uuid,
        @path messageId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: ReportMessageCommand,
    ): CommunicationCreated<MessageReportReceipt> | CommunicationMutationErrors;
}

@tag("Communications")
@route("/communication-blocks/{blockedUserId}")
@useAuth(BearerAuth)
interface CommunicationBlocks {
    @put
    @operationId("blockCommunicationUser")
    @summary("Hide future chat text from one user")
    @doc("Creates an idempotent platform-wide safety preference. New direct profile, search, invite, join, request, waitlist, promotion and chat interactions are denied in both directions without changing an existing shared match or required system facts.")
    block(@path blockedUserId: Uuid, ...RequestHeaders, ...SessionMutationHeaders, ...MutationKey):
        | CommunicationOk<UserBlock>
        | CommunicationMutationErrors;

    @delete
    @operationId("unblockCommunicationUser")
    @summary("Remove the caller's active block")
    @doc("Allows only future direct interactions when no reciprocal block or moderation restriction exists. It never restores removed requests, promotions or content and does not reveal another party's block.")
    unblock(@path blockedUserId: Uuid, ...RequestHeaders, ...SessionMutationHeaders, ...MutationKey):
        | CommunicationNoContent
        | CommunicationMutationErrors;
}

@tag("Communications")
@route("/notifications")
@useAuth(BearerAuth)
interface Notifications {
    @get
    @operationId("listNotifications")
    @summary("List the authenticated user's persistent inbox")
    @doc("Returns only the caller's logical in-app items in stable createdAt DESC, ID DESC order. Provider acceptance/delivery is not exposed as human read.")
    list(...RequestHeaders, ...PaginationParameters): CommunicationOk<NotificationPage> | CommunicationReadErrors;

    @post
    @route("/{notificationId}/read")
    @operationId("markNotificationRead")
    @summary("Mark one in-app notification read by foreground action")
    @doc("Marks only the caller's item after foreground display. Replays return the same read timestamp and external transport receipts never invoke this operation.")
    read(@path notificationId: Uuid, ...RequestHeaders, ...SessionMutationHeaders, ...MutationKey):
        | CommunicationOk<NotificationReadReceipt>
        | CommunicationMutationErrors;
}

@tag("Communications")
@route("/notification-preferences")
@useAuth(BearerAuth)
interface NotificationPreferences {
    @get
    @operationId("getNotificationPreferences")
    @summary("Read notification locale, timezone and channel choices")
    @doc("Returns the caller's versioned settings. IN_APP is always enabled; external categories default off until explicitly enabled.")
    get(...RequestHeaders): CommunicationOk<NotificationPreference> | CommunicationReadErrors;

    @put
    @operationId("updateNotificationPreferences")
    @summary("Replace versioned locale, timezone, quiet hours and external channel choices")
    @doc("IN_APP is mandatory and cannot be disabled. TELEGRAM and EMAIL categories default off and require a verified identity. Changes affect future fan-out and pending attempts, not existing inbox items.")
    update(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: UpdateNotificationPreference):
        | CommunicationOk<NotificationPreference>
        | CommunicationMutationErrors;
}

@tag("Communications")
@route("/notification-devices")
@useAuth(BearerAuth)
interface NotificationDevices {
    @get
    @operationId("listNotificationDevices")
    @summary("List caller-owned installations without push secrets")
    @doc("Supports lost-device revocation from another authenticated session. Returns no token, provider identifier or device fingerprint. Revoked installations remain visible only for the bounded account-security retention window.")
    list(...RequestHeaders): CommunicationOk<NotificationDevicePage> | CommunicationReadErrors;

    @post
    @operationId("bindNotificationDevice")
    @summary("Bind an opaque client installation")
    @doc("A random purpose-bound installation ID may be bound to only one user at a time. MOBILE binding contains no push token; registration is a separate versioned operation. Account switch must revoke the old binding before reuse.")
    bind(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: BindNotificationDevice):
        | CommunicationCreated<NotificationDevice>
        | CommunicationMutationErrors;

    @delete
    @route("/{installationId}")
    @operationId("unbindNotificationDevice")
    @summary("Revoke an installation and all of its push registrations")
    @doc("Revokes only the caller-owned installation, including every active or rotated push token, so a lost device can be disabled from another session. It does not delete inbox items or silently change Telegram/email preferences.")
    unbind(@path installationId: UuidV4, ...RequestHeaders, ...SessionMutationHeaders, ...MutationKey):
        | CommunicationNoContent
        | CommunicationMutationErrors;
}

@tag("Communications")
@route("/notification-devices/{installationId}/push-registrations")
@useAuth(BearerAuth)
interface PushRegistrations {
    @post
    @operationId("registerPushToken")
    @summary("Register or rotate a mobile push token")
    @doc("MOBILE installation only. Atomically HMAC-deduplicates the token, encrypts it, revokes the previous active token for the same installation/environment and returns no secret. Retry with the same idempotency key is stable. Registrations expire after 90 days without authenticated activity; sandbox and production never mix. The adapter remains fail-closed until provider, privacy, legal and residency review.")
    register(
        @path installationId: UuidV4,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
        @body body: RegisterPushToken,
    ): CommunicationCreated<PushRegistration> | CommunicationMutationErrors;

    @delete
    @route("/{registrationId}")
    @operationId("revokePushRegistration")
    @summary("Revoke one caller-owned push registration")
    @doc("Immediately marks the selected token unusable without exposing whether a provider still recognizes it. Provider invalid-token feedback invokes the same transition idempotently.")
    revoke(
        @path installationId: UuidV4,
        @path registrationId: Uuid,
        ...RequestHeaders,
        ...SessionMutationHeaders,
        ...MutationKey,
    ): CommunicationNoContent | CommunicationMutationErrors;
}

@tag("Communications")
@route("/realtime/tickets")
@useAuth(BearerAuth)
interface RealtimeTickets {
    @post
    @operationId("createRealtimeTicket")
    @summary("Issue a single-use WebSocket authentication ticket")
    @doc("Binds a random single-use ticket to the authenticated user, session and current auth epoch for at most 60 seconds. It is returned only in this no-store body, presented as the first WebSocket message and consumed atomically. Reconnect obtains a fresh ticket; stream cursors remain opaque and cursor expiry/gaps require canonical REST resync.")
    create(...RequestHeaders, ...SessionMutationHeaders, ...MutationKey, @body body: EmptyRequest):
        | CommunicationCreated<RealtimeTicket>
        | CommunicationMutationErrors;
}
