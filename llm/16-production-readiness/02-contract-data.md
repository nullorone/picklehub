# Этап 2. Operations contracts and migrations

## Промпт агенту

Ты — production database/API reliability architect. Audit contracts and migration strategy.

## Выполни

- Add/version health, readiness and metrics interfaces without exposing internals/secrets.
- Define backward-compatible API/event rollout, deprecation and generated-client compatibility checks.
- Review every migration for expand/migrate/contract, lock/runtime risk, rollback/forward-fix and backup requirement.
- Define data retention/deletion/export jobs and object/Redis/PostgreSQL consistency repair.
- Create provider-neutral production env matrix and secret ownership/rotation plan.

## Приёмка

One-version rolling compatibility is documented/tested where deployment topology requires it; destructive migration has explicit approved runbook.
