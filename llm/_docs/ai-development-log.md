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

## 2026-09-04 — основа платформы, этап 04-tma-web

- Активный промпт: `llm/01-platform-foundation/04-tma-web.md`.
- Приложения: созданы независимые workspaces `@picklehub/web` и `@picklehub/tg` на React/Vite с Router,
  TanStack Query, React Hook Form с Zod resolver, i18next и русским языком по умолчанию. Обе оболочки содержат
  только нейтральный foundation-экран, error boundary, offline announcement, адаптивную тему, видимый keyboard
  focus, reduced-motion policy и строго валидируемый `/runtime-config.json`.
- Web/PWA: настроены manifest, SVG any/maskable icons, registration и Workbox service worker. Precache содержит
  только версионированную статическую оболочку; runtime config, API и мутации не кешируются. Build-check проверяет
  manifest, service worker, runtime config и запрет precache конфигурации.
- TMA: Telegram SDK изолирован в platform adapter; он монтирует theme params, Mini App и viewport, связывает CSS
  variables, расширяет viewport и сообщает `ready`. `mockTelegramEnv` загружается только через compile-time
  `import.meta.env.DEV`; production build-check отклоняет marker и имя mock-функции в bundle.
- Общие пакеты: созданы `api-client`, `domain`, `validation`, `i18n` и `analytics` без React UI, DOM, Telegram или
  backend imports. API client использует OpenAPI-типы; contract generation теперь воспроизводимо обновляет и
  проверяет committed копию типов внутри workspace клиента. Внешний analytics provider не подключался.
- Поставка: добавлены отдельные multi-stage Dockerfile и nginx SPA config для web и TMA, README приложений и
  пакетов; единый root lockfile и Turbo-граф синхронизированы. Устаревший UI и TON Connect не добавлялись.
- Изменённые файлы: новые `frontend/web`, `frontend/tg`, `frontend/packages/*`, общие frontend ESLint/TypeScript
  config; обновлены root `package.json`, `package-lock.json`, `turbo.json`, `README.md` и contract generation/drift
  scripts.

### Проверки этапа 04-tma-web

- `npm install --ignore-scripts --no-audit --no-fund --cache /tmp/picklehub-frontend-npm-cache
--fetch-retries=2 --fetch-timeout=120000 --loglevel=info` — успешно, добавлено 312 пакетов, единый lockfile
  синхронизирован.
- Повторная offline-проверка обнаружила engine warning у `jsdom@30.0.1` на текущем Node 22.19.0; версия
  закреплена на совместимой `27.4.0`, после чего `npm install` добавил 26 и удалил 1 transitive package без engine
  warning.
- `npm run contracts:generate` — успешно; OpenAPI/TypeScript artifacts и копия OpenAPI types в `api-client`
  сгенерированы.
- `npm run format:check` и `npm run docs:check` — успешно; TypeSpec format check успешен, Markdown: 113 файлов,
  0 ошибок.
- `npm run lint` и `npm run typecheck` — успешно для восьми workspaces.
- `npm test` — успешно: backend 6 suites/11 tests, frontend/shared 7 files/9 tests; отдельно проверены generated
  client route, strict runtime config, русский fallback, analytics/domain taxonomy, обе оболочки и offline status.
- `npm run build` — успешно для восьми workspaces; web build создал валидные manifest/service worker и подтвердил
  отсутствие runtime config в precache, TMA build подтвердил отсутствие development mock в production bundle.
- `npm run contracts:check` — успешно после разрешения localhost listener: TypeSpec/OpenAPI lint, policy 2 REST/5
  protocol messages, compatibility, generated drift/typecheck и Prism mock. Первый sandbox-запуск ожидаемо получил
  `listen EPERM` на `127.0.0.1`.
- Production preview smoke: `npm run preview --workspace @picklehub/web -- --host 127.0.0.1 --port 4173` и
  аналогичная команда для `@picklehub/tg` на порту 4174 запущены; `curl --silent --show-error --fail` подтвердил
  HTML и runtime config обеих оболочек, а также web manifest. Процессы после проверки остановлены.
- `npm ls --depth=0`, проверка отсутствия backend/TON imports, `git diff --check` — успешно; unmet/extraneous
  dependencies и whitespace errors отсутствуют.
- `docker build --file frontend/web/Dockerfile --tag picklehub-web:foundation .` — Dockerfile прочитан до получения
  base image, затем сборка заблокирована внешней TLS-политикой: сертификат ответа для `auth.docker.io` выпущен для
  других доменов. TMA image не запускался повторно, поскольку использует те же недоступные base images. Обе сборки
  необходимо повторить в CI с корректным Docker registry/TLS; верификация Docker-образов не заявляется успешной.
- Ограничения окружения: npm продолжает предупреждать о внешнем `NODE_TLS_REJECT_UNAUTHORIZED=0`; эта настройка не
  добавлена в репозиторий и должна отсутствовать в CI/production.
- Следующий промпт: `llm/01-platform-foundation/05-verification.md`; к нему не переходили.

## 2026-09-04 — визуальная система Web/PWA и TMA

- Активный промпт остаётся `llm/01-platform-foundation/04-tma-web.md`; продуктовые функции следующих этапов не
  добавлялись. Пять PNG из `design/` использованы как визуальный референс, но не поставляются как runtime-ассеты.
- Обе нейтральные оболочки получили dark-first визуальную систему: почти чёрный фон, тёмно-синие поверхности,
  сине-фиолетовые акценты, крупные радиусы, контрастную типографику и CSS-графику корта. Web адаптируется к
  системной светлой теме; TMA использует Telegram theme variables и безопасные fallback-значения.
- Offline banner, 404 и error boundary приведены к той же системе. Сохранены keyboard focus, reduced-motion,
  safe-area, русская локализация и существующие аналитические события. Публичные маршруты, runtime config,
  контракты и API не менялись; навигация и фиктивные клубы, турниры или статистика не добавлялись.
- Изменённые файлы: разметка, стили, тесты и HTML оболочек в `frontend/web` и `frontend/tg`, Telegram development
  theme mock и этот журнал.

### Проверки визуальной системы

- `npx prettier --write frontend/web/src/app.tsx frontend/web/src/app.test.tsx
frontend/web/src/error-boundary.tsx frontend/web/src/styles.css frontend/web/index.html frontend/tg/src/app.tsx
frontend/tg/src/app.test.tsx frontend/tg/src/error-boundary.tsx frontend/tg/src/styles.css
frontend/tg/src/telegram.ts frontend/tg/index.html` — успешно; отформатированы изменённые файлы.
- `npm test --workspace @picklehub/web --workspace @picklehub/tg` — успешно: 2 test files, 5 tests.
- `npm run lint --workspace @picklehub/web --workspace @picklehub/tg` — успешно, warnings отсутствуют.
- `npm run typecheck --workspace @picklehub/web --workspace @picklehub/tg` — успешно.
- `npm run build --workspace @picklehub/web --workspace @picklehub/tg` — успешно; Web PWA manifest/service worker
  валидны, production TMA bundle не содержит development mock.
- Локальный visual smoke: Web preview проверен при 1200 px и 500 px в тёмной и светлой теме; TMA development
  shell проверен при 500 px с Telegram mock. Горизонтального переполнения нет, accessibility tree содержит
  `banner`, `main`, именованный `region` и заголовок первого уровня. Первые sandbox-запуски получили ожидаемый
  `listen EPERM`; после разрешения localhost оба сервера запустились и по завершении были остановлены.
- `npm run format:check` и `npm run docs:check` — успешно после форматирования новой записи журнала; TypeSpec и
  113 Markdown-файлов прошли проверку.
- `npm run lint` и `npm run typecheck` — успешно для восьми workspaces.
- `npm test` — успешно: 13 Turbo tasks, включая 6 backend suites/11 tests и 5 обновлённых Web/TMA tests.
- `npm run build` — успешно для восьми workspaces; проверки PWA и отсутствия Telegram development mock прошли.
- `npm run contracts:check` — успешно: TypeSpec/OpenAPI lint, policy 2 REST/5 protocol messages, compatibility,
  generated drift/typecheck и Prism mock. Первый sandbox-запуск дошёл до Prism и получил ожидаемый `listen EPERM`;
  повтор с разрешением localhost прошёл полностью. Внешняя настройка `NODE_TLS_REJECT_UNAUTHORIZED=0` по-прежнему
  присутствует только в окружении и вызывает warning.
- `npm ls --depth=0` и `git diff --check` — успешно; unmet/extraneous dependencies и whitespace errors отсутствуют.

## 2026-09-04 — основа платформы, этап 05-verification

- Активный промпт: `llm/01-platform-foundation/05-verification.md`.
- Аудит workspace: добавлена исполняемая проверка единственного root lockfile, восьми ожидаемых workspace,
  обязательных root/Turbo/workspace tasks, направления внутренних зависимостей и запрета backend, NestJS, Prisma,
  React и Telegram imports/dependencies в framework-neutral пакетах.
- Compose: сохранён default-запуск только PostgreSQL/PostGIS и Redis; профиль `foundation` добавляет migration job,
  API, worker, web/PWA и TMA с dependency conditions и healthcheck. Smoke создаёт отдельный Compose project,
  проверяет миграции, health endpoints, обе оболочки и lifecycle event при SIGTERM, затем удаляет только свои
  containers, network и volumes.
