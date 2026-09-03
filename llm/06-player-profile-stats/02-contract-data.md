# Этап 2. Profile/statistics contracts и данные

## Промпт агенту

Ты — API/data projection architect. Добавь profile API и read models.

## Выполни

- Endpoints: own profile/preferences/privacy, public player, cursor match history and stats breakdown, DUPR external link validate/remove.
- Separate mutable `PlayerProfile` from rebuildable `PlayerStatistics` projection and processed-event dedupe.
- Определи public DTO minimization, block behavior, avatar object keys and signed upload policy.
- Events cover profile changes and stats rebuild without PII.

## Приёмка

Projection update is idempotent, recalculation matches event source, private fields never appear in public schema. Contract/migration tests pass.
