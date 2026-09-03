# Этап 3. Tournament engine backend

## Промпт агенту

Ты — senior algorithms/domain engineer. Implement all preset strategies and orchestration.

## Выполни

- Pure deterministic strategy implementations with seeded randomness where required and invariant/property tests.
- Transactional commands for registration, check-in, seed, generate next round, assign court, score, correct and complete.
- Round advancement never partially applies; correction either rebuilds affected future state safely or is rejected after configured lock.
- Swiss pairing prevents/reduces repeats per documented deterministic policy; double elimination tracks winners/losers brackets; rotations preserve fairness metrics.
- Reuse match scoring primitives where compatible without coupling public match lifecycle.

## Приёмка

Repeated command/event does not duplicate rounds; crash/restart converges; simulations terminate with valid standings for supported sizes.
