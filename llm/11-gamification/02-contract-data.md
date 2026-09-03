# Этап 2. Gamification contracts и ledger

## Промпт агенту

Ты — event-sourced projection/data architect. Add progression schemas and APIs.

## Выполни

- Endpoints: own/global/club progress, achievements, season leaderboard opt-in and admin/club template views.
- Models: immutable `XpLedgerEntry`, `LevelDefinition`, `AchievementDefinition/Award`, `LeaderboardSeason/Entry`, processed-event dedupe.
- Version rule definitions; preserve historical calculation version and use compensating entries, never mutate ledger history.
- Events/payloads use opaque IDs and do not expose private activity.

## Приёмка

Unique source event prevents double award; global and each club partition remain independent; leaderboard excludes non-opt-in players.
