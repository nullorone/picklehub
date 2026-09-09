# Контракты PickleHub

[`rest/main.tsp`](rest/main.tsp) — редактируемый источник REST-контракта, из которого генерируется корневой
[`openapi.yaml`](../openapi.yaml). [`asyncapi.yaml`](../asyncapi.yaml) остаётся источником истины для WebSocket и
событий. Product endpoints и business events добавляются только prompt’ом owning feature.

## Команды

```bash
npm run contracts:lint
npm run contracts:compile
npm run contracts:breaking
npm run contracts:generate
npm run contracts:generated:check
npm run contracts:typecheck
npm run contracts:mock:check
npm run contracts:check
```

- `contracts:compile` генерирует только `openapi.yaml` из TypeSpec; `contracts:generate` также обновляет TypeScript.
- `contracts:lint` проверяет TypeSpec без записи artifacts, валидирует OpenAPI и AsyncAPI официальными
  parser/linter и применяет PickleHub policy: `/v1`, разрешённые owning-feature paths, уникальные
  operation/message IDs, версионированные envelopes, UTC timestamps, `no-store`, browser CSRF/cookie и безопасный
  payload identity events. Статические data-policy тесты дополнительно удерживают обязательные migration
  constraints; они не заменяют применение SQL к PostgreSQL.
- `contracts:breaking` сравнивает working tree с `CONTRACT_BASE_REF` либо `HEAD`. При первом добавлении контрактов
  baseline отсутствует и проверяется встроенный compatibility self-test. В pull request CI передаёт merge-base
  целевой ветки через `CONTRACT_BASE_REF`.
- `contracts:generate` детерминированно пересоздаёт `openapi.yaml` и TypeScript в `contracts/generated/`.
  Generated files хранятся в Git и вручную не редактируются.
- `contracts:generated:check` компилирует TypeSpec и генерирует типы во временный каталог, затем сравнивает bytes с
  committed output.
- `contracts:typecheck` проверяет сгенерированные TypeScript-типы в strict mode.
- `contracts:mock` запускает локальный Prism на `127.0.0.1:4010`; он предназначен только для разработки и не
  является backend или production fallback.
- `contracts:mock:check` запускает mock на свободном localhost port, запрашивает health и representative identity
  endpoints, проверяет status, JSON shape, `no-store` и отсутствие ещё не принадлежащих контракту paths. AsyncAPI
  examples проверяются parser/linter в `contracts:lint`.

Prism сопоставляет OpenAPI Path Item без относительного `servers.url`, поэтому локальные mock URL —
`/health/live`, `/auth/context` и другие paths без `/v1`. Реальные API URL включают версию `/v1`; клиенты получают
её из server/base URL configuration. Mock harness не переписывает source contract ради ограничения Prism.

AsyncAPI generator передаёт Modelina каждую message payload schema отдельно и помещает вспомогательные типы в
namespace сообщения: так одинаковые внутренние имена разных envelopes не сталкиваются. Prism transitive packages
закреплены через root `overrides` на последних проверенных версиях с поддержкой Node.js 22; снятие overrides требует
проверки `engines` всего Prism tree.

## Правила изменения

1. Сначала обновить requirement/ADR, затем TypeSpec/AsyncAPI source contract, generated output и только потом
   реализацию.
2. Запустить lint, compatibility check, code generation drift check и mock smoke test.
3. Для намеренно несовместимого изменения выпустить новую major URL/message schema version и сохранить старую до
   объявленного срока миграции; отключать checker или обновлять baseline ради зелёного CI нельзя.
4. Не редактировать `contracts/generated/` и не копировать transport DTO вручную. Prisma schema и database column
   names не экспортируются через контракт.
5. Examples используют только вымышленные UUID, время и тексты без реальных персональных данных или credentials.

## Макеты

Prism отвечает строго по OpenAPI examples/schemas. Mock не подтверждает бизнес-правило, авторизацию, сохранение,
идемпотентность или доступность провайдера. TMA/web development явно показывают mock mode; production build не
имеет mock URL или silent fallback. Внутренние identity events проверяются по AsyncAPI schema и не выставляются
как WebSocket subscription; contract mock не имитирует их фактическую доставку через outbox.
