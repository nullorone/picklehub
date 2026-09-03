# Этап 2. Базовые contracts и data conventions

## Промпт агенту

Ты — API/data architect. Прочитай принятые ADR и создай минимальные root `openapi.yaml` и `asyncapi.yaml` до scaffold.

## Выполни

1. Определи `/v1`, common error envelope, pagination/cursor, RFC 3339 UTC, locale, idempotency и request ID headers.
2. В OpenAPI добавь только `GET /health/live` и `/health/ready`; product endpoints появятся в feature-prompts.
3. В AsyncAPI определи versioned event envelope и базовую WebSocket authentication/error модель без бизнес-событий.
4. Настрой lint, breaking-change check, mock/codegen conventions и документацию.
5. Опиши PostgreSQL UUID/timestamp/soft-delete/audit conventions и PostGIS/Redis ownership.

## Приёмка и проверка

Contracts валидны, operation/message IDs уникальны, generated types воспроизводимы, Prisma details не протекают наружу. Запусти contract lint/mock smoke и обнови AI log.
