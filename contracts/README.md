# Контракты PickleHub

[`rest/main.tsp`](rest/main.tsp) и импортируемые им feature-файлы — редактируемый источник REST-контракта, из
которого генерируется корневой
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
  payload внутренних identity/venue/match events. Статические data-policy тесты дополнительно удерживают
  обязательные migration constraints, GiST-стратегию, provenance, постоянные merge aliases, вместимость/FIFO и
  единственный эффективный результат; они не заменяют применение SQL к PostgreSQL и конкурентные integration tests.
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
- `contracts:mock:check` запускает mock на свободном localhost port, запрашивает representative endpoints health,
  identity, venues и matches, проверяет status, JSON shape и `no-store`. AsyncAPI examples проверяются
  parser/linter в `contracts:lint`.

Prism сопоставляет OpenAPI Path Item без относительного `servers.url`, поэтому локальные mock URL —
`/health/live`, `/auth/context`, `/venues` и другие paths без `/v1`. Реальные API URL включают версию `/v1`; клиенты получают
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
имеет mock URL или silent fallback. Внутренние identity, venue и match events проверяются по AsyncAPI schema и не
выставляются как WebSocket subscription; contract mock не имитирует их фактическую доставку через outbox.

## Площадки

[`rest/venues.tsp`](rest/venues.tsp) разделяет публичные запросы карты, радиуса и текста. Radius ограничен 50 км,
bbox — 100×100 км, координаты принимаются как WGS84 longitude/latitude с точностью не более шести десятичных
знаков. Курсоры живут 15 минут и связаны с режимом, фильтрами и снимком каталога. Геокодерные подсказки transient;
его стабильная ошибка — `GEOCODER_TEMPORARILY_UNAVAILABLE` с `Retry-After`.

Создание match-only кандидата, исправления и структурированной жалобы требует bearer, browser CSRF и UUIDv4
`Idempotency-Key`; закрытый safe-response шифруется в БД на 24 часа. Административных маршрутов здесь нет — они
принадлежат функции `08`. Внутренние события публикуются как совместимые с общей версионностью
`venue.candidate.created.v1`, `venue.verified.v1` и `venue.merged.v1`; адреса, координаты и личности авторов в них
не входят.

## Матчи

[`rest/matches.tsp`](rest/matches.tsp) владеет публичным поиском, аутентифицированными рекомендациями, черновиком,
публикацией, capability read, составом/заявками/FIFO-очередью и предложением/подтверждением/спором результата. Все
мутации требуют bearer, browser CSRF, UUIDv4 `Idempotency-Key`; существующий агрегат также проверяет
`expectedVersion`. Capability `UNLISTED` не участвует в `/matches` и `/matches/recommendations`, выдаётся raw только
организатору, а хранится как keyed hash.

Миграция сериализует меняющие состав операции блокировкой корня `matches`, а constraint triggers независимо от
application precheck защищают вместимость команды, одно активное участие/заявку/очередь, FIFO offer и согласованную
пару match/result. `game_scores` принимает завершённые партии от 11 очков с разницей минимум два, поэтому корректны
игры до 11, 15, 21 и deuce; deferred series guard проверяет `BEST_OF_1/3/5`. Уникальный immutable marker
`CONFIRMED_MATCH` — единственный storage-факт основной метрики. События `match.*.v1` не содержат token, состава,
счёта, текста, уровня или географии.
