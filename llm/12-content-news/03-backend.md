# Этап 3. Content backend and ingestion

## Промпт агенту

Ты — senior CMS/integration engineer. Implement editorial module and safe source adapters.

## Выполни

- Allowlisted RSS/API polling through BullMQ with ETag/checkpoints/backoff and candidate dedupe.
- Persist only permitted metadata/excerpts; never bypass robots, auth, paywalls or source terms.
- Editorial revisions, scheduling, sanitized rendering, object storage media and immutable provenance/audit.
- Search uses PostgreSQL capabilities first; no external search cluster.
- Takedown unpublishes quickly while preserving restricted audit.

## Приёмка

Replay/source outage creates no duplicate/loss; scheduler is idempotent; sanitizer and SSR/SPA rendering are XSS-safe.