- CI: создан GitHub Actions workflow с независимыми quality, backend integration и Compose jobs на Node.js
  `22.19.0`. Quality выполняет чистую установку, runtime audit и все root gates; integration использует чистые
  PostGIS/Redis и `prisma migrate deploy`; Compose собирает и проверяет текущие runtime images.
- Исправленный дефект: backend migration target первоначально наследовал установку с `--ignore-scripts`, из-за чего
  отсутствовал обязательный Prisma schema-engine. Backend build dependencies теперь устанавливают lifecycle
  scripts штатно; runtime production dependencies по-прежнему устанавливаются без scripts и не содержат Prisma
  CLI. CI integration также устанавливает engine до `prisma migrate deploy`.
- Документация: архитектура дополнена фактической схемой foundation-поставки, создан эксплуатационный runbook с
  матрицей прослеживаемости, root и backend README содержат единые команды проверки. Внешние провайдеры не
  добавлялись и не подменялись успешными заглушками.
- Изменённые файлы: `.github/workflows/foundation.yml`, `backend/Dockerfile`, `docker-compose.yml`, `package.json`,
  `scripts/check-workspaces.mjs`, `scripts/compose-smoke.sh`, `README.md`, `backend/README.md`,
  `llm/_docs/architecture.md`, `llm/_docs/operations.md` и этот журнал.

### Проверки этапа 05-verification

- `npm ci --ignore-scripts --no-audit --no-fund` — успешно из единственного root lockfile после разрешения доступа
  к настроенному registry: добавлено 1588 packages; engine warnings отсутствуют. npm сообщил об устаревших
  транзитивных packages и внешнем `NODE_TLS_REJECT_UNAUTHORIZED=0`; эта переменная не задана репозиторием.
- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npm run prisma:generate
--workspace @picklehub/backend` — Prisma Client 6.16.2 успешно воспроизводимо создан для driver adapter.
- `npm run verify` — успешно после разрешения loopback listener для Prism: workspace check подтвердил 8 workspace
  и один lockfile; TypeSpec, Redocly, AsyncAPI policy, compatibility, generated drift/typecheck и OpenAPI mock
  прошли; format и 114 Markdown-файлов прошли; lint и typecheck выполнили по 8 задач, tests — 13 задач, build — 8
  задач. Backend unit: 6 suites/11 tests; frontend/shared: 7 files/9 tests. Web build-check подтвердил offline
  shell policy, TMA build-check — отсутствие development Telegram mock в production bundle.
- `docker compose --profile foundation config --quiet` — успешно, итоговая Compose-модель валидна.
- В отдельном проекте `picklehub-verification` команды `docker compose ... up --detach --wait postgres redis`
  создали чистые healthy PostGIS/Redis. Migration SQL применён с `psql -v ON_ERROR_STOP=1`; затем
  `npm run test:integration --workspace @picklehub/backend` — успешно, 1 suite/5 tests: wire health/readiness,
  PostGIS/schema, rollback outbox, идемпотентная публикация и append-only audit. После проверки `docker compose
... down --volumes --remove-orphans` удалил только временные containers, network и оба volumes.
- `npm run compose:smoke` — не завершён из-за внешней TLS-политики до Docker build steps: `auth.docker.io` вернул
  сертификат для других доменов при получении закреплённых Node.js/nginx images. Скрипт выполнил cleanup; images,
  container readiness и Compose graceful shutdown локально не заявляются успешными. Проверка обязательна в CI.
- `npm run prisma:migrate --workspace @picklehub/backend` на хосте — не завершён: официальный Prisma binary
  endpoint сначала был недоступен через DNS proxy, затем вернул `403` для checksum schema-engine. SQL той же
  миграции применён и проверен на чистой БД, но это не объявляется успешным запуском Prisma CLI; штатный CLI gate
  остаётся в CI и migration image.
- `npm audit --omit=dev --audit-level=high` — не выполнен локальным registry: настроенный Artifactory ответил 404
  с сообщением `Repo npm does not support npm audit`. Audit не маскируется и остаётся обязательным падающим CI gate через
  registry с audit API.
- Первый sandbox-запуск contract mock получил ожидаемый `listen EPERM`; полный повтор вне sandbox успешен. Первый
  Docker-запуск не имел доступа к daemon socket; повтор после разрешения дошёл до описанного TLS-блокера.
- `git diff --check`, YAML parse, `npm ls --all` и Turbo dry graph — успешно; пользовательские PNG в `design/` не
  изменялись.
- Следующий промпт: `llm/02-identity-onboarding/01-requirements.md`; к нему не переходили.

## 2026-09-08 — идентификация и первичная настройка, этап 01-requirements

- Активный промпт: `llm/02-identity-onboarding/01-requirements.md`. Прочитаны общий контекст, обзор функции,
  актуальные foundation-результаты, архитектура, data conventions и текущие контракты.
- В `product-requirements.md` добавлены 11 пользовательских историй, состояния и переходы session/refresh,
  magic link, onboarding и удаления, правила нормализации email, ограничения identity, свежие доказательства,
  поля и публичность, продолжение черновика, история согласий, стабильные ошибки и 17 сценариев Дано/Когда/Тогда.
- Решения: access 5 минут в памяти; refresh cookie с ротацией, inactivity 7 суток и absolute 30 суток;
  magic link 10 минут; Telegram proof менее 5 минут с future skew до 30 секунд. Replay refresh отзывает семейство;
  связывание требует двух доказательств и не сливает существующие аккаунты. Гонки защищаются транзакциями и
  ограничениями БД; единственный способ входа нельзя отвязать. Пароли и проверка возраста не вводились.
- Security/privacy дополнен политикой origin/CSRF, cookie, доставки magic-секрета во fragment доверенной страницы,
  rate limits без раскрытия регистрации email, реестром данных и предлагаемыми сроками удаления. Сроки и
  основания явно требуют юридического утверждения до production. Архитектура синхронизирована с уже заданным
  обзором identity правилом access в памяти / refresh в HttpOnly cookie и исключением доставки magic-ссылки.
- Analytics plan задаёт условия событий, свойства, дедупликацию, владельцев и применение на dashboard. Отказ от
  аналитики не мешает активации; события до согласия не воспроизводятся задним числом, неполная воронка описана.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/security-privacy.md`,
  `llm/_docs/analytics-plan.md`, `llm/_docs/architecture.md` и этот журнал. Код приложений, схемы, generated clients
  и пользовательские PNG в `design/` не изменялись.

