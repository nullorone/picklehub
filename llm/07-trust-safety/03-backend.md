# Этап 3. Trust & safety backend

## Промпт агенту

Ты — senior marketplace safety engineer. Реализуй reports, blocks and moderation preparation.

## Выполни

- Enforce post-match eligibility and one effective review/report per policy; validate categories before free text.
- Block takes effect immediately in discovery, invites, join requests and direct chat while preserving historical/audit records.
- Build case creation/assignment state machine, restricted repository access, audit and safe notifications.
- Reputation projection uses only approved signals and can be rebuilt/overturned.

## Приёмка

Concurrent reports do not duplicate case effect; moderator data inaccessible to players; block rules apply across modules. Run privacy/integration tests.
