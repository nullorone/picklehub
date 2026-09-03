# Этап 3. Container, observability and resilience hardening

## Промпт агенту

Ты — senior platform/SRE engineer. Harden the current system without microservices/Kubernetes.

## Выполни

- Multi-stage non-root images, Compose reference, migration release command, graceful shutdown and resource limits.
- Structured logs/redaction, metrics, traces/error reporting, dashboards and alerts for critical journeys/outbox/queues/providers.
- Timeouts, circuit breakers/backoff, bulkheads, rate/body limits, readiness semantics and kill switches.
- Backup/restore, queue replay/DLQ, outbox reconciliation and incident runbooks.
- Provider configuration supports verified РФ-resident managed PostgreSQL/PostGIS, Redis and object storage.

## Приёмка

Restart/provider failure loses no committed domain event; restore drill and migration rehearsal use disposable environments; images contain no secrets/dev deps.
