# Этап 3. Mini-game backend

## Промпт агенту

Ты — game services/abuse engineer. Implement bounded sessions, validation and rewards.

## Выполни

- Issue nonce/challenge, validate TTL/range/session ownership and consume submission atomically.
- Apply configurable daily caps, anomaly metrics and audited disable switch; do not build invasive device fingerprinting.
- Publish idempotent reward event to gamification ledger and support reversal/season boundaries.
- Add rate limits and load protection isolated from match endpoints.

## Приёмка

Concurrent/replayed/impossible submissions never overgrant; game outage/abuse switch leaves match product healthy.