### Проверки этапа identity 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/security-privacy.md
llm/_docs/analytics-plan.md llm/_docs/architecture.md` — успешно.
- Первый `npm run verify` в sandbox прошёл workspace, TypeSpec/OpenAPI lint, compatibility, generated drift и
  contract typecheck, затем остановился на `listen EPERM 127.0.0.1` в Prism mock.
- Повторный `npm run verify` с разрешением localhost — успешно: 8 workspace и один lockfile; policy 2 REST/5
  protocol messages; compatibility, generated drift/typecheck и Prism; форматирование и 114 Markdown-файлов без
  ошибок; lint и typecheck по 8 успешных задач, test 13 задач, build 8 задач. Backend заново выполнил 6 suites/11
  tests; неизменённые frontend/shared задачи использовали Turbo cache. Это regression foundation, а не тесты
  ещё не реализованной identity.
- Read-only Python-проверка относительных Markdown-ссылок в пяти затронутых документах — успешно: 15 ссылок,
  отсутствующих целей нет. Ручная сверка требований подтвердила покрытие всех пунктов активного промпта и
  отсутствие противоречия между хранением токенов в обзоре, требованиях и архитектуре.
- Финальные `npx prettier --write llm/_docs/product-requirements.md llm/_docs/ai-development-log.md`,
  `npm run format:check`, `npm run docs:check` и `git diff --check` — успешно после уточнения границы срока proof
  и записи результатов в журнал.
- Новые integration/e2e тесты, Docker smoke, Prisma migrate и dependency audit не запускались: этот этап меняет
  только требования. Ранее записанные foundation-блокеры Docker TLS, Prisma binary endpoint и audit registry
  не закрыты этим результатом; предупреждение внешнего `NODE_TLS_REJECT_UNAUTHORIZED=0` сохранилось в verify.
- Критерии документационного этапа выполнены. Production остаётся закрытым до review провайдеров, правовых
  документов, retention и источника справочника географии; разрешённый DUPR URL уточняется контрактным этапом.
- Следующий промпт: `llm/02-identity-onboarding/02-contract-data.md`; к нему не переходили.

## 2026-09-08 — идентификация и первичная настройка, этап 02-contract-data

- Активный промпт: `llm/02-identity-onboarding/02-contract-data.md`. Реализация ограничена REST/AsyncAPI,
  Prisma/SQL моделью и документацией; backend use cases и клиентские экраны этапов 03–04 не добавлялись.
- TypeSpec добавляет 26 identity operations поверх двух foundation health operations: browser context, Telegram
  exchange, request/consume magic link, refresh/logout/logout-all, current user, identity proofs и link/unlink,
  onboarding draft/complete, consent history, deletion, immutable documents и локальные onboarding options.
  Определены стабильные ошибки, rate limits, `Origin` + CSRF, bearer/cookie security, UUIDv4 idempotency и
  `Cache-Control: no-store` на всех identity success/error responses.
- Browser session contract выдаёт access только в JSON и refresh только в host-only HttpOnly cookie. Исправлена
  несовместимая с HTTP/Prism попытка описать несколько `Set-Cookie` как array: OpenAPI теперь моделирует один
  header value, а требование отдельных header lines остаётся в описании. Будущий native transport через OS secure
  storage и authorization headers определён ADR 0004, но отдельная mobile API поверхность отложена до этапа 14.
- AsyncAPI получил внутренний, не WebSocket, канал `identity.events.v1` и шесть минимальных событий linking,
  unlinking, session revocation, onboarding completion, consent change и deletion request. Generated
  `IdentityDomainEvent` отделён от `WebSocketMessage`; policy запрещает email, provider subject, init data, URL и
  credentials в event payload.
- Prisma и migration добавляют `User`, `Identity`, `Session`, access/refresh hashes, `MagicLink`, Telegram replay
  marker, operation-bound identity attempt, immutable consent documents/history, `PlayerProfileDraft`, locality
  catalogue и зашифрованные 24-hour identity idempotency records. Unique/partial indexes защищают provider subject,
  provider-per-user, current refresh и pending magic scope; deferred triggers не позволяют активному пользователю
  остаться без способа входа. CHECK/transition triggers ограничивают TTL и запрещают resurrection/replay обычным
  update.
- ADR 0004 фиксирует 5-minute access, refresh inactivity 7 days / absolute 30 days, 10-minute magic links,
  same-origin browser transport, mobile boundary и одноразовую отправку raw magic secret только из памяти. Magic
  secret не сохраняется в outbox/BullMQ/idempotency; неопределённая доставка остаётся нейтральным 202 и требует
  нового запроса. DUPR links остаются выключенными до утверждения host/path allowlist.
- Policy tests проверяют полный path inventory, no-store, CSRF, bearer/cookie transport, запрет credential
  idempotency, sealed safe events и статические обязательные свойства migration. OpenAPI mock теперь проверяет
  browser context, нейтральный magic request, current user и отсутствие ещё не принадлежащего контракту `/matches`.
- Изменённые editable files: `contracts/rest/identity.tsp`, `contracts/rest/main.tsp`, `asyncapi.yaml`, contract
  generators/policy/mock scripts и tests, `backend/prisma/schema.prisma`, migration
  `20260908090000_identity_onboarding`, `contracts/README.md`, ADR 0004, architecture/domain model, root package
  metadata и этот журнал. Перегенерированы root OpenAPI, contract TypeScript и API-client types. Пользовательские
  PNG в `design/` не изменялись.

### Проверки этапа identity 02-contract-data

- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npm run prisma:generate
--workspace @picklehub/backend` — успешно; Prisma Client 6.16.2 обновлён по схеме без сетевой загрузки engines.
- `npm run contracts:check` — успешно: TypeSpec compile, Redocly, policy 28 REST/11 messages и 12 policy tests,
  compatibility с HEAD, generated drift, strict TypeScript и Prism identity mock. Первый расширенный mock обнаружил
  crash Prism на array `Set-Cookie`; после исправления scalar wire header проверка health/identity успешна.
- Первый `npm run verify` в sandbox дошёл до Prism и получил ожидаемый `listen EPERM 127.0.0.1`. Повтор с
  разрешённым loopback прошёл contracts, format/docs, lint и typecheck, затем выявил отсутствующий root-resolvable
  optional peer `jsdom` у hoisted Vitest. `npm install --save-dev --save-exact jsdom@27.4.0 --ignore-scripts
--no-audit --no-fund --fetch-retries=2 --fetch-timeout=120000` закрепил уже используемую версию в root и обновил
  lockfile; это устраняет зависимость тестов от случайной раскладки `node_modules`.
- Финальный `npm run verify` с разрешённым loopback — успешно: workspace/lockfile, contracts, format и 115 Markdown
  files, lint/typecheck для восьми workspaces, 13 test tasks и восемь build tasks. Backend: 6 suites/11 tests;
  shared/Web/TMA: 7 files/9 tests; Web PWA и production TMA build checks успешны.
- `npm run format:check`, `npm run docs:check`, `npm run contracts:lint`, `npm run contracts:generated:check` и
  `git diff --check` проходили отдельно. `npm ls --depth=0` не показал unmet/extraneous dependencies.
- SQL migration не применена к чистому PostgreSQL: Docker daemon не запущен (`Cannot connect to the Docker daemon`),
  а локального `psql` нет. Статические migration policy tests проходят, но не заменяют integration test реальных
  constraints/triggers; применение обеих migrations и конкурентные проверки обязательны в backend/verification.
- Небезопасная внешняя переменная `NODE_TLS_REJECT_UNAUTHORIZED=0` по-прежнему присутствует только в окружении и
  вызывает warning; она не добавлена в репозиторий. Provider/legal/retention/DUPR approvals также не заявляются.
- Критерии контрактного этапа выполнены с явно записанным ограничением SQL runtime-проверки. Следующий промпт:
  `llm/02-identity-onboarding/03-backend.md`; к нему не переходили.

## 2026-09-09 — идентификация и первичная настройка, этап 03-backend

- Активный промпт: `llm/02-identity-onboarding/03-backend.md`. Реализован NestJS-модуль `identity`, покрывающий
  все 26 identity/onboarding REST operations опубликованного TypeSpec-контракта; клиентские экраны этапа 04 не
  добавлялись.
- Telegram init data проверяется по подписи WebAppData, уникальности полей, `auth_date`, future skew и
  пятиминутному TTL. Только проверенный Telegram user id превращается в HMAC lookup key и AES-256-GCM ciphertext;
  keyed proof fingerprint атомарно записывается в PostgreSQL и не допускает replay.
- Magic email secret содержит 256 случайных бит, хранится только как HMAC и передаётся HTTPS `EmailProvider`
  один раз в памяти во fragment landing URL. Adapter имеет пятисекундный budget и флаги запрета click tracking и
  URL rewriting; production требует явно настроенный одобренный endpoint. Запрос остаётся нейтральным при
  неизвестном адресе, throttling и любом результате доставки.
- Browser security использует exact origin allowlist, Redis-backed context cookie и связанный CSRF token на всех
  мутациях. Access credential живёт пять минут и хранится только как hash, refresh выдаётся только Secure/HttpOnly
  cookie, ротируется без grace window и отзывает всё семейство при replay. Реализованы logout, logout-all,
  немедленная проверка revocation/auth epoch и безопасные session-revocation events.
- Operation-bound proof attempts реализуют связывание, отвязывание и удаление аккаунта с независимыми CURRENT и
  TARGET proofs. Транзакции блокируют пользователя, ограничения базы предотвращают merge/duplicate identity и
  удаление последнего способа входа; linking/unlinking заменяют все сессии и пишут audit/outbox без provider
  subject или credentials.
- Черновик onboarding обновляется compare-and-set по версии. Изменения согласий append-only; completion в одной
  транзакции проверяет обязательные поля, актуальные TERMS/PERSONAL_DATA и их явное принятие, выставляет completed
  state и создаёт ровно одно `identity.onboarding.completed.v1`. Повторяемые safe mutations сохраняют HMAC
  fingerprint и AES-256-GCM response в той же транзакции на 24 часа; повтор другого payload отклоняется.
- Redis rate limits разделены namespace и применены к context, Telegram, magic request/consume, refresh family,
  proof attempts, onboarding/consent mutations, deletion и documents. Identity success/error responses получают
  `Cache-Control: no-store`; логи содержат только method, route, status и безопасные reason codes. Consent и
  locality pagination используют подписанные 15-минутные cursors, связанные с user, snapshot, query и версией
  каталога.
- Добавлены поддельные `Clock` и `EmailProvider`, unit-тесты Telegram signature/TTL/tampering, credential crypto и
  provider flags и cursor integrity/expiry, а также integration-тесты wire email login, конкуренции Telegram proof,
  rotated refresh replay, зашифрованной idempotency и привязки locality cursor.

### Проверки этапа identity 03-backend

- `npx prettier --write backend/src backend/test backend/README.md` — успешно; изменённые TypeScript и Markdown
  файлы отформатированы.
- `npm run lint --workspace @picklehub/backend`, `npm run typecheck --workspace @picklehub/backend`,
  `npm test --workspace @picklehub/backend` и `npm run build --workspace @picklehub/backend` — успешно. Unit:
  10 suites, 16 tests; lint без warnings, strict TypeScript и backend build прошли.
- `docker compose --project-name picklehub-identity-backend up --detach --wait postgres redis` — успешно; создан
  отдельный healthy test project. Обе migration применены последовательно через
  `docker exec -i picklehub-identity-backend-postgres-1 psql -v ON_ERROR_STOP=1 -U picklehub -d picklehub < ...` —
  успешно, включая foundation и `20260908090000_identity_onboarding` SQL со всеми triggers/constraints.
