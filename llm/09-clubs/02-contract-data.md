# Этап 2. Club contracts и данные

## Промпт агенту

Ты — multi-tenant API/data architect. Add clubs without creating separate tenant databases.

## Выполни

- OpenAPI discovery/details/CRUD, membership request/invite/role/leave, venue links and recurring series/occurrences.
- Models: `Club`, `ClubMembership`, `ClubInvitation`, `ClubVenue`, `RecurringMatchRule`, occurrence source link.
- Constraints protect unique active membership, last owner and idempotent recurrence generation in UTC with explicit local timezone/DST policy.
- Scoped authorization and events include club ID, not sensitive member details.

## Приёмка

Contracts/migrations handle club without venue, ownership transfer and DST recurrence deterministically. Generated client passes.
