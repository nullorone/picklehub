# Этап 4. Web admin UI

## Промпт агенту

Ты — senior operations frontend engineer. Реализуй backoffice только в `frontend/web`.

## Выполни

- Separate protected layout/routes, explicit current role and no admin bundle/navigation in TMA.
- Case queue/detail/decision, venue candidate compare/merge, user restriction and audit views.
- Permission-aware UI supplements, but never replaces, backend authorization.
- Add reason forms, destructive confirmations, stale-case conflict handling, accessible tables/filters and sensitive-data masking.

## Приёмка

Deep links reauthenticate safely, browser history/cache do not expose case narratives after logout, role-specific E2E passes.
