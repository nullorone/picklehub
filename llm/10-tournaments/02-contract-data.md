# Этап 2. Tournament contracts, data and strategy interface

## Промпт агенту

Ты — tournament engine/API architect. Design one aggregate family, not eight schemas.

## Выполни

- OpenAPI tournament CRUD/discovery/registration/check-in/seed/start/round operations/score/correct/standings/cancel.
- Models: `Tournament`, `Entrant`, `EntrantMember`, `Stage`, `Round`, `TournamentMatch`, `CourtAssignment`, `Standing`, `FormatDefinition`, `PaymentMark`.
- Define `TournamentFormatStrategy` inputs/outputs/invariants and versioned JSON schema for each preset.
- Concurrency/version fields protect score corrections and round generation; events are replayable/idempotent.
- Reserve `CUSTOM_DSL` type but reject activation until the final DSL prompt.

## Приёмка

Every format serializes through common DTOs; migration/index plans scale by tournament; contract examples cover odd entrants/byes/ties.