- `DATABASE_URL='postgresql://picklehub:picklehub@127.0.0.1:5432/picklehub?schema=public'
REDIS_URL='redis://127.0.0.1:6379/0' REDIS_NAMESPACE=identity-backend npm run test:integration --workspace
  @picklehub/backend` — финальный запуск успешен: 2 suites, 10 tests. Реальная база подтвердила одну identity и одну
  session при конкурентном replay, отзыв новой access credential после кражи rotated refresh, одну версию draft
  при idempotency replay, ciphertext вместо email/response, contract-compatible cookie/JSON/no-store wire flow и
  cursor pagination с запретом переноса позиции между пользователями.
- Первый integration-запуск внутри sandbox ожидаемо не имел доступа к loopback (`EPERM`) и выполнялся до запуска
  test dependencies; результат не засчитан. После запуска изолированного Docker project тесты повторены вне
  sandbox и прошли полностью.
- Финальный `npm run verify` — успешно: 8 workspaces и один lockfile; 28 REST operations, 11 AsyncAPI messages и
  12 identity policy/data tests; TypeSpec, Redocly, compatibility, generated drift/typecheck, Prism mock,
  formatting, 115 Markdown files, lint/typecheck/test/build всех workspace прошли. Root tests включили backend
  10 suites/16 tests и неизменённые frontend/shared suites.
- `docker compose --project-name picklehub-identity-backend down --volumes --remove-orphans` — успешно; удалены
  только созданные для этапа test containers, network и оба test volumes. `git diff --check` — успешно.
- Внешняя переменная `NODE_TLS_REJECT_UNAUTHORIZED=0` по-прежнему присутствует только в окружении и вызвала warning
  Redocly; в репозиторий она не добавлена. Реальный email endpoint, legal/provider review, retention approvals и
  DUPR allowlist остаются production prerequisites, как зафиксировано предыдущими требованиями и ADR 0004.
- Критерии backend-этапа выполнены. Следующий промпт: `llm/02-identity-onboarding/04-tma-web.md`; к нему не
  переходили.

## 2026-09-09 — идентификация и первичная настройка, этап 04-tma-web

- Активный промпт: `llm/02-identity-onboarding/04-tma-web.md`. Реализованы отдельные адаптивные интерфейсы web/PWA
  и TMA поверх опубликованного identity API. Web запрашивает magic email нейтральным ответом и погашает ссылку
  только после явного подтверждения; TMA сначала восстанавливает cookie-сессию, затем автоматически обменивает
  свежие init data через backend. Loading, offline, invalid/expired link, rate limit, конфликт, временная ошибка и
  подтверждённый успех представлены раздельно.
- Общий browser identity client держит access и CSRF только в памяти замыкания, отправляет refresh только через
  `credentials: include`, ставит `cache: no-store`, сериализует параллельный refresh и один раз повторяет
  защищённый запрос после успешной ротации. Credentials, init data, email и значения профиля не передаются в
  аналитику, storage или console. Service worker по-прежнему не имеет runtime API cache и mutation queue.
- Первичная настройка восстанавливает versioned server draft и действующие согласия, поддерживает явное сохранение
  без ложного offline-успеха и валидирует имя, IANA timezone из server options, locality из локального справочника,
  `SINGLES`/`DOUBLES`, шкалу самооценки 1.0–5.0 с шагом 0.5 и необязательный безопасный DUPR URL. DUPR input
  выключен при server capability `false`. Тексты обязательных и необязательных документов раскрываются до
  отдельных unchecked согласий; активационный переход выполняется только после ответа backend `COMPLETED`.
- Экраны управления доступом показывают собственные provider kinds без subject, запускают operation-bound LINK и
  UNLINK proofs, поддерживают Telegram proof в TMA, email proof и выход на всех устройствах. Для proof email link
  backend теперь добавляет во fragment непрозрачные `attempt` и при отвязывании `identity`: без них новая вкладка
  не могла вызвать contract endpoint с обязательным path ID. Token остаётся только во fragment, URL очищается до
  рендера, неизвестный `next` заменяется на `/onboarding`, а готовая proof-операция завершается после восстановления
  исходной cookie-сессии. Добавлен unit-тест, что secret и operation context отсутствуют в query.
- Изменённые области: browser identity SDK и тесты в `frontend/packages/api-client`, validation/deep-link helpers,
  allowlisted analytics event type, web/TMA routes, платформенные UI и CSS, Telegram init-data adapter, README обоих
  клиентов, proof-link builder backend и его unit-тест. Generated client и TypeSpec не редактировались. Четыре
  пользовательских PNG в `design/` не изменялись.

### Проверки этапа identity 04-tma-web

- Workspace-проверки `lint`, `typecheck`, `test` и `build` затронутых `@picklehub/api-client`,
  `@picklehub/validation`, `@picklehub/analytics`, `@picklehub/web`, `@picklehub/tg` и backend выполнялись отдельно и
  успешно. Финальные UI tests: web — 2 файла/4 теста, TMA — 1 файл/2 теста; shared API/validation — 2 и 4 теста;
  backend — 11 suites/17 unit tests. Покрыты явный POST magic link, очистка fragment и safe target, offline запрет
  мутаций, автоматический TMA exchange, memory-only Authorization и серверно подтверждённая активация.
- Production builds web и TMA успешны. Web PWA создала manifest/service worker и precache только оболочки; TMA
  build-check подтвердил отсутствие development Telegram mock. Backend и все общие пакеты также собраны успешно.
- Первый `npm run verify` успешно прошёл workspace check, TypeSpec/Redocly, 28 REST/11 messages policy,
  compatibility, generated drift/typecheck и Prism mock, затем обнаружил единственный неотформатированный новый
  UI test. После `npx prettier --write` второй полный запуск повторно прошёл contract lint/compatibility/drift, но
  Prism не смог открыть `127.0.0.1` из-за sandbox `listen EPERM`; это не засчитано как повторный успех mock.
  Отдельная финальная команда `npm run format:check && npm run docs:check && npm run lint && npm run typecheck &&
npm test && npm run build && git diff --check` прошла полностью: 115 Markdown-файлов, восемь workspace для
  lint/typecheck/build и 13 test tasks без ошибок.
- Не запускались live browser e2e и backend integration с PostgreSQL/Redis: prompt требует UI tests/builds, а
  единственное backend-изменение — чистый builder fragment — покрыто unit-тестом. Реальные email/TMA smoke остаются
  невозможны без одобренного email provider, Telegram bot и production legal/provider gates; их наличие не
  заявляется. Внешняя `NODE_TLS_REJECT_UNAUTHORIZED=0` остаётся проблемой окружения и не добавлена в репозиторий.
- Критерии клиентского этапа выполнены. Следующий промпт: `llm/02-identity-onboarding/05-verification.md`; к нему не
  переходили.

## 2026-09-09 — идентификация и первичная настройка, этап 05-verification

- Активный промпт: `llm/02-identity-onboarding/05-verification.md`. Добавлен самостоятельный Playwright-контур с
  `@playwright/test` 1.55.0 и проверкой production-сборок без HTTP test server: статические файлы отдаются через
  browser route interception из `/private/tmp`, а API заменён contract-shaped mock. Это позволяет не встраивать
  тестовую аутентификацию в приложение и не зависит от разрешения на открытие loopback-порта.
- Web-сценарий проверяет, что fragment magic-ссылки очищен до явного подтверждения, token погашается только после
  клика, серверный onboarding draft загружается и сохраняется, а после новой загрузки восстанавливаются имя и
  выбранный timezone. Один сценарий параметризован для `Europe/Moscow` и `Asia/Yekaterinburg`; дополнительно
  проверяются один `main`/`h1`, доступные имена полей и действий и отсутствие горизонтального переполнения.
- TMA-сценарий запускает production bundle с Telegram launch parameters, проверяет автоматический refresh fallback,
  передачу raw init data только в `/auth/telegram` и открытие сохранённого черновика. Development adapter теперь
  может взять `tgWebAppData` из стандартного launch fragment; ветка остаётся под `import.meta.env.DEV`, а штатный
  build-check подтвердил её отсутствие в production bundle.
- Contract regression запрещает lookup-dependent status для запроса magic email и поля, раскрывающие email,
  регистрацию или доставку. Backend regression расширен проверками точных cookie flags, запрещённого Origin/CSRF,
  одинакового нейтрального ответа, конкурентного погашения magic link, гонки присоединения одной identity к двум
  аккаунтам, безопасного outbox, удаления с отзывом access и очисткой refresh cookie, единственности deletion event
  и одинаковой ошибки для истёкшего/неизвестного token. Telegram unit test фиксирует границы TTL и future skew.
- Требование продукта упоминает доступность экспорта собственных данных, но опубликованный TypeSpec и закреплённый
  exact operation inventory не содержат export operation, а backend и клиенты её не реализуют. На verification
  этапе новый wire contract молча не добавлялся. Это обнаруженный release gap: сначала нужен отдельный
  contract/data design с форматом, повторной аутентификацией, аудитом, retention/legal hold и правилами доставки.

### Проверки этапа identity 05-verification

- `npm install --save-dev @playwright/test@1.55.0 --offline` — успешно из локального npm cache; обновлены только
  корневые manifest и lockfile, аудит сообщил 0 vulnerabilities.
- `npm run contracts:lint` — успешно: TypeSpec compile, Redocly, 28 REST/11 messages policy и 13 identity
  policy/data tests, включая новый отрицательный fixture email enumeration.
