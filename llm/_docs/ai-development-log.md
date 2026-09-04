# Журнал AI-разработки

Записывайте только фактически выполненные действия.

## 2026-09-03 — исходное состояние на основе промптов

- Задача: преобразовать TMA-прототип в спецификацию PickleHub на основе промптов.
- Решение: зафиксировать ориентир UX, удалить старый код приложений, создать общий контекст и вертикальные
  промпты фич.
- Контекст: продуктовые решения получены в интервью; структура основана на `ai-for-developers-project-386`.
- Изменения: создано 109 файлов в `llm/`, включая 16 feature-каталогов по шесть вертикальных этапов, общие документы, шаблоны и ADR; root переведён на npm workspaces/Turborepo; legacy Vite/TMA/TON/GitHub Pages файлы удалены.
- Проверки:
    - `npm install --ignore-scripts` — успешно, lockfile синхронизирован;
    - `npm run format:check` — успешно;
    - `npm run docs:check` — успешно, 111 Markdown-файлов, 0 ошибок;
    - специальная проверка внутренних ссылок Markdown — успешно, 111 файлов;
    - структурная проверка — успешно: 16 каталогов фич по 6 файлам промптов, всего 109 Markdown-файлов в `llm/`,
      устаревшие каталоги и каталоги приложений отсутствуют;
    - `git diff HEAD --check` — успешно;
    - `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — конфигурация Turbo валидна, рабочие
      пространства приложений ещё не созданы, поэтому выполнено 0 задач согласно исходному состоянию
      на основе промптов.
- Риски: старые незакоммиченные исходники удаляются без архива по явному решению владельца.

## 2026-09-03 — основа платформы, этап 01-requirements

- Активный промпт: `llm/01-platform-foundation/01-requirements.md`.
- Объём: уточнена архитектура до создания приложений и продуктового кода; определены контейнеры и процессы,
  слои и владение модулей, направления зависимостей, auth/session flow, REST/WebSocket, transactional outbox,
  обработка сбоев, среды, именование, миграции, generated code policy и definition of done.
- Решения: сохранён принятый модульный монолит из ADR 0002; API и worker определены как независимо запускаемые
  режимы одной кодовой базы; ADR 0003 закрепил npm workspaces, единый lockfile, framework-neutral общие пакеты,
  отдельные web/PWA и TMA и запрет создавать mobile до этапа 14.
- Безопасность: заданы классификация и локализация данных, server-side sessions, структурированные allowlist-логи,
  перенос correlation context, redaction с негативными тестами, liveness/readiness/startup, distributed rate
  limiting, append-only audit и production gates для retention и внешних провайдеров.
- Изменённые файлы: `llm/_docs/architecture.md`, `llm/_docs/security-privacy.md`,
  `llm/_docs/adr/0002-modular-monolith-and-contracts.md`,
  `llm/_docs/adr/0003-workspace-and-client-delivery.md`, `llm/_docs/ai-development-log.md`.
- Проверки:
    - `npx prettier --check llm/_docs/architecture.md llm/_docs/security-privacy.md llm/_docs/adr/0002-modular-monolith-and-contracts.md llm/_docs/adr/0003-workspace-and-client-delivery.md` — обнаружил необходимость форматирования `architecture.md`; файл исправлен через `npx prettier --write`;
    - `npm run format:check` — успешно, все файлы соответствуют Prettier;
    - `npm run docs:check` — успешно, 112 Markdown-файлов, 0 ошибок;
    - read-only Node-проверка относительных Markdown-ссылок — успешно, проверено 112 файлов, отсутствующих целей нет;
    - `git diff --check` — успешно.
- Не выполнялись: `lint`, `typecheck`, `test`, contract generation и `build`, поскольку текущий документационный
  этап запрещает создавать приложения и не изменяет исполняемый код или контракты; их выполнение осталось бы
  нулевым Turbo-запуском и не проверяло бы критерии этого этапа.
- Риски и gates: конкретные внешние провайдеры не выбраны; production блокируется до юридической/security-проверки
  data residency, retention и условий каждого провайдера. Точные session TTL и endpoint rate limits обязан
  утвердить владеющий feature prompt до реализации соответствующего контракта.
- Следующий промпт: `llm/01-platform-foundation/02-contract-data.md`; к нему не переходили.

## 2026-09-03 — основа платформы, этап 02-contract-data

- Активный промпт: `llm/01-platform-foundation/02-contract-data.md`.
- Контракты: созданы корневые OpenAPI 3.1 и AsyncAPI 3.1. OpenAPI содержит только два health Path Item под
  server base `/v1`, общий error envelope, cursor pagination, locale, UTC timestamp, idempotency и
  request/correlation headers. AsyncAPI содержит только authentication, protocol error и heartbeat messages с
  версионированным envelope; business events не добавлены.
- Данные: описаны UUIDv7/v4, `timestamptz(3)`, soft/hard deletion, append-only audit, ownership и ограничения
  PostgreSQL/PostGIS, Redis/BullMQ, cursor и idempotency records без создания Prisma schema раньше backend prompt.
- Tooling: добавлены Redocly и официальный AsyncAPI parser, generation через `openapi-typescript`/Modelina,
  conservative Git-base compatibility checker с self-test, strict typecheck generated files и Prism mock smoke.
  Generated OpenAPI/AsyncAPI TypeScript сохранён в Git; ручное редактирование запрещено.
- Совместимость Node.js 22: Prism CLI закреплён на `5.14.2`, а transitive `prism-core`, `prism-http` и
  `prism-http-server` закреплены root overrides на проверенных Node 22-совместимых версиях; ветка `5.16.0`
  отклонена из-за требования Node.js 24.
- Изменённые файлы: `openapi.yaml`, `asyncapi.yaml`, `redocly.yaml`, `package.json`, `package-lock.json`, `README.md`,
  `contracts/README.md`, пять scripts в `contracts/scripts/`, два файла в `contracts/generated/`,
  `llm/_docs/data-conventions.md`, `llm/_docs/domain-model.md`, `llm/_docs/ai-development-log.md`.
- Проверки:
    - `npm install --cache /tmp/picklehub-contracts-npm-cache --no-audit --no-fund` — успешно, root lockfile
      синхронизирован; финальное дерево не содержит `UNMET` и engine warnings;
    - `npm run contracts:check` — успешно: OpenAPI валиден без warnings, AsyncAPI parser/policy проверили две REST
      operations и пять protocol messages, compatibility self-test прошёл как initial publication, generated
      `openapi.ts`/`asyncapi.ts` воспроизводимы, strict TypeScript check успешен, Prism подтвердил оба health mock и
      отсутствие product paths;
    - `npm run format:check` — успешно;
    - `npm run docs:check` — успешно, 113 Markdown-файлов, 0 ошибок;
    - read-only Node-проверка относительных Markdown-ссылок — успешно, 114 файлов, отсутствующих целей нет;
    - `npm ls --depth=0` и проверка Prism dependency tree — успешно;
    - `git diff --check` — успешно.
- Исправленные отклонения при проверке: initial Prism `5.16.0` transitive dependencies требовали Node.js 24;
  sandbox не разрешал localhost listener без escalation; Prism не добавляет относительный `/v1` server base к
  Path Item и Node fetch отправляет `Accept-Language: *`. Версии и mock harness исправлены, ограничения Prism
  задокументированы; успешен повторный smoke test с `ru-RU`.
- Риски: npm сообщил, что TLS verification отключена внешней настройкой `NODE_TLS_REJECT_UNAUTHORIZED=0`; package
  integrity зафиксирована lockfile, но чистую установку необходимо повторить в CI с включённой TLS verification.
  Security audit зависимостей не выполнялся из-за `--no-audit` и должен быть частью verification prompt.
- Следующий промпт: `llm/01-platform-foundation/03-backend.md`; к нему не переходили.

## 2026-09-04 — основа платформы, REST-контракт переведён на TypeSpec

- Активный промпт: уточнение владельца к `llm/01-platform-foundation/02-contract-data.md`; к следующему промпту не
  переходили.
- Контракт: `contracts/rest/main.tsp` стал единственным редактируемым источником REST API. Он описывает базовый
  `/v1`, два health endpoint, общие UUID/UTC/locale/cursor/error модели, пагинацию, идемпотентность и служебные
  заголовки. `openapi.yaml` теперь детерминированно генерируется официальным OpenAPI 3.1 emitter TypeSpec;
  `asyncapi.yaml` остаётся отдельным источником WebSocket и событий.
- Tooling: закреплены `@typespec/compiler`, `@typespec/http` и `@typespec/openapi3` версии `1.15.0`; добавлены
  `tspconfig.yaml`, отдельная компиляция OpenAPI и единая генерация OpenAPI плюс TypeScript. Drift check компилирует
  TypeSpec во временный каталог и побайтово проверяет как `openapi.yaml`, так и оба TypeScript artifact. TypeSpec
  проверяется без записи файлов до Redocly, поэтому lint не скрывает устаревший generated output.
- Политики: generated `openapi.yaml` исключён из отдельного Prettier formatting, TypeSpec проверяется собственным
  formatter; compatibility checker учитывает запрет неизвестных полей через OpenAPI 3.1
  `unevaluatedProperties`; архитектура, ADR, инструкции репозитория и документация контрактов синхронизированы с
  новым направлением генерации.
- Изменённые файлы: `.prettierignore`, `AGENTS.md`, `README.md`, `package.json`, `package-lock.json`,
  `contracts/rest/main.tsp`, `contracts/rest/tspconfig.yaml`, `openapi.yaml`, `contracts/generated/openapi.ts`,
  scripts и `contracts/README.md`, `llm/00-project-overview.md`, активный prompt, архитектура, ADR 0002,
  data conventions и этот журнал.
- Проверки:
    - `npm run contracts:check` — успешно с разрешённым localhost listener: TypeSpec compile без diagnostics,
      Redocly без warnings, policy проверила 2 REST operations и 5 protocol messages, compatibility self-test
      прошёл как initial publication, OpenAPI и TypeScript воспроизводимы, strict typecheck успешен, Prism проверил
      оба health mock и отсутствие product paths;
    - `npm run format:check` — успешно, включая `tsp format --check`;
    - `npm run docs:check` — успешно, 113 Markdown-файлов, 0 ошибок;
    - `npm ls --depth=0` — успешно, TypeSpec packages установлены в согласованной версии `1.15.0`;
    - `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — успешно, до создания workspaces Turbo
      выполнил 0 задач; contract strict typecheck выполнен отдельно в `contracts:check`;
    - `git diff --check` — успешно.
