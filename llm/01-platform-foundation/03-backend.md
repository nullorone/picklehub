# Этап 3. Backend scaffold

## Промпт агенту

Ты — senior NestJS/platform engineer. Создай `backend/` без product use cases.

## Выполни

1. Настрой NestJS, strict TypeScript, Prisma, PostgreSQL/PostGIS migration baseline, Redis/BullMQ и typed env validation.
2. Создай `common`, `health`, `outbox`, `integrations`, `audit` boundaries; controllers не обращаются к Prisma напрямую.
3. Реализуй liveness/readiness, structured logs, correlation ID, redaction, graceful shutdown и global validation/error mapping по OpenAPI.
4. Outbox должен быть транзакционным и иметь идемпотентный dispatcher skeleton без выдуманных domain events.
5. Добавь lint/typecheck/unit/integration/build scripts, `.env.example` и multi-stage Dockerfile.

## Приёмка и проверка

Чистая БД мигрирует, health отражает PostgreSQL/Redis, приложение переживает SIGTERM, secrets не логируются. Запусти все backend checks и зафиксируй команды.