- `npm run lint --workspace @picklehub/backend`, `npm run lint --workspace @picklehub/web`,
  `npm run lint --workspace @picklehub/tg`, их typecheck/test/build и `npm run test:e2e:typecheck` — успешно.
  Backend unit: 11 suites/19 tests; web: 2 files/4 tests; TMA: 1 file/2 tests. Production web/TMA builds успешны;
  TMA check подтвердил отсутствие development Telegram mock.
- Финальный `npm run verify` — успешно: workspace/lockfile, TypeSpec/Redocly, compatibility, generated drift и
  typecheck, Prism mock, форматирование, 115 Markdown-файлов, lint/typecheck/test/build всех восьми workspace.
  Root tests выполнили 13 Turbo tasks без ошибок; `git diff --check` также успешен.
- `npm run test:e2e` успешно собрал обе production-версии и начал три Playwright-сценария, но sandbox завершил
  каждый системный headless Chrome сразу после запуска с `SIGABRT`; попытка kill также получила `EPERM`. Результат
  e2e не засчитан. Вне этого sandbox команда не требует test server; при отсутствии системного Chrome нужен
  `npx playwright install chromium` либо `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- Docker daemon недоступен из sandbox (`permission denied` к `/Users/ruasvyn/.docker/run/docker.sock`). Прямой
  integration-запуск также не засчитан: соединения к PostgreSQL `127.0.0.1:5432`, Redis `127.0.0.1:6379` и
  временный listener Supertest запрещены с `EPERM`. Новые database concurrency/deletion tests прошли lint и strict
  TypeScript, но требуют повторного runtime-прогона в разрешённой среде.
- Внешняя `NODE_TLS_REJECT_UNAUTHORIZED=0` по-прежнему присутствует только в окружении и вызвала warning Redocly;
  в репозиторий она не добавлена. Пользовательские PNG в `design/` не изменялись.
- Этап не объявлен полностью принятым: нужны успешные runtime-прогоны `npm run test:e2e` и backend integration, а
  также контрактное решение для экспорта. К следующим feature-промптам не переходили.

## 2026-09-10 — площадки, этап 01-requirements

- Активный промпт: `llm/03-venues/01-requirements.md`. По прямому указанию начат следующий документационный этап;
  незакрытые runtime/export gaps `02-identity-onboarding/05-verification` не объявлялись устранёнными. Контракты,
  Prisma, backend и интерфейсы площадок не создавались.
- Product requirements получили девять пользовательских историй для карты/списка, текстового геокодирования,
  выбора, match-only кандидата, исправления, жалобы и модерации и 14 сценариев «Дано/Когда/Тогда». Зафиксированы
  отдельные publication/verification состояния, обязательная координата, одинаковые фильтры карты/списка,
  unknown-семантика удобств, часы/доступ, offline/provider ошибки и доступность интерфейса.
- Кандидат остаётся непубличным до подтверждённо состоявшегося матча, proximity review и единственного решения
  модератора. Расстояние 100 м формирует набор проверки, но не выполняет автослияние. Merge сохраняет canonical
  survivor, постоянный alias и append-only историю; privacy report немедленно скрывает потенциальный домашний
  адрес до review. Площадка не зависит от клуба, а будущая связь клуба с площадкой необязательна.
- Происхождение описано неизменяемыми source records с provider/source version, import batch, observed time,
  license/policy version, разрешёнными полями и атрибуцией. Внешняя подсказка transient по умолчанию; сохранение
  допускается только после явного выбора и при `storageAllowed`. OSM seed требует отдельного актуального ODbL,
  attribution, endpoint/tile и residency review; Yandex/2GIS или иной provider не выбирался и не заявлялся
  разрешённым.
- Политика устаревания помечает карточку после 180 суток, ставит refresh за 30 суток до порога и отдельно
  обрабатывает удалённый/недоступный upstream. Единственный источник без доказанного права хранения снимает
  карточку до review; независимое разрешённое происхождение предотвращает автоматическое удаление.
- Domain model и architecture синхронизированы по владению `venues`, candidates/revisions/reports/decisions,
  source/merge history, PostGIS и provider ports/capabilities. Security/privacy описывает классификацию публичной
  venue и restricted candidate/search origin, provider registry, fail-closed production gate, минимизацию,
  предлагаемый retention и запрет координат/сырого ввода в logs, analytics и rate-limit keys.
- Analytics plan получил allowlisted server/client events, условия, дедупликацию, владельцев и применение.
  Product metrics покрывают search/select и candidate moderation funnel; quality metrics — provider availability,
  provenance/attribution, stale/removed sources, privacy quarantine и дубли. Сохранение при запрещённом capability,
  публикация без координаты/provenance и отсутствие обязательной атрибуции имеют целевое значение ноль.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/analytics-plan.md`, `llm/_docs/security-privacy.md`, `llm/_docs/architecture.md` и этот журнал.
  Пользовательские PNG в `design/` не изменялись.