- Ограничения проверки: первый sandbox-запуск Prism завершился `EPERM` из-за запрета localhost listener; повторный
  полный contract check с разрешением на listener успешен. Внешняя настройка по-прежнему отключает TLS
  verification и должна отсутствовать при чистой установке в CI; audit зависимостей в этом уточнении не запускался.
- Следующий промпт: `llm/01-platform-foundation/03-backend.md`; к нему не переходили.

## 2026-09-04 — основа платформы, этап 03-backend

- Активный промпт: `llm/01-platform-foundation/03-backend.md`.
- Каркас: создан workspace `@picklehub/backend` на NestJS со строгим TypeScript и двумя entry point: HTTP API и
  отдельный worker. Границы `common`, `health`, `outbox`, `integrations` и `audit` не содержат продуктовых
  сценариев; контроллер health обращается к application service, а не к Prisma.
- Данные и фоновые задачи: добавлены Prisma schema и начальная PostgreSQL/PostGIS migration с техническими
  `outbox_events` и append-only `audit_entries`. Outbox writer принимает `Prisma.TransactionClient`; конкурентный
  dispatcher использует `FOR UPDATE SKIP LOCKED`, lease, BullMQ `jobId = eventId`, bounded retry с jitter и
  quarantine. Доменные события и provider adapters не добавлялись. Prisma runtime использует PostgreSQL driver
  adapter без платформенного native query engine.
