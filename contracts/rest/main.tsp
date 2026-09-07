import "@typespec/http";
import "@typespec/openapi";
import "@typespec/openapi3";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{ title: "PickleHub REST API" })
@info(#{ version: "0.1.0", license: #{ name: "Proprietary", identifier: "LicenseRef-Proprietary" } })
@server("/v1", "Version 1, relative to the current API origin")
@doc("Contract-first API for PickleHub clients. All timestamps are UTC RFC 3339 instants and all identifiers are opaque. Product endpoints are added only by their owning feature prompts.")
@tagMetadata(#[#{ name: "Health", description: "Process liveness and mandatory dependency readiness." }])
namespace PickleHub;

@format("uuid")
@pattern("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
@example("0181f32c-7b4a-4f35-8f30-c358f278cb9e")
scalar Uuid extends string;

@doc("Random UUID version 4.")
@pattern("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
scalar UuidV4 extends Uuid;

@doc("UUID generated or accepted by the API for one request.")
scalar RequestId extends UuidV4;

@doc("UUID propagated through related requests, outbox events and jobs.")
scalar CorrelationId extends UuidV4;

@format("date-time")
@pattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$")
@doc("UTC instant serialized as RFC 3339 with a mandatory Z suffix and at most millisecond precision.")
@example("2026-09-03T09:15:30.000Z")
scalar Timestamp extends string;

@pattern("^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$")
@doc("Supported canonical BCP 47 locale tag.")
@example("ru-RU")
scalar Locale extends string;

@minLength(1)
@maxLength(2048)
@pattern("^[A-Za-z0-9_-]+$")
@doc("Opaque, integrity-protected base64url pagination position with a bounded lifetime.")
@example("eyJ2IjoxLCJhZnRlciI6IjAxODFmMzJjIn0")
scalar Cursor extends string;

model PageInfo {
    @doc("Cursor for the next page, or null when no next page exists.")
    nextCursor: Cursor | null;

    @doc("Whether another page existed when this response was created.")
    hasMore: boolean;
}

model ErrorEnvelope {
    error: Error;
    requestId: RequestId;
}

model Error {
    @minLength(3)
    @maxLength(96)
    @pattern("^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
    @doc("Stable machine-readable error code; it is not localized.")
    @example("VALIDATION_FAILED")
    code: string;

    @minLength(1)
    @maxLength(500)
    @doc("Safe localized message without implementation details or sensitive values.")
    message: string;

    @maxItems(50)
    details?: ErrorDetail[];
}

model ErrorDetail {
    @minLength(3)
    @maxLength(96)
    @pattern("^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
    code: string;

    @minLength(1)
    @maxLength(160)
    @pattern("^[A-Za-z0-9_.\\[\\]-]+$")
    @doc("Safe client field path; never contains the rejected value.")
    field?: string;

    @minLength(1)
    @maxLength(500)
    @doc("Safe localized explanation without the rejected value.")
    message: string;
}

enum HealthStatus {
    ok,
    not_ready,
}

model HealthResponse {
    status: HealthStatus;
    checkedAt: Timestamp;
    requestId: RequestId;
}

model RequestHeaders<Id extends RequestId = RequestId> {
    @header("X-Request-ID")
    @doc("Optional caller request identifier. Invalid values are ignored and replaced by the server.")
    requestId?: Id;

    @header("X-Correlation-ID")
    @doc("Optional identifier joining work across requests. Invalid values are ignored and replaced.")
    correlationId?: CorrelationId;

    @header("Accept-Language")
    @minLength(2)
    @maxLength(128)
    @doc("Preferred BCP 47 response locale. Russian is used when no supported locale matches.")
    acceptLanguage?: string;
}

model StandardResponseHeaders<Id extends RequestId = RequestId> {
    @header("X-Request-ID")
    @doc("Server-validated request identifier, also present in response bodies where defined.")
    requestId: Id;

    @header("X-Correlation-ID")
    @doc("Server-validated identifier joining related requests and background work.")
    correlationId: CorrelationId;

    @header("Content-Language")
    @doc("BCP 47 locale used for human-readable text in the response.")
    contentLanguage: Locale;
}

model RetryAfterHeader<Seconds extends int32 = int32> {
    @header("Retry-After")
    @minValue(0)
    @doc("Non-negative whole seconds before the client should retry.")
    retryAfter: Seconds;
}

model PaginationParameters<Position extends Cursor = Cursor> {
    @query
    @doc("Opaque base64url cursor returned by the preceding page; clients must not parse or create it.")
    cursor?: Position;

    @query
    @minValue(1)
    @maxValue(100)
    @doc("Maximum number of items requested. Endpoints may document a lower maximum.")
    limit?: int32 = 20;
}

model IdempotencyHeaders<Key extends UuidV4 = UuidV4> {
    @header("Idempotency-Key")
    @doc("UUID supplied for a retryable mutation. It is scoped to the authenticated subject, method and canonical path. Reusing it with a different request fingerprint returns IDEMPOTENCY_KEY_REUSED.")
    idempotencyKey: Key;

    @header("Idempotency-Replayed")
    @doc("True when the server returns the stored response for the same idempotency key and fingerprint.")
    idempotencyReplayed?: boolean;
}

@doc("The process is live.")
model LivenessOkResponse {
    @statusCode statusCode: 200;
    ...StandardResponseHeaders;
    @body body: HealthResponse;
}

@doc("The API and all mandatory dependencies are ready.")
model ReadinessOkResponse {
    @statusCode statusCode: 200;
    ...StandardResponseHeaders;
    @body body: HealthResponse;
}

@error
@doc("At least one mandatory dependency is unavailable.")
model NotReadyResponse {
    @statusCode statusCode: 503;
    ...StandardResponseHeaders;
    ...RetryAfterHeader;
    @body body: HealthResponse;
}

@error
@doc("The applicable rate limit was exceeded.")
model TooManyRequestsResponse {
    @statusCode statusCode: 429;
    ...StandardResponseHeaders;
    ...RetryAfterHeader;
    @body body: ErrorEnvelope;
}

@route("/health")
@tag("Health")
@useAuth(NoAuth)
interface Health {
    @get
    @route("/live")
    @operationId("getLiveness")
    @summary("Check process liveness")
    @doc("Reports whether the API process can continue serving requests without probing dependencies.")
    getLiveness(...RequestHeaders): LivenessOkResponse | TooManyRequestsResponse;

    @get
    @route("/ready")
    @operationId("getReadiness")
    @summary("Check service readiness")
    @doc("Reports whether every mandatory dependency is ready without exposing dependency details.")
    getReadiness(...RequestHeaders): ReadinessOkResponse | NotReadyResponse | TooManyRequestsResponse;
}