### Проверки этапа venues 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/domain-model.md
llm/_docs/analytics-plan.md llm/_docs/security-privacy.md llm/_docs/architecture.md` — успешно.
- `npm run format:check`, `npm run docs:check` и read-only Node.js-проверка относительных Markdown-ссылок в пяти
  затронутых документах — успешно: TypeSpec format без изменений, 115 Markdown-файлов без ошибок, 23 ссылки с
  существующими целями. `git diff --check` — успешно.
- `npm run verify` успешно прошёл workspace audit (8 workspace, один lockfile), TypeSpec/OpenAPI lint, 28 REST/11
  messages policy и 13 policy tests, compatibility с HEAD, generated drift и contract typecheck. Затем Prism mock
  не смог открыть `127.0.0.1` из-за ограничения sandbox `listen EPERM`; полный `verify` не заявляется успешным.
- Оставшаяся цепочка выполнена отдельно: `npm run format:check && npm run docs:check && npm run lint && npm run
typecheck && npm test && npm run build && npm ls --depth=0 && git diff --check` — успешно. Turbo: lint/typecheck
  по 8 задач, tests 13 задач (backend 11 suites/19 tests), build 8 задач; unmet/extraneous dependencies и whitespace
  errors отсутствуют. Это regression существующей реализации, а не тест ещё не созданной venue-функции.
- Внешние условия OSM/Overpass, tiles и геокодеров, юридические основания/retention и data residency не
  проверялись и остаются production gates. Известные identity runtime/export gaps и внешняя переменная
  `NODE_TLS_REJECT_UNAUTHORIZED=0` не закрыты этим этапом.
- Содержательные критерии документационного этапа выполнены. Следующий промпт:
  `llm/03-venues/02-contract-data.md`; к нему не переходили.

## 2026-09-10 — площадки, этап 02-contract-data

- Активный промпт: `llm/03-venues/02-contract-data.md`; backend use cases, UI и административные endpoint функции
  `08` не реализовывались. Пользовательские PNG в `design/` не изменялись.
- REST: добавлен TypeSpec source `contracts/rest/venues.tsp` с восемью operations для bbox-карты, radius/text
  каталога, transient geocoder suggestions, публичной карточки, создания и self-status match-only кандидата,
  предложения исправления и структурированной жалобы. Карта и каталог имеют единые typed filters; radius
  ограничен 50 000 м, bbox — 100×100 км без antimeridian, координаты WGS84 — шестью десятичными знаками, cursor
  живёт 15 минут и связан с mode/filter/snapshot. Стабильная provider error —
  `GEOCODER_TEMPORARILY_UNAVAILABLE` + `Retry-After`.
- Безопасность контракта: suggestions/status/mutations требуют bearer, мутации также browser CSRF и UUIDv4
  `Idempotency-Key`. Geocoder token — short-lived opaque oneOf source; выбранные внешние поля сохраняются только
  при capability `storageAllowed`. Ответ кандидата не содержит адрес, координату, contributor или moderator.
  Admin moderation routes не опубликованы.
- Данные: Prisma и migration `20260910090000_venues_contract_data` добавляют `Venue`, `VenueSource`,
  `VenueCandidate`, `VenueRevision`, structured report, moderation decision, immutable merge history и
  зашифрованную 24-hour venue idempotency. Точки генерируются как `geography(Point, 4326)` из bounded decimal
  longitude/latitude; GiST indexes обслуживают `ST_DWithin` и `ST_Intersects`, GIN — catalogue text. Provenance
  append-only, требует license/policy/allowed fields/attribution и не допускает запись с `storageAllowed=false`;
  provider/source ID canonical-уникален.
- Инварианты: source match уникален; state/terminal decision защищены CHECK, partial unique indexes и transition
  triggers. Merge оставляет старую `venues` row, запрещает delete/reuse ID, указывает прямо на published survivor
  и разрешается `resolve_canonical_venue_id`, поэтому существующий FK матча остаётся валиден. Добавлен реальный
  integration test миграции для geography metadata, обоих GiST `EXPLAIN` plan и временного match FK через merge.
- События: отдельный internal outbox channel `venue.events.v1` содержит `venue.candidate.created.v1`,
  `venue.verified.v1`, `venue.merged.v1`. Dotted versioned имя создания сохраняет смысл требуемого
  `venue.candidate_created` и совместимо с действующим platform outbox type constraint. Payload sealed и содержит
  только opaque IDs/ограниченный verification state, без адресов, координат, search origin и actor IDs.
- Tooling: contract path/message allowlist, policy/data mutation tests, mock smoke и документация обновлены;
  OpenAPI, contract TypeScript и API-client types воспроизводимо перегенерированы.

### Проверки этапа venues 02-contract-data

- `DATABASE_URL=... PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npm run
prisma:generate --workspace @picklehub/backend` — успешно; Prisma Client 6.16.2 сгенерирован, DMMF/schema
  relations валидны без загрузки native engines.
- `npm run contracts:check` — один полный запуск успешно прошёл TypeSpec, Redocly без warnings, policy 36 REST/14
  messages, 27 policy/data tests, compatibility against HEAD, generated drift/typecheck и расширенный Prism smoke
  для health, identity, venue text search/candidate и отсутствующего `/matches`. После финального ужесточения
  geocoder source до OpenAPI `oneOf` отдельно успешно повторены `contracts:lint`, `contracts:breaking`,
  `contracts:generated:check` и `contracts:typecheck`; повтор Prism заблокирован sandbox `listen EPERM`.
- `npm run format:check`, `npm run docs:check` и `git diff --check` — успешно; три TypeSpec source отформатированы,
  115 Markdown files без ошибок, whitespace errors отсутствуют.
- `npm run lint && npm run typecheck && npm test && npm run build && npm ls --depth=0` — успешно для восьми
  workspaces: lint/typecheck 8 задач, tests 13 задач (backend 11 suites/19 tests), build 8 задач; dependency tree
  без unmet/extraneous. После финальной генерации API-client отдельно повторно прошёл lint, typecheck, 2 tests и
  build; после добавления migration integration test backend отдельно прошёл lint/typecheck и 11 unit suites/19
  tests.
- `npm run verify` дошёл до повторного `contracts:mock:check` и остановился на запрете sandbox открывать
  `127.0.0.1` (`listen EPERM`); предшествующие workspace/contract checks прошли. Полный финальный verify поэтому не
  заявляется успешным, хотя отдельный полный contract mock до этого прошёл.
- Runtime migration/plan verification не выполнена: sandbox не разрешает доступ к Docker socket, локальные
  `psql`/`postgres` отсутствуют. `venues-migration.integration-spec.ts` готов применяться после трёх migrations и
  проверяет реальные GiST планы и сохранение match FK, но его успех не заявляется. `npx prisma format` также
  попытался скачать schema engine и получил network `ENOTFOUND`; репозиторный `format:check` и Prisma generate
  успешны. Эти runtime проверки обязательны в доступном CI/PostGIS окружении до закрытия критерия миграции.
- Внешняя `NODE_TLS_REJECT_UNAUTHORIZED=0` всё ещё присутствует только в окружении и вызвала warning; она не
  добавлена в репозиторий. Ни один map/geocoder/OSM provider, лицензия, legal/residency/retention capability не
  объявлены одобренными.
- Код следующего промпта `llm/03-venues/03-backend.md` не начинался. Контракт и миграционный test suite готовы,
  но критерий runtime-применения migration и фактического `EXPLAIN` остаётся заблокирован окружением.

## 2026-09-10 — площадки, этап 03-backend

- Активный промпт: `llm/03-venues/03-backend.md`. Реализован NestJS-модуль `venues` с REST presentation для
  восьми ранее опубликованных operations, application use cases, DTO validation, стабильными venue errors,
  зашифрованной 24-hour idempotency и self-only projection кандидата. Каталог использует параметризованные
  `ST_DWithin`/`ST_Intersects` запросы к indexed geography, GIN text search, snapshot/cursor pagination и единые
  filters; cursor содержит HMAC привязки, а не raw query, bbox или search origin.
- Нормализация выполняет Unicode NFKC, удаление control characters, схлопывание пробелов и стабильную обработку
  адресных разделителей. Proximity 100 м только формирует возможные дубли: OSM importer объединяет совпавший
  нормализованный name/address, а community candidate остаётся `PENDING_REVIEW` для решения модератора. Переход
  кандидата по подтверждённому матчу идемпотентен и доступен через экспортированный application method; до этапа
  matches HTTP-создание fail-closed через `VenueMatchPort`, не выдумывая владение ещё не существующим матчем.
- Добавлены provider ports и fail-closed adapters. Geocoder suggestions хранятся только в process memory не более
  10 минут и удаляются после выбора; persistence разрешается только при полном allowed-fields capability и
  provenance. Overpass adapter не обращается к tile server, принимает только pickleball allowlist, исключает
  явно private записи, требует явных policy/license/attribution/user-agent settings, ограничивает частоту и делает
  не более трёх bounded retry. Конкретный production provider и юридическое разрешение не объявлялись.
- Операторский OSM importer поддерживает `--dry-run`, idempotency по provider/source version/scope, persisted
  checkpoint каждые 50 элементов, счётчики, failed/completed runs, external-source и proximity deduplication.
  Ошибка fetch/item не удаляет и не переписывает каталог. Новая migration `20260910120000_venues_backend`
  добавляет runs/checkpoints, terminal-state constraints и защиту завершённых запусков от изменения.
- Candidate/source, qualification, import и privacy report пишут минимальный audit; создание кандидата и
  импортированного venue создают contract-defined outbox events без координат/адресов/actor IDs. Метрики покрывают
  search, provider failure, import/dedup/quarantine, candidate lifecycle, reports и cache invalidation. Жалоба
  `PRIVATE_RESIDENCE` атомарно меняет PostgreSQL publication state на `PRIVACY_REVIEW`; generation invalidation
  выполняется только после commit и её сбой не возвращает скрытую запись в выдачу.
- Добавлены unit tests нормализации/provider defaults и integration suite с fake import port для повторного
  импорта, PostGIS radius search с attribution, сохранения каталога при provider failure и privacy quarantine.
  Обновлены `backend/.env.example`, backend runbook, scripts, Prisma schema, API/worker module composition и
  необходимые exports identity infrastructure. Пользовательские PNG в `design/` не изменялись.

### Проверки этапа venues 03-backend

- `DATABASE_URL=... PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npm run
prisma:generate --workspace @picklehub/backend` — успешно, Prisma Client 6.16.2 сгенерирован из обновлённой
  schema без сетевой загрузки native engine. Обычная первая попытка generate получила network `ENOTFOUND` при
  обращении за schema engine; секреты или обход TLS в репозиторий не добавлялись.
- `npm run typecheck --workspace @picklehub/backend`, `npm run lint --workspace @picklehub/backend`, `npm test
--workspace @picklehub/backend -- --runInBand` и `npm run build --workspace @picklehub/backend` — успешно после
  финальных изменений: 12 unit suites/23 tests, strict TypeScript/ESLint без warnings, production compile успешен.
- `npm run contracts:check` — успешно: TypeSpec/Redocly, 36 REST/14 messages policy, 27 contract/data tests,
  compatibility, generated drift/typecheck и Prism mock. `npm run workspace:check`, `npm run docs:check`, `npm run
format:check`, отдельные venues policy/data tests и `git diff --check` — успешно; 115 Markdown-файлов без ошибок.
- Runtime PostGIS/Redis acceptance не засчитана. `docker compose up -d postgres redis` получил `permission denied`
  к `/Users/ruasvyn/.docker/run/docker.sock`; прямые соединения integration runner к `127.0.0.1:6379` запрещены с
  `EPERM`, а локальная БД не содержит новую migration. Финальная попытка venue integration подтвердила успешную
  сборку Nest dependency graph, затем остановилась на недоступной/немигрированной инфраструктуре. Тесты
  `venues-migration.integration-spec.ts` и `venues.integration-spec.ts` должны быть повторены после применения
  всех migrations в разрешённом CI/PostGIS окружении; их runtime-успех не заявляется.
- Следующий промпт: `llm/03-venues/04-tma-web.md`; к нему не переходили. Production enablement OSM/geocoder остаётся
  отдельным legal, terms, attribution, endpoint-usage и data-residency gate.

## 2026-09-10 — площадки, этап 04-tma-web

- Активный промпт: `llm/03-venues/04-tma-web.md`. В отдельных React-интерфейсах web/PWA и TMA добавлен маршрут
  `/venues`: общий по смыслу набор фильтров, text/radius/bbox search, cursor pagination, явный запрос геолокации,
  ручной выбор области, список и MapLibre-карта с server-side выборкой и встроенной кластеризацией GeoJSON.
  Отказ в геолокации запоминается до размонтирования экрана и не мешает текстовому/ручному поиску.
- Карта загружается отдельным lazy chunk только при выборе представления и наличии runtime-блока `map` с HTTPS
  style/attribution. Конкретный provider не выбран: `example.invalid` намеренно неработоспособен, отсутствие
  одобренной конфигурации явно оставляет list fallback. Tile error не скрывает список и атрибуцию источников.
- Карточка показывает отдельное verification state, дату проверки, unknown-семантику часов/удобств и все
  разрешённые attribution records. Явный выбор отправляет только allowlisted `venue_selected` с surface и bucket
  расстояния; query, bbox, радиус, venue ID, адрес и координаты в analytics не передаются.
- Добавлены typed API-client methods для восьми venue operations. Public catalogue/detail не требуют bearer;
  geocoder и self status требуют session, а candidate/revision/report дополнительно используют CSRF и новый UUIDv4
  idempotency key. Provider/version/rate/privacy errors имеют отдельные безопасные русские состояния.
- Форма match-only кандидата поддерживает transient geocoder suggestion и manual coordinates, требует source match
  ID и явного подтверждения публичности адреса. Очевидные признаки частного дома блокируются до API; успех
  показывается только после server response и не обещает публикацию до состоявшегося матча и модерации. Исправление
  создаёт revision без оптимистической смены карточки; жалоба ограничена `PRIVATE_RESIDENCE`/`DUPLICATE`/`CLOSED`.
- Web service worker получил ограниченный 15-минутный `NetworkFirst` cache только для публичных GET каталога,
  bbox-карты и detail, без geocoder/self/mutations. Offline web показывает время снимка; TMA сохраняет уже
  загруженный список в памяти. Все мутации отключены offline. Добавлены MapLibre GL 5.7.1 и runtime-config tests.
- UI tests проверяют list attribution, tile-config fallback, отказ геолокации без блокировки поиска, offline
  поведение и запрет очевидного частного адреса: web — 3 suites/8 tests, TMA — 2 suites/6 tests. API-client tests
  проверяют query serialization, bearer/CSRF/idempotency mutation headers; validation проверяет HTTPS map config.
  Пользовательские PNG в `design/` не изменялись.

### Проверки этапа venues 04-tma-web

- `npm run workspace:check` — успешно: восемь workspaces и один корневой lockfile.
- `npm run contracts:check` прошёл TypeSpec, Redocly, policy 36 REST/14 messages и 27 tests, compatibility с HEAD,
  generated drift и contract typecheck; финальный Prism mock заблокирован sandbox на `listen EPERM 127.0.0.1`.
  Поэтому единый `contracts:check`/`verify` не заявляется полностью успешным; контрактный source не менялся.
- `npm run format:check`, `npm run docs:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
  `npm ls --depth=0` и `git diff --check` — успешно. Turbo: lint/typecheck/build по восьми пакетам, tests 13 задач;
  backend 12 suites/23 tests, web 3/8, TMA 2/6. PWA manifest/service worker и TMA production guard прошли.