- HTTP и эксплуатация: реализованы `/v1/health/live` и `/v1/health/ready` по OpenAPI, короткие timeout для
  PostgreSQL/PostGIS и Redis, request/correlation UUIDv4, `Content-Language`, общий validation/error filter,
  структурированные Pino-логи с рекурсивным redaction, безопасные startup errors и shutdown hooks для
  `SIGTERM`/`SIGINT`.
- Поставка: добавлены типизированный `.env.example`, Docker Compose для локальных PostGIS/Redis, многоэтапный
  Node.js 22 Dockerfile, backend README, root integration script и Turbo task. Единственный root lockfile
  синхронизирован с закреплёнными версиями зависимостей.
- Изменённые файлы: новый `backend/`, `.dockerignore`, `docker-compose.yml`, `package.json`, `package-lock.json`,
  `turbo.json`, `README.md` и этот журнал.

### Проверки этапа 03-backend

- `npm install --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000 --loglevel=info` —
  успешно через настроенный npm registry, установлено 628 пакетов; отдельная установка PostgreSQL adapter добавила
  16 пакетов; финальный `npm install --offline --ignore-scripts --no-audit --no-fund` удалил оставшуюся extraneous
  dependency.

- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npx prisma generate --schema
backend/prisma/schema.prisma` — Prisma Client 6.16.2 воспроизводимо сгенерирован для driver adapter.

- `DATABASE_URL=... PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npm run
prisma:validate --workspace @picklehub/backend` — schema валидна.

- `docker compose down -v`, затем `docker compose up -d --wait postgres redis` — создана новая чистая локальная
  среда, оба healthcheck успешны; удалены только ранее созданные synthetic volumes этого Compose-проекта.

- `docker exec -i picklehub-postgres-1 psql -v ON_ERROR_STOP=1 -U picklehub -d picklehub <
backend/prisma/migrations/20260904090000_platform_foundation/migration.sql` — исправленная миграция успешно
  применена с нуля, созданы extension, таблицы, индексы, функция и два audit trigger.

- `DATABASE_URL=... REDIS_URL=... REDIS_NAMESPACE=test npm run test:integration --workspace
@picklehub/backend` — успешно, 5 тестов: wire health/error, PostGIS/schema, транзакционный rollback outbox,
  идемпотентная публикация dispatcher и запрет изменения audit.

- `npm run format:check`, `npm run docs:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` —
  успешно; unit tests: 6 suites, 11 tests; Turbo выполнил по одной backend-задаче lint/typecheck/test/build.

- `npm run contracts:check` — успешно: TypeSpec/OpenAPI lint без warnings, policy 2 REST/5 protocol messages,
  compatibility, generated drift/typecheck и Prism mock.

- Локальный smoke собранного `backend/dist/main.js` — readiness вернул 200, лог сохранил безопасный path без query,
  `SIGTERM` записал начало shutdown, процесс завершился с кодом 0; legacy wildcard warnings отсутствуют.

- `docker compose stop postgres redis` — локальные test-контейнеры остановлены после проверок, volumes сохранены для
  следующего запуска.

- `npm ls --depth=0` и `git diff --check` — успешно, unmet/extraneous dependencies и whitespace errors отсутствуют.
- Исправленные отклонения: unit test выявил ESM-only `uuid@13`, dependency заменена на покрытый тестом UUIDv7 на
  `node:crypto`; integration test выявил лишнее экранирование PostgreSQL regex в check constraint, после чего
  чистые volumes были пересозданы и весь набор прошёл; NestJS 11 wildcard middleware переведён на именованный
  синтаксис `{*path}`.
- Ограничения проверки: `prisma migrate deploy` и обычная загрузка native Prisma schema engine не выполнены —
  `binaries.prisma.sh` возвращал `403`; migration SQL вместо этого применён к чистой БД через `psql` и проверен
  integration tests. `docker build --file backend/Dockerfile --tag picklehub-backend:foundation .` остановился до
  build steps: Docker Hub вернул некорректный TLS certificate при получении Node.js 22 base image; локально был
  доступен только неподходящий Node.js 20 image, поэтому его не подставляли. Обе команды нужно повторить в CI с
  нормальной TLS/network policy. Внешняя настройка `NODE_TLS_REJECT_UNAUTHORIZED=0` остаётся риском окружения;
  security audit зависимостей не выполнялся из-за `--no-audit` и остаётся этапу verification.
- Следующий промпт: `llm/01-platform-foundation/04-tma-web.md`; к нему не переходили.
