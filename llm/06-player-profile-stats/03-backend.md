# Этап 3. Profile/statistics backend

## Промпт агенту

Ты — senior NestJS projections engineer. Реализуй profile и stats modules.

## Выполни

- Validate display name/bio/preferences/level and optional DUPR URL/ID; do not call/scrape DUPR.
- Build idempotent confirmed-match consumer and administrative rebuild command with checkpoint/audit.
- Enforce public/private DTOs, blocks, cursor history and avatar storage adapter.
- Handle result dispute/overturn by compensating/rebuilding projection, never ad-hoc decrement races.

## Приёмка

Duplicate/out-of-order events converge to correct stats; guest slots ignored; rebuild is restartable. Run integration/concurrency tests.
