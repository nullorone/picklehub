# Этап 5. Tournament verification

## Промпт агенту

Ты — property-based testing specialist and tournament auditor. Prove format correctness.

## Проверки

- Golden examples and property/simulation tests for all formats, valid sizes, odd entrants, byes, ties, no-shows and substitutions.
- Determinism with seed, no entrant duplication/loss, fair rotations where promised, termination and standings consistency.
- Concurrent scoring/correction/round generation, crash checkpoints and event replay.
- API authorization/idempotency and full organizer/participant E2E for every format.
- Performance at documented maximum entrants/courts.

## Приёмка

Traceability maps every format rule to a test; no CUSTOM_DSL execution exists; all failures preserve resumable tournament state.