- Отдельно после cursor pagination успешно повторены `npm run lint --workspace @picklehub/web`, `npm run lint
--workspace @picklehub/tg`, обе workspace typecheck/test/build. MapLibre chunk вынесен из main bundle; Vite оставил
  неблокирующее предупреждение о размере lazy map chunk 924 kB (247.97 kB gzip).
- Диагностическая ранняя команда `npm test --workspace @picklehub/web -- --runInBand` была отклонена Vitest как
  неизвестный флаг; корректная команда без Jest-флага затем прошла. Ранняя TMA build выявила и после исправления
  единственного лишнего символа CSS успешно прошла повторно.
- Следующий промпт: `llm/03-venues/05-verification.md`; к нему не переходили. Реальные tiles/geocoder остаются
  выключенными до legal/terms/attribution/residency review; live WebGL/provider smoke требует одобренной runtime
  конфигурации и браузерного окружения.

## 2026-09-10 — площадки, этап 05-verification

- Активный промпт: `llm/03-venues/05-verification.md`. Расширен PostGIS integration-контур: inclusive radius/bbox
  boundaries, отказ от antimeridian-crossing bbox для целевого региона, запрет повреждённых координат, GiST
  `EXPLAIN` на 5000 строках, map/radius parity с одинаковыми фильтрами, cursor pagination без повторов и сохранение
  match FK через permanent merge alias. Тесты не подменяют реальный plan статическим поиском SQL.
- Import integration теперь проверяет повтор одного OSM snapshot, изменённый внешний элемент без перезаписи
  immutable canonical данных, пустой snapshot без удаления каталога, provider failure, attribution и карантин
  некорректной геометрии. Runtime import дополнительно fail-closed проверяет конечные WGS84-координаты, точность,
  совпадение source ID/version, полный allowlist сохранённых полей, license/policy/attribution и допустимый
  `observedAt` до PostGIS insert.
- Новый unit suite Overpass проверяет не более трёх попыток с bounded backoff, минимальный интервал между
  запросами, user-agent/атрибуцию и отказ antimeridian/malformed scope до внешнего вызова. Все provider endpoints и
  attribution links теперь требуют HTTPS на границе конфигурации; отсутствие полного capability продолжает
  запрещать включение адаптера.
- Candidate integration проверяет конкурентный повтор события подтверждённого матча: только один переход в
  `PENDING_REVIEW`, без автослияния по proximity и без публикации второй canonical venue. Существующий privacy
  integration подтверждает атомарный перевод жалобы `PRIVATE_RESIDENCE` в `PRIVACY_REVIEW`; storage policy tests
  сохраняют unique terminal decision, append-only merge history и permanent alias. Admin moderation UI/API по
  плану остаётся функцией `08`, поэтому verification не добавляет скрытый административный endpoint.
- Web и TMA UI tests проверяют одинаковую передачу filters в list/map endpoints в дополнение к attribution,
  geolocation denial, map fallback, offline и private-address guard. Web production build-check теперь требует
  bounded 15-minute `NetworkFirst` cache публичных venue GET и запрещает cache geocoder/candidate/report paths.
  Добавлены три production-build Playwright-сценария для web/TMA parity, geolocation denial, сквозного 503
  geocoder fallback и сохранения уже загруженного read-only каталога offline без доступных мутаций.
- Workflow получил отдельный `browser` job с установкой Chromium и `npm run test:e2e`; e2e typecheck автоматически
  включает все `test/e2e/*.spec.ts`. В operations traceability добавлена browser-проверка.
- Создан `llm/_docs/venue-provider-register.md`. OSM seed, массовый Overpass endpoint, tiles и geocoder имеют только
  `NOT_APPROVED`/`NOT_CONFIGURED`; тестовые названия лицензии и attribution явно не считаются разрешением. Реестр
  содержит checklist официальных условий, residency, purpose/fields, refresh/deletion, usage policy, attribution,
  approval и smoke evidence.

### Проверки этапа venues 05-verification

- Один полный `npm run verify` — успешно: workspace/lockfile, TypeSpec, Redocly, 36 REST operations/14 messages и
  27 contract policy/data tests, compatibility, generated drift/typecheck, Prism mock, formatting, 116 Markdown
  files, lint/typecheck/tests/build всех восьми workspaces. После финального HTTPS config guard повторный verify
  снова прошёл contract lint/compatibility/drift/typecheck, но остановился на sandbox `listen EPERM 127.0.0.1` в
  Prism; повторный полный успех не заявляется. Отдельная финальная команда без socket-зависимого mock прошла все
  остальные проверки. Backend unit: 13 suites/27 tests; web: 3 suites/9 tests; TMA: 2 suites/7 tests. PWA build
  подтвердил manifest/service worker и venue cache guard; TMA production guard прошёл.
- `npm run test:e2e:typecheck` и `npm run test:e2e:build` — успешно; production web/TMA bundles и шесть Playwright
  tests собраны. `npm run test:e2e` и отдельный `npx playwright test test/e2e/venues.spec.ts --workers=1` не смогли
  запустить локальный Chrome: процесс завершился `SIGABRT`, sandbox запретил kill с `EPERM`. Ни один browser test
  runtime здесь не засчитан успешным; повтор обязателен в добавленном CI `browser` job.
- `DATABASE_URL=... REDIS_URL=... npm run test:integration --workspace @picklehub/backend -- --runInBand` —
  заблокирован sandbox: соединения с `127.0.0.1:5432` и `:6379` отклонены `EPERM`. Поэтому новые реальные PostGIS
  boundary/index/pagination/import/candidate tests и прежние migration/merge tests должны пройти в CI
  `integration` после `prisma migrate deploy`; runtime-успех не заявляется.
- Отдельные `npm run lint/typecheck/test/build --workspace @picklehub/backend` — успешно после финальных изменений;
  `npm run typecheck/test` для web и TMA — успешно. `npm run compose:config:check`, `npm ls --depth=0` и
  `git diff --check` — успешно; dependency tree без unmet/extraneous. Vite оставил известное неблокирующее
  предупреждение о lazy MapLibre chunk 924 kB (247.97 kB gzip).
- Пробелы: importer пока не хранит `REMOVED`/`UNREACHABLE` observation и не создаёт revision изменившегося OSM
  элемента; безопасное текущее поведение не перезаписывает и не удаляет canonical каталог. До production seed
  нужны source refresh/state и policy-driven очистка. Live provider/WebGL и HTTPS Service Worker smoke также
  остаются закрыты до выбора и доказанного одобрения provider capabilities. Внешняя
  `NODE_TLS_REJECT_UNAUTHORIZED=0` присутствует только в окружении, вызвала Redocly warning и не добавлена в
  репозиторий.
- Код matches не начинался. Следующий промпт после чтения `llm/04-matches/00-overview.md` —
  `llm/04-matches/01-requirements.md`.

## 2026-09-10 — матчи, этап 01-requirements

- Активный промпт: `llm/04-matches/01-requirements.md`. Изменения ограничены требованиями, доменной моделью,
  архитектурой, безопасностью и аналитикой; TypeSpec/AsyncAPI, Prisma, backend и клиентский код матчей не
  создавались.
