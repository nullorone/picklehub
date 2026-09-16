using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace PickleHub;

@doc("Version of the allowlisted operational metric names and labels, independent from the application release.")
enum OperationalMetricsSchemaVersion {
    v1: "1",
}

model OperationalMetricsHeaders {
    ...StandardResponseHeaders;

    @header("Cache-Control")
    cacheControl: "no-store";

    @header("Content-Type")
    contentType: "application/openmetrics-text; version=1.0.0; charset=utf-8";

    @header("X-Metrics-Schema-Version")
    schemaVersion: OperationalMetricsSchemaVersion;
}

@doc("An OpenMetrics 1.0 payload containing only reviewed metric families and bounded labels.")
model OperationalMetricsOkResponse {
    @statusCode statusCode: 200;
    ...OperationalMetricsHeaders;
    @body body: string;
}

@error
@doc("The scrape credential is absent, expired or invalid. The response never distinguishes those cases.")
model OperationalMetricsUnauthorizedResponse {
    @statusCode statusCode: 401;
    ...StandardResponseHeaders;
    @header("Cache-Control") cacheControl: "no-store";
    @body body: ErrorEnvelope;
}

@error
@doc("Metrics collection is temporarily unavailable. Product readiness is evaluated independently.")
model OperationalMetricsUnavailableResponse {
    @statusCode statusCode: 503;
    ...StandardResponseHeaders;
    ...RetryAfterHeader;
    @header("Cache-Control") cacheControl: "no-store";
    @body body: ErrorEnvelope;
}

@tag("Operations")
@route("/operations")
interface Operations {
    @get
    @route("/metrics")
    @operationId("scrapeOperationalMetricsV1")
    @summary("Scrape versioned operational metrics")
    @doc("Restricted to the private monitoring network and a separately rotated scrape credential. The v1 allowlist excludes user, match, club, provider response, raw URL, IP, coordinates, object keys and arbitrary error text from names, labels and exemplars. A schema change that removes or redefines a family requires a new metrics schema version and an overlap window.")
    @useAuth(ApiKeyAuth<ApiKeyLocation.header, "X-Operations-Key">)
    metrics(...RequestHeaders):
        | OperationalMetricsOkResponse
        | OperationalMetricsUnauthorizedResponse
        | OperationalMetricsUnavailableResponse
        | TooManyRequestsResponse;
}
