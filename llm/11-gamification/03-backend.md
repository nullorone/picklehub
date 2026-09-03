# Этап 3. Gamification backend

## Промпт агенту

Ты — senior event-processing engineer. Implement ledger, levels, achievements and leaderboards.

## Выполни

- Idempotent consumers for eligible confirmed domain events and compensations for overturned outcomes.
- Deterministic rules engine with versioned global rules and validated club template coefficients.
- Projection/rebuild jobs, seasonal rollover and opt-in leaderboard snapshots.
- Abuse caps/rate metrics and admin audit for definition changes; no direct arbitrary XP mutation without audited adjustment entry.

## Приёмка

Duplicate/out-of-order events converge; rebuild equals incremental result; club admin cannot affect global XP or another club.
