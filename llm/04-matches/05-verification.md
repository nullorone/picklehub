# Этап 5. Match verification

## Промпт агенту

Ты — concurrency-focused SDET. Построй traceability matrix и закрой критические риски матча.

## Проверки

- Unit state-machine/score/recommendation/timezone tests.
- PostgreSQL concurrency: auto join/join, approvals, leave/promotion, cancel/start, propose/confirm/dispute.
- API contract/authorization/idempotency and unlisted leakage tests.
- Playwright create → discover → join → full roster → result → opponent confirm в TMA и web.
- Offline/stale conflict, guest placeholder, no available venues and external booking states.

## Приёмка

Capacity никогда не превышена, completion event/statistics создаются один раз, north-star event доказан E2E. Зафиксируй timings и evidence.
