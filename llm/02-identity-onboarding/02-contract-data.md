# Этап 2. Identity contracts и данные

## Промпт агенту

Ты — API/security architect. Добавь identity/onboarding в OpenAPI и data model.

## Выполни

- Endpoints: Telegram exchange, magic-link request/consume, refresh/logout/logout-all, current user, identity links, onboarding read/update/complete.
- Модели: `User`, `Identity`, `Session`, `MagicLink`, `Consent`, `PlayerProfileDraft`; unique provider subject/email normalization и token hashes.
- Определи cookie/mobile token transport, CSRF/CORS, idempotency, expiry configuration, rate limits и stable errors.
- Domain events не содержат raw init data, email, link или token.

## Приёмка

OpenAPI lint/codegen проходят; sensitive responses имеют `no-store`; schema и constraints предотвращают duplicate identity. Обнови domain model/ADR/AI log.
