# Platform foundation: контекст

## Ценность

Создать воспроизводимый contract-first монорепозиторий, в котором backend, TMA и web/PWA развиваются независимо, но не расходятся по данным и поведению.

## Scope

- npm workspaces/Turborepo, root quality gates и единый lockfile.
- NestJS modular monolith, React web/PWA и TMA, shared non-UI packages.
- OpenAPI, AsyncAPI, PostgreSQL/PostGIS, Redis/BullMQ, outbox и provider ports.
- Local Docker environment, health, config validation, logging/redaction и CI skeleton.

## Non-goals

Не реализовывать пользователей, площадки, матчи или UI бизнес-фич. Не создавать mobile до каталога `14`.

## Готовность

Пустые приложения устанавливаются, проверяются, собираются и запускаются; contracts генерируют клиент; health проверяет обязательные зависимости.
