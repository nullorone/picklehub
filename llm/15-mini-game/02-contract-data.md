# Этап 2. Mini-game contracts и reward data

## Промпт агенту

Ты — game backend/API architect. Design session/reward interfaces without trusting client score blindly.

## Выполни

- Endpoints: issue short game session/challenge, submit bounded result, read cosmetics/goals and claim idempotent reward.
- Models: `GameSession`, `GameResult`, `RewardGrant`, `CosmeticUnlock`, processed challenge/nonce; strict TTL and daily caps.
- Define signed challenge/result evidence appropriate for casual risk, acknowledging it cannot eliminate a modified client.
- Events integrate with XP ledger through capped source type; no direct balance mutation.

## Приёмка

Replay/duplicate submit grants once, expired/impossible result rejects, client bundle contains no signing secret, contracts are platform-neutral.