- Product requirements получили 15 историй: черновик/публикация, поиск/карточка/capability link, `AUTO` и
  `APPROVAL`, решение/отзыв заявки, FIFO promotion, выход, отмена, начало, предложение, подтверждение и спор.
  Определены автоматы матча, участника, заявки, очереди/offer и версий результата и 26 сценариев
  «Дано/Когда/Тогда» для гонок, replay и недопустимых переходов.
- Вместимость вычисляется по активным участникам и гостям, а offer только резервирует вакансию; отдельного full
  status нет. SQL constraints и сериализация агрегата обязаны защищать пределы `SINGLES`/`DOUBLES`, уникальность
  участия и FIFO. Организатор всегда первый игрок `TEAM_A`; гость не имеет аккаунта, подтверждения или статистики.
- Зафиксированы hard filters и версионируемая rule-based рекомендация 0–100: расстояние 35%, время 30%, формат
  20%, уровень 15%, стабильный tie-break и две объяснимые причины. Product policy задаёт draft retention,
  publish/search horizon, join/offer/start/result/confirmation deadlines; границы считаются серверными UTC-часами.
- `UNLISTED` использует capability token не менее 128 бит с хранением keyed hash, ротацией, одинаковым not-found и
  запретом утечки в referrer/log/analytics/cache. Booking note остаётся непроверенным plain text о внешней броне;
  платежи, booking provider, повторение расписания и обещание брони не добавлялись.
- Результат — `SCORED` с валидной серией `BEST_OF_1/3/5` либо `PLAYED_WITHOUT_SCORE`. Только зарегистрированный
  соперник подтверждает конкретную версию. Immutable marker по match + metric type — единственный источник
  недельной основной метрики; proposed/disputed/voided/cancelled/no-show не учитываются, replay не дублирует
  marker. Behavioral analytics остаётся consent-filtered, обязательный внутренний агрегат marker — нет.
- Domain model/architecture фиксируют владение matches и ports к profiles/venues, атомарность roster/result/marker,
  минимальные события для venues/communications/statistics/trust-safety. Security/privacy добавляет классификацию,
  rate limits, audit и предлагаемый retention, который требует legal review до production. Analytics plan задаёт
  allowlisted события, дедупликацию, владельцев, funnel/guardrails и запрет token, состава, счёта и географии.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/analytics-plan.md`, `llm/_docs/security-privacy.md`, `llm/_docs/architecture.md` и этот журнал.

### Проверки этапа matches 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/domain-model.md
llm/_docs/analytics-plan.md llm/_docs/security-privacy.md llm/_docs/architecture.md` — успешно.
- `npm run format:check`, `npm run docs:check`, read-only Node.js-проверка относительных Markdown-ссылок в пяти
  документах и `git diff --check` — успешно: TypeSpec format без изменений, 116 Markdown-файлов без ошибок,
  проверено 30 ссылок с существующими целями.
- `npm run verify` — успешно полностью: workspace audit (8 workspace, один lockfile), TypeSpec/Redocly, policy
  36 REST operations/14 messages и 27 tests, compatibility, generated drift/typecheck, Prism mock, format/docs,
  lint/typecheck/test/build всех восьми workspace. Backend unit: 13 suites/27 tests; web: 3/9; TMA: 2/7;
  production PWA/TMA guards прошли. Turbo использовал cache для неизменённого продуктового кода.
- `npm ls --depth=0` и финальный `git diff --check` — успешно; unmet/extraneous dependencies и whitespace errors
  отсутствуют. Vite сохранил известное неблокирующее предупреждение о lazy MapLibre chunk 924 kB. Внешняя
  `NODE_TLS_REJECT_UNAUTHORIZED=0` по-прежнему присутствует только в окружении и вызвала Redocly warning; она не
  добавлена в репозиторий.
- Новые integration/e2e/Docker проверки не добавлялись и не запускались: этап меняет только документацию.
  Успешный regression не является тестом ещё не реализованных матчевых constraints и гонок. Legal approval
  retention и обработка public/unlisted данных до production не заявляются.
- Содержательные критерии этапа выполнены. Следующий промпт: `llm/04-matches/02-contract-data.md`; к нему не
  переходили.

## 2026-09-10 — матчи, этап 02-contract-data

- Активный промпт: `llm/04-matches/02-contract-data.md`. Backend use cases/controllers и UI матчей не создавались;
  они принадлежат следующим этапам.
- TypeSpec добавляет 23 match operations: публичный поиск, аутентифицированные рекомендации, create/read/update/
  delete draft, publish/rotate invite, join и organizer decisions, withdrawal/leave, FIFO waitlist, cancel/start и
  versioned propose/confirm/dispute result. Все ответы `no-store`; мутации защищены bearer, browser CSRF,
  UUIDv4 `Idempotency-Key` и `expectedVersion` существующего агрегата. `UNLISTED` отсутствует в discovery, имеет
  отдельный read-only capability route и одинаковую `INVITE_INVALID` ошибку.
- OpenAPI содержит модели `Match`, `MatchTeam`, `MatchParticipant`, `JoinRequest`, `WaitlistEntry`, `MatchResult`,
  `GameScore`, `ResultConfirmation` и закрытые enum жизненного цикла. Generated OpenAPI и TypeScript artifacts,
  включая `@picklehub/api-client`, обновлены только генератором.
- AsyncAPI получил внутренний `match.events.v1` и девять совместимых `match.*.v1` событий. Payload ограничен opaque
  match/result/marker IDs, aggregate/result version и enum/buckets; token, пользователи/состав, score, text,
  skill/venue/geography и dispute reason запрещены policy test.
- Prisma schema и forward migration создают агрегат, команды, registered/guest places, заявки, FIFO entries,
  keyed-hash invites, versioned results/games/confirmations, immutable metric marker и encrypted idempotency
  responses. PostgreSQL row lock корня и immediate/deferred constraint triggers защищают capacity, одно active
  involvement, FIFO/offer, допустимые terminal transitions и атомарную пару match/result. Уникальный marker по
  match + `CONFIRMED_MATCH` удерживает единственный вклад в главную метрику.
- `game_scores` требует неотрицательные очки, минимум 11 и разницу минимум два; deferred series guard проверяет
  последовательную завершённую `BEST_OF_1/3/5`, winner и отсутствие лишних партий. Это допускает корректные игры
  до 11, 15, 21 и deuce. Добавлен PostgreSQL integration test для 11/15/21, invalid margin и конкурентных claims
  последнего места.
- Изменённые source/config files: `contracts/rest/main.tsp`, `contracts/rest/matches.tsp`, `asyncapi.yaml`,
  `backend/prisma/schema.prisma`, migration `20260910150000_matches_contract_data`, match policy/data-policy tests,
  PostgreSQL integration test, contract policy/mock scripts, `contracts/README.md`, root contract test script и
  этот журнал. Generated files: `openapi.yaml`, `contracts/generated/{openapi,asyncapi}.ts` и
  `frontend/packages/api-client/src/generated/openapi.ts`.

### Проверки этапа matches 02-contract-data

- `npm run contracts:check` — успешно: TypeSpec и Redocly, contract policy (59 REST operations/23 messages),
  38 policy/data tests, compatibility against `HEAD`, deterministic generated drift/typecheck и Prism smoke.
- `DATABASE_URL=... PRISMA_SCHEMA_ENGINE_BINARY=<локальный кеш> PRISMA_QUERY_ENGINE_LIBRARY=<локальный кеш>
npm exec --workspace @picklehub/backend -- prisma validate` и `prisma generate` с теми же engine overrides —
  успешно, schema valid и Prisma Client сгенерирован. Явные engine paths нужны только из-за заблокированного DNS к
  `binaries.prisma.sh`; секреты и paths в репозиторий не добавлялись.
- `npm exec --workspace @picklehub/backend -- eslint test/integration/matches-migration.integration-spec.ts
--max-warnings=0`, backend strict `tsc`, unit Jest (13 suites/27 tests) — успешно.
- `npm run format:check`, `npm run docs:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` —
  успешно для восьми workspace. Web/TMA сохранили известное неблокирующее предупреждение о MapLibre chunk 924 kB.
- Первый полный `npm run verify` остановился на formatting нового mock script; после `prettier --write` повтор
  дошёл до `contracts:mock:check`, где один запуск не смог открыть `127.0.0.1` с `EPERM`. Немедленный отдельный
  `npm run contracts:mock:check` успешен; все оставшиеся команды полного verify затем успешны.
- `npm exec --workspace @picklehub/backend -- jest --config jest.integration.config.cjs --runInBand
test/integration/matches-migration.integration-spec.ts` — не выполнен по существу: все три теста остановились на
  `pool.connect()` (`localhost:5432` недоступен). Docker daemon запрещён sandbox (`permission denied` на socket),
  поэтому миграция не применена к чистому PostgreSQL/PostGIS и конкурентный runtime test в этой сессии не доказан.
- Приёмка не объявляется полностью выполненной до успешных `prisma migrate deploy` с нуля и указанного integration
  test в среде с PostgreSQL/PostGIS. Следующий промпт остаётся `llm/04-matches/02-contract-data.md`; переход к
  `03-backend` допустим только после закрытия этой проверки.
