# Этап 5. Identity verification

## Промпт агенту

Ты — application security/SDET engineer. Проверь identity end-to-end.

## Проверки

- Contract tests всех auth ошибок без email enumeration.
- Replay, expiry, tampered Telegram hash, concurrent magic-link consume, refresh rotation/reuse и account-link race.
- Cookie flags, CSRF/CORS, cache headers, log/analytics/outbox redaction и session revocation.
- Playwright TMA mock flow и web magic-link/onboarding resume; accessibility и two-timezone cases.
- Account deletion/export behavior согласно текущим требованиям.

## Приёмка

Все threat cases имеют regression tests, production build не содержит fake auth, evidence внесён в AI log.
