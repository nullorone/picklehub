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

## 2026-09-10 — матчи, этап 03-backend

- Активный промпт: `llm/04-matches/03-backend.md`. Добавлен NestJS-модуль `matches` с тонкими REST-контроллерами
  для всех 23 опубликованных match operations, application service, DTO validation, стабильными match errors,
  внедряемыми часами и версионируемой конфигурацией сроков. Авторизация organizer/self/opposite-team и автоматы
  match/participant/request/waitlist/result находятся вне контроллера.
- Все мутации используют browser CSRF, session/onboarding guard, scoped rate limits, UUIDv4 idempotency key с
  зашифрованным 24-часовым ответом, expected aggregate version и `Serializable` transaction. Изменяющие состав
  сценарии блокируют `matches` через `FOR UPDATE`; существующие immediate/deferred constraints остаются последней
  защитой capacity, active involvement, FIFO и result alignment.
- Реализованы AUTO join и waitlist, APPROVAL request/decision и offer, self withdrawal/leave, organizer cancel и
  start. Promotion повторно проверяет уровень и команду, пропускает утратившего право кандидата и фиксирует
  promotion/offer вместе с освобождением места. Worker обрабатывает истёкшие offers через `FOR UPDATE SKIP LOCKED`;
  rollback сохраняет очередь целиком.
- Публичный поиск выполняет hard filters и `ST_DWithin` над canonical/candidate geography, исключает `UNLISTED` на
  SQL boundary и использует filter/snapshot-bound cursor. Рекомендации детерминированно считают policy-versioned
  score 0–100, две enum-причины и сортируют по score/start/match ID. Capability token хранится только как keyed
  hash, ротируется, возвращает одинаковый `INVITE_INVALID` и теперь редактируется из structured HTTP route logs.
- Proposal/supersede, confirm и dispute атомарно меняют match/result, пишут минимальный audit и contract-defined
  outbox event. Только confirmation создаёт immutable marker и переводит registered participants в `PLAYED`;
  dispute не создаёт completion event или статистический эффект. Новая migration добавляет inbox receipt и
  минимальную player match projection; отдельный BullMQ consumer обновляет её один раз по event ID и имеет bounded
  retry. Guest slots не входят в projection.
- Venue candidate port теперь разрешает создание только organizer существующего пустого `DRAFT`; публикация
  повторно проверяет published canonical venue либо candidate, принадлежащий этому матчу. Добавлены настраиваемые
  `MATCH_*` сроки, backend runbook, migration/schema, unit tests доменных правил, redaction и повторной доставки
  статистического события. Конкурентный integration test последнего места расширен до десяти повторов.

### Проверки этапа matches 03-backend

- `prisma validate` и `prisma generate` с локальными Prisma engine paths — успешно; schema valid, client 6.16.2
  сгенерирован. Локальные paths нужны из-за ранее зафиксированного ограничения сети и в репозиторий не добавлены.
- `npm run lint/typecheck/test/build --workspace @picklehub/backend` — успешно после финальных изменений: 16 unit
  suites/32 tests, strict TypeScript/ESLint без warnings, production compile успешен.
- Финальный `npm run verify` — успешно: workspace/lockfile, TypeSpec, Redocly, 59 REST/23 messages policy, 38
  contract/data tests, compatibility, generated drift/typecheck, Prism, formatting/docs и lint/typecheck/test/build
  всех восьми workspaces. Backend: 16 unit suites/32 tests. Web/TMA сохранили известное неблокирующее предупреждение
  о lazy MapLibre chunk 924 kB.
- `DATABASE_URL=... jest --config jest.integration.config.cjs --runInBand
test/integration/matches-migration.integration-spec.ts` запущен, но все 12 сценариев остановились до setup на
  `connect EPERM 127.0.0.1:5432`. Поэтому десять повторов конкурентного захвата последнего места и runtime
  проверки score migration в этой sandbox-сессии не считаются пройденными.
- До полной приёмки требуется применить migrations с нуля в PostgreSQL/PostGIS, запустить весь backend integration
  suite с Redis и повторяемый matches concurrency suite. `llm/04-matches/04-tma-web.md` не начинался.

## 2026-09-10 — матчи, этап 04-tma-web

- Активный промпт: `llm/04-matches/04-tma-web.md`. Реализован одинаковый полный матчевый сценарий в отдельных
  интерфейсах web/PWA и TMA: публичный поиск, объяснимые рекомендации, список/карта, публичные deep links и
  capability links, создание черновика, карточка матча, состав, заявки, FIFO-очередь, organizer/player actions,
  ввод и разрешение результата. Mobile, чат/доставка уведомлений и backend-контракты не изменялись.
- Поиск использует contract filters, rule-based score и две enum-причины. Карта повторно применяет те же фильтры
  с вычисленным центром/радиусом и открывает матч по marker площадки. Поскольку `MatchSummary` не содержит venue
  reference/point, клиент безопасно обогащает текущую страницу публичными `getMatch`/`getVenue`; это рабочий N+1
  компромисс до отдельного контрактного решения, а не молчаливое изменение OpenAPI.
- Создание поддерживает `SINGLES`/`DOUBLES`, UTC-конвертацию выбранного venue-local времени из IANA timezone,
  диапазон уровня с шагом 0,5, `AUTO`/`APPROVAL`, `PUBLIC`/`UNLISTED`, редактируемые guest slots, external booking
  state/note и описание. Новый публичный адрес создаётся только после private match draft, затем candidate
  атомарно привязывается versioned update; obvious private-residence input блокируется до запроса.
- `@picklehub/api-client` получил типизированные методы всех match routes. UI хранит один UUIDv4 mutation key на
  логическую команду: сетевой retry повторяет тот же key; после успеха или version conflict key удаляется.
  `MATCH_VERSION_CONFLICT`, `RESULT_VERSION_CONFLICT` и `WAITLIST_ORDER_CONFLICT` вызывают обязательный refetch и
  понятное сообщение вместо ложного успеха. Все mutations отключены offline.
- Organizer видит pending requests/FIFO и может approve/reject/promote, publish, start, cancel и propose/supersede
  результат; участник может join/leave/withdraw own waitlist entry. Result form валидирует game margin и полную
  `BEST_OF_1/3/5` серию, а `PROPOSED`/`DISPUTED` явно не показываются как окончательная статистика. Confirm/dispute
  доступны только активному зарегистрированному не-organizer участнику и требуют доступного confirm dialog с
  `aria-modal`, описанием, autofocus, Escape и возвратом фокуса.
- Raw `UNLISTED` invite показывается только в одноразовом in-memory delivery после publish/rotate; обе оболочки
  задают `Referrer-Policy: no-referrer`, token не попадает в analytics. Добавлен allowlisted `match_viewed` только с
  channel/entry/format/visibility. Отдельного notification-preferences route в текущем контракте нет, поэтому
  карточка честно показывает включённый in-app канал и не имитирует сохранение Telegram/email до этапа 05.
- Основные изменённые файлы: `frontend/{web,tg}/src/{app,matches-ui,matches-ui.test}.tsx`, обе platform CSS и
  `index.html`, `frontend/packages/{api-client,validation}/src/{index,index.test}.ts`,
  `frontend/packages/analytics/src/index.ts`, `test/e2e/matches.spec.ts` и этот журнал.

### Проверки этапа matches 04-tma-web

- Целевые `lint`, strict `typecheck`, Vitest и production `build` для `@picklehub/analytics`,
  `@picklehub/api-client`, `@picklehub/validation`, `@picklehub/web` и `@picklehub/tg` — успешно. Web: 4 suites/13
  tests; TMA: 3/11; API client: 1/4; validation: 1/6. Новые parity tests доказывают explanation, provisional result,
  refetch stale roster и повтор одного idempotency key после network failure в обоих клиентах.
- `npm run verify` — успешно полностью: 8 workspaces/один lockfile, TypeSpec/Redocly, 59 REST operations/23
  messages и 38 contract/data policy tests, compatibility/generated drift/typecheck, Prism mock, formatting/docs,
  lint/typecheck/test/build всех workspaces. Backend unit regression: 16 suites/32 tests; web 4/13; TMA 3/11.
- `npm run test:e2e:typecheck` и production e2e builds web/TMA — успешно. `npm run test:e2e` и отдельный
  `npx playwright test test/e2e/matches.spec.ts --workers=1` не выполнили browser assertions: локальный Google
  Chrome завершался `SIGABRT` при `browserType.launch` за 1–2 ms во всех новых и прежних identity/venue tests.
  Это sandbox/browser-launch блокировка, а не результат тестового кода; три match browser smoke обязательны в CI.
- `npm run format:check`, `npm ls --depth=0` и `git diff --check` — успешно; unmet/extraneous dependencies и
  whitespace errors отсутствуют. Vite оставил известное предупреждение о lazy MapLibre chunk 924 kB; основной TMA
  bundle также пересёк 500 kB, поэтому дальнейшее route-level splitting остаётся performance debt.
- Приёмочные правила идемпотентности, refetch конфликта и parity покрыты зелёными component/client tests; live
  browser smoke не заявляется. Следующий промпт — `llm/04-matches/05-verification.md`.

## 2026-09-10 — матчи, этап 05-verification

- Активный промпт: `llm/04-matches/05-verification.md`. Создана матрица прослеживаемости
  `llm/_docs/matches-verification.md`, которая связывает каждый критический риск с unit, contract, PostgreSQL,
  component и Playwright-подтверждением и явно отделяет написанный тест от фактически зелёного запуска.
- Конечный автомат вынесен в чистую таблицу `allowsMatchTransition` и используется сервисом для cancel, start,
  proposal и resolution. Unit coverage расширено разрешёнными/запрещёнными переходами, scored/no-score сериями,
  лишними партиями, неизвестной дистанцией и гибким временем. Validation проверяет UTC-конвертацию Москвы,
  Красноярска и Берлина, включая несуществующее местное время при DST-переходе.
- Новый `matches.integration-spec.ts` выполняет реальные `Serializable`-транзакции Prisma: конкурентный AUTO join,
  конкурентные APPROVAL decisions, FIFO promotion после leave, start/cancel, proposal и confirm/dispute. Сквозной
  сценарий подтверждения проверяет единственные marker/outbox/receipt, повторную обработку event ID, по одному
  статистическому вкладу зарегистрированных игроков и отсутствие статистики у guest slot. Отдельно проверяются
  encrypted idempotency replay и отсутствие `UNLISTED` в detail/discovery без capability.
- Stateful Playwright-сценарий добавлен для web и TMA: две сессии проходят создание черновика с внешней бронью,
  публикацию, discovery, вступление с заполнением состава, start, предложение счёта и подтверждение соперником.
  Существующие public/unlisted smoke сохранены. Component parity дополнено offline-disabled join, guest/external
  booking rendering и пустым каталогом площадок; для последнего обе платформы теперь показывают честный fallback
  создания нового публичного адреса.

### Проверки этапа matches 05-verification

- Целевые backend/web/TMA/validation typecheck и tests — успешно. Backend: 16 suites/42 tests за 4,478 с; web:
  4 файла/15 tests за 1,48 с; TMA: 3/13 за 1,16 с; validation: 1/6 за 184 мс. Отдельные backend/web/TMA lint и
  `npm run test:e2e:typecheck` успешны.
- Финальный `npm run verify` — успешно полностью: workspace и lockfile, TypeSpec/Redocly, 59 REST operations/23
  messages, 38 contract/data policy tests, compatibility/generated drift/typecheck, Prism mock, format/docs,
  lint/typecheck/test/build всех восьми workspaces. В полном прогоне backend 16/42, web 4/15, TMA 3/13.
- `npm run test:e2e:build` — успешно: production web 217 мс, TMA 171 мс. Сохранены известные неблокирующие
  предупреждения о MapLibre chunk 924 кБ и основном TMA bundle 514 кБ.
- PostgreSQL-команда для двух match suites завершилась за 4,191 с до assertions: sandbox запретил подключения к
  `127.0.0.1:5432` и `127.0.0.1:6379`. `docker info` также получил `permission denied` на Docker socket. Поэтому
  concurrency, capacity и сквозной metric/statistics test с реальной БД в этой сессии не считаются пройденными.
- `npx playwright test test/e2e/matches.spec.ts --workers=1` обнаружил 5 тестов, но все пять остановились при
  `browserType.launch`: локальный Chrome завершился `SIGABRT` за 1 мс. Оба новых полных browser journey ожидают CI.
- `npm run format:check`, `npm run docs:check`, `git diff --check` успешны. Критерий этапа не объявляется полностью
  выполненным до зелёных PostgreSQL/PostGIS/Redis и Playwright запусков, перечисленных в матрице; к следующему
  промпту не переходили.

## 2026-09-10 — чат и уведомления, этап 01-requirements

- Активный промпт: `llm/05-chat-notifications/01-requirements.md`. Изменения ограничены требованиями, доменной
  моделью, архитектурой, безопасностью и аналитикой; TypeSpec/AsyncAPI, Prisma, backend и UI коммуникации не
  создавались.
- Зафиксированы 10 пользовательских историй и 15 сценариев «Дано/Когда/Тогда»: snapshot/reconnect, send,
  15-минутные edit/delete с append-only revision/tombstone, системные события, unread/read position, жалоба,
  блокировка, preferences и безопасный deep link. Чат доступен только зарегистрированному активному составу;
  pending/queue/guest/capability link его не открывают. После выхода доступ ограничен прежней sequence и 30 днями,
  после отмены чат read-only, после завершения запись закрывается через 7 суток.
- PostgreSQL sequence определяет полный порядок, REST snapshot/backward page/forward catch-up остаются источником
  истины, WebSocket использует at-least-once delivery, event deduplication и явный `RESYNC_REQUIRED` при gap,
  истёкшем cursor или retention. Read marker монотонен, provider/push receipt не означает чтения.
- Матрица охватывает вступление, заявку/решение, promotion, выход, отмену, изменение, два напоминания, результат,
  спор и чат для in-app/Telegram/email. In-app обязателен; все внешние категории по умолчанию выключены. Тихие часы
  22:00–08:00 считаются в IANA timezone пользователя, обычные события откладываются, ограниченный critical allowlist
  может обходить тишину. Locale BCP 47 и timezone применяются при каждой попытке.
- Logical notification и channel delivery имеют отдельную дедупликацию; bounded retry/failover может дать дубль и
  не откатывает доменную операцию. `ACCEPTED`/`DELIVERED` описывают только transport, не human read. Exactly-once и
  гарантии Telegram/email не обещаются. Резервный провайдер выключен до отдельной terms/privacy/residency/tracking/
  retention/idempotency review и не может автоматически подменить один пользовательский канал другим.
- Текст сообщения/revision/evidence исключён из логов, traces, analytics, audit, generic outbox, BullMQ, provider
  preview и dead-letter data; notification несёт только закрытый type, opaque references и безопасный route.
  Определены минимизация provider boundary, rate limits, закрытые категории/причины жалобы, consented analytics,
  operational metrics и предлагаемый legal-review retention: чат 180 суток после terminal матча, inbox 90 суток,
  delivery metadata 30 суток, queued payload максимум 7 суток, evidence один год после решения.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/architecture.md`, `llm/_docs/security-privacy.md`, `llm/_docs/analytics-plan.md` и этот журнал.

### Проверки этапа chat/notifications 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/domain-model.md llm/_docs/architecture.md
llm/_docs/security-privacy.md llm/_docs/analytics-plan.md` — успешно; изменённые документы отформатированы.
- `npm run docs:check`, `npm run format:check` и `git diff --check` — успешно до записи журнала: Markdown 117
  файлов без ошибок, Prettier и четыре TypeSpec source без drift, whitespace errors отсутствуют.
- `npm run verify` прошёл workspace audit, TypeSpec/Redocly, policy для 59 REST operations/23 messages, 38
  contract/data tests, compatibility с `HEAD`, generated drift и contract typecheck; затем остановился на
  `contracts:mock:check`, потому что sandbox запретил Prism открыть `127.0.0.1` с `listen EPERM`. Полный `verify` и
  mock поэтому не заявляются успешными; контрактный source этим этапом не менялся.
- Оставшаяся цепочка `npm run format:check && npm run docs:check && npm run lint && npm run typecheck && npm test &&
npm run build && npm ls --depth=0 && git diff --check` — успешно. Turbo: lint/typecheck/build для восьми
  workspace, tests 13 задач; backend 16 suites/42 tests, web 4/15, TMA 3/13. Dependency tree без unmet/extraneous.
  Web/TMA сохранили известное неблокирующее предупреждение о lazy MapLibre chunk 924 kB.
- После записи журнала первый `npm run format:check` ожидаемо указал на новый неформатированный блок; выполнен
  `npx prettier --write llm/_docs/ai-development-log.md`, затем `npm run format:check && npm run docs:check && git
diff --check` — успешно, 117 Markdown-файлов без ошибок.
- Проверки контракта, БД, realtime, provider delivery и privacy canary для новой функции не создавались и не
  исполнялись: они принадлежат следующим этапам. Legal approval сроков, РФ-размещения и Telegram/email providers
  не заявляется.
- Содержательные критерии этапа выполнены. Следующий промпт —
  `llm/05-chat-notifications/02-contract-data.md`; к нему не переходили.

## 2026-09-10 — чат и уведомления, этап 02-contract-data

- Активный промпт: `llm/05-chat-notifications/02-contract-data.md`. Backend use cases/controllers, WebSocket
  gateway, consumers/providers и UI коммуникации не создавались; они принадлежат следующим этапам.
- TypeSpec добавляет 15 bearer-protected REST operations: авторизованный snapshot, history/catch-up cursor, REST
  fallback send, edit/delete tombstone, foreground read marker, revision-bound report, block/unblock, notification
  inbox/read, versioned preferences и bind/unbind opaque web/TMA installation. Все ответы `no-store`; мутации
  требуют Origin, CSRF и UUIDv4 `Idempotency-Key`. Pending/queue/guest/invite capability не дают chat access.
- OpenAPI содержит `Conversation`, `Message`, `Notification`, `NotificationDelivery`, `NotificationPreference`,
  закрытые lifecycle/category/channel/error enum и лимит 2 000 символов. Generated OpenAPI/AsyncAPI TypeScript и
  копия типов `@picklehub/api-client` обновлены только генератором.
- AsyncAPI сохраняет ticket-auth control и добавляет клиентские match chat/notification streams на `/v1/ws`, 11
  client protocol messages, два privacy-minimized internal events на `communication.events.v1` и один BullMQ job
  `notification.delivery.requested.v1` на `notification-delivery-v1`. Client events доставляются at least once;
  PostgreSQL sequence/cursor закрывают gap, а `RESYNC_REQUIRED` требует REST snapshot. Внутренний chat event не
  несёт body, fan-out не несёт recipient/route, job содержит только `deliveryId`.
- Prisma schema и миграция добавляют conversations/membership access intervals, message/revision/tombstone/report,
  blocks, preferences/channel matrix, notifications/deliveries/devices, consumer receipts и encrypted idempotency
  replay. Trigger атомарно назначает sequence; revisions append-only, last-read монотонен, revoked 30-day boundary
  неизменяема. Уникальности system source event, logical notification и channel delivery защищают replay;
  `IN_APP` нельзя отключить, delivery rows разрешены только для Telegram/email, attempts bounded.
- Contract policy расширена allowlist, authorization/no-store/CSRF/cursor/minimal-job guards и negative tests для
  anonymous inbox и canary chat text в delivery job. Добавлены static data-policy tests и четыре PostgreSQL
  integration tests для конкурентной sequence allocation, read monotonicity, immutable revisions и независимой
  дедупликации notification/delivery. Документация contracts и physical domain model синхронизирована.

### Проверки этапа chat/notifications 02-contract-data

- `npm run verify` — успешно полностью: workspace audit (8 workspaces/один lockfile), TypeSpec compile, Redocly,
  AsyncAPI parser/policy для 74 REST operations и 37 messages, 47 contract/data tests, compatibility с `HEAD`,
  generated drift/typecheck и Prism mock с communication inbox; formatting/docs, lint/typecheck/unit tests/build
  всех восьми workspaces также успешны. Backend unit: 16 suites/42 tests; web: 4/15; TMA: 3/13. Известное
  неблокирующее предупреждение Vite о lazy MapLibre chunk 924 kB сохранилось.
- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npm run prisma:generate
--workspace @picklehub/backend` и аналогичный `prisma:validate` с synthetic `DATABASE_URL` — успешно; Prisma
  Client 6.16.2 сгенерирован, schema валидна.
- `npm ls --depth=0` и `git diff --check` — успешно; unmet/extraneous dependencies и whitespace errors отсутствуют.
- `DATABASE_URL=... REDIS_URL=... npm run test:integration --workspace @picklehub/backend -- --runInBand` — не
  выполнен в runtime: sandbox запретил соединения с `127.0.0.1:5432` и `:6379` (`EPERM`) ещё в существующем venues
  suite. `docker ps` также запрещён доступом к Docker socket. Поэтому новая migration SQL и четыре integration
  tests должны быть применены/исполнены в CI на чистой PostgreSQL/Redis среде; успешный database runtime не
  заявляется. Static migration policy и Prisma schema validation успешны, но не заменяют этот прогон.
- Внешняя настройка `NODE_TLS_REJECT_UNAUTHORIZED=0` остаётся только свойством окружения и вызвала предупреждение
  Redocly; она не добавлена в репозиторий. Production Telegram/email/failover provider, residency и legal retention
  approval этим этапом не заявляются.
- Контрактные и кодовые критерии выполнены; runtime-критерий применения миграции остаётся environment-blocked.
  Следующий промпт `llm/05-chat-notifications/03-backend.md` не начинался.

## 2026-09-10 — чат и уведомления, этап 03-backend

- Активный промпт: `llm/05-chat-notifications/03-backend.md`. Реализован NestJS-модуль communications с 15
  контрактными REST operations, `no-store`, bearer/Origin/CSRF-проверками, Redis rate limit и зашифрованным
  24-часовым idempotency replay. Нормализованный plain text сохраняется до fan-out; edit/delete добавляют
  append-only revision/tombstone и проверяют автора, ожидаемую revision, 15-минутное окно и состояние чата.
- Snapshot, backward history и forward catch-up используют подписанный 15-минутный cursor, привязанный к user,
  conversation, направлению и неизменяемой former-member boundary. Unread исключает собственные и заблокированные
  пользовательские сообщения; read position продвигается только вперёд. Report фиксирует одну revision-bound
  encrypted evidence запись без свободного текста, а communication replay/evidence используют отдельный ключ.
- Добавлен WebSocket gateway `/v1/ws` на `ws`: Origin и одноразовое Redis-погашение ticket до подписки,
  авторизация subscription/command и повторная авторизация каждого Redis fan-out, cursor catch-up с bounded gap,
  структурированные contract-compatible errors, UUIDv4 idempotency для create/update/delete и graceful close.
  Wire parser маршрутизирует исходные AsyncAPI envelopes по `type`; session credential/ticket не помещается в URL.
- Outbox dispatcher публикует минимальные match/chat references в отдельную BullMQ communication queue.
  Идемпотентный PostgreSQL consumer создаёт чат при публикации, синхронизирует access intervals после системного
  roster event, формирует закрытые system types, persistent in-app items и внешние delivery rows. Receipt,
  system message, membership boundary, notification и delivery коммитятся одной транзакцией; replay подавляется
  storage uniqueness, а текст чата не попадает в generic outbox, BullMQ data, логи или provider preview.
- Durable delivery dispatcher оставляет `PENDING`/`DEFERRED` в PostgreSQL при сбое Redis. BullMQ worker повторно
  проверяет preference и linked identity на каждой попытке, применяет bounded exponential retry с jitter,
  provider rate limit, safe error codes и terminal suppression/failure observability. Telegram/email adapters
  получают contact только расшифрованным в памяти, используют allowlisted locale template, стабильный idempotency
  key и отключённый email tracking; provider IDs хранятся только как HMAC. Оба внешних канала выключены по
  умолчанию, резервный provider не добавлялся.
- Тихие часы вычисляются в сохранённой IANA timezone сканированием фактической UTC timeline до первого локального
  выхода из окна, включая DST overlap/gap; отмена и спор обходят окно. Maintenance worker переводит истёкшее
  7-дневное окно записи в `READ_ONLY`, очищает истёкшие inbox/delivery/idempotency/conversation записи и корректно
  ждёт активную работу при shutdown. Добавлены privacy-safe operational counters без user/match labels.
- Добавлена backend-миграция backfill для уже опубликованных/terminal матчей и membership intervals, не меняющая
  контрактную схему. Добавлены зависимости Nest WebSocket/ws, configuration gates и `.env.example` без секретов.
  Основные файлы: `backend/src/communications/*`, `backend/src/bootstrap.ts`, app/worker/outbox wiring,
  `backend/prisma/migrations/20260911130000_chat_notifications_backend/migration.sql`, package manifests и тесты.

### Проверки этапа chat/notifications 03-backend

- `npm run verify` — успешно полностью: workspace audit, TypeSpec/Redocly, policy для 74 REST operations/37
  messages, 47 contract/data tests, compatibility/generated drift/typecheck, Prism mock, formatting/docs,
  lint/typecheck/unit tests/build восьми workspaces. После последних backend-only уточнений отдельно успешно прошли
  `npm run lint --workspace @picklehub/backend`, `npm run typecheck --workspace @picklehub/backend`,
  `npm test --workspace @picklehub/backend -- --runInBand` (19 suites, 45 tests) и
  `npm run build --workspace @picklehub/backend`.
- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true DATABASE_URL=... npm run
prisma:validate --workspace @picklehub/backend` — успешно, Prisma schema валидна. Обычный `prisma:generate`
  сначала не смог скачать checksum engine из-за `getaddrinfo ENOTFOUND`; повтор с уже используемыми в репозитории
  локальными synthetic engine paths успешно сгенерировал Prisma Client 6.16.2.
- `npm ls --depth=0` и `git diff --check` — успешно; unmet/extraneous dependencies и whitespace errors отсутствуют.
- `npm run test:integration --workspace @picklehub/backend -- --runInBand` запущен, но runtime запрещает соединения
  с локальными PostgreSQL/Redis (`connect EPERM 127.0.0.1:5432` и `:6379`) и открытие HTTP listener (`listen
EPERM`). Поэтому все существующие database suites остановились на инфраструктуре. Новый
  `communications-backend.integration-spec.ts` действительно использует AppModule, настоящие Prisma/PostgreSQL и
  Redis и проверяет event receipt replay, system sequence, logical notification deduplication и запрет бывшему
  участнику читать новые сообщения, но его зелёный runtime-прогон и применение новой backfill migration должны
  быть выполнены в CI/локальном окружении с разрешёнными сервисами; успех не заявляется.
- Unit privacy checks подтверждают отдельное randomized authenticated encryption, подпись/TTL cursor и отсутствие
  chat preview/canary в email provider payload при выключенном tracking. Реальные Telegram/email/failover
  providers, их terms/residency и legal retention approval этим этапом не заявляются.
- Кодовые и статические критерии этапа выполнены; runtime integration criterion остаётся environment-blocked.
  Следующий промпт `llm/05-chat-notifications/04-tma-web.md` не начинался.

## 2026-09-10 — чат и уведомления, этап 04-tma-web

- Активный промпт: `llm/05-chat-notifications/04-tma-web.md`. В отдельных web/PWA и TMA source-файлах добавлены
  чат матча, центр уведомлений, навигация и индикатор непрочитанных. Контракты, backend и generated-файлы не
  менялись; файловые вложения, изображения, голос, typing и reactions в интерфейс не добавлялись.
- Чат открывается только из карточки состава и начинает с авторизованного REST snapshot. История догружается
  opaque cursor-страницами, а PostgreSQL `sequence` остаётся единственным порядком. Merge по message ID и revision
  подавляет повторы. WebSocket получает новый in-memory ticket через session refresh, аутентифицируется payload-ом,
  подписывается с последним catch-up cursor и переподключается с bounded exponential backoff. Live event запускает
  REST catch-up; cursor/resync error переоткрывает snapshot, поэтому socket не становится источником истины.
- Отправка немедленно создаёт локальную запись с client ID и отдельным UUIDv4 idempotency key. Сетевой сбой явно
  показывает «Не отправлено», повтор использует тот же key, а offline-кнопка отключена. Offline draft хранится
  только в `sessionStorage`, не показывается доставленным и не попадает в console/analytics. Edit/delete проверяют
  server revision; user/system, edited, tombstone, blocked и locally reported состояния различаются. Доступны
  закрытые причины жалобы и block/unblock; после unblock выполняется новый snapshot.
- В chat live region объявляются только добавления/изменения сообщений, а состояния reconnect не являются live
  announcements. Время показывается в IANA timezone клиента с краткой зоной. `READ_ONLY` убирает composer.
  `SESSION_INVALID` очищает клиентскую сессию и возвращает к безопасному входу; chat text, credentials, IDs и routes
  не добавлены в analytics. Добавлены только allowlisted `chat_opened`, `chat_resync_required` и
  `notification_opened`; внешняя notification route дополнительно ограничена локальным absolute path.
- Центр уведомлений показывает persistent inbox, unread item state, cursor pagination и foreground read. Header
  badge обновляется после read и периодически без объявления transport receipt чтением. Настройки охватывают все
  шесть категорий и `IN_APP`/`TELEGRAM`/`EMAIL`, locale, IANA timezone и quiet hours. `IN_APP` нельзя выключить;
  внешние каналы заблокированы с подсказкой до привязки соответствующей identity, есть предупреждения о
  негарантированной доставке и critical bypass тихих часов. Version conflict вызывает refetch.
- `@picklehub/api-client` получил типизированные методы 13 communication REST routes, защищённые mutation headers,
  явные idempotency keys и in-memory realtime ticket/URL. Добавлены unit/parity tests web и TMA для sequence/revision
  merge, system/blocked/edited state, offline draft, optimistic failure/retry одного key, mandatory in-app channel,
  identity hints и отклонения внешней notification route.

### Проверки этапа chat/notifications 04-tma-web

- Целевые `lint`, strict `typecheck`, Vitest и production `build` для `@picklehub/analytics`,
  `@picklehub/api-client`, `@picklehub/web` и `@picklehub/tg` — успешно. Финальные client tests: API client 1 suite/5
  tests, web 5/19, TMA 4/14. Web PWA manifest/service worker и production TMA no-mock check успешны.
- `npm run test:e2e:typecheck` — успешно. Browser e2e для нового экрана не добавлялся и не запускался; realtime
  transport проверен unit-level state tests, а полный WebSocket/PostgreSQL/Redis runtime остаётся частью следующей
  verification matrix и CI с разрешёнными локальными сервисами.
- Первый `npm run verify` успешно прошёл workspace audit, TypeSpec/Redocly, policy (74 REST operations/37 messages),
  47 contract/data tests, compatibility и generated drift/typecheck, затем остановился на sandbox `listen EPERM
127.0.0.1` в Prism. Немедленный отдельный `npm run contracts:mock:check` один раз прошёл; два более поздних
  повтора снова получили тот же `EPERM`, поэтому единый полный verify не заявляется зелёным.
- После первого сбоя отдельно успешно прошли `format:check`, `docs:check`, root `lint`, `typecheck`, `test`, `build`,
  `npm ls --depth=0` и `git diff --check`: восемь workspaces зелёные, backend regression 19 suites/45 tests. После
  финальных badge/safe-route изменений повторно успешны web/TMA lint, typecheck, 5/19 и 4/14 tests, production
  builds и `git diff --check`.
- Сохранилось известное предупреждение о MapLibre chunk 924 kB; основной TMA bundle теперь около 533 kB и остаётся
  кандидатом на route-level splitting. Реальные Telegram/email/failover provider guarantees и legal/residency
  approval не заявляются. Содержательные критерии клиентского этапа выполнены; следующий промпт —
  `llm/05-chat-notifications/05-verification.md`, к нему не переходили.

## 2026-09-10 — чат и уведомления, этап 05-verification

- Активный промпт: `llm/05-chat-notifications/05-verification.md`. Создана матрица прослеживаемости
  `llm/_docs/communications-verification.md`, которая отделяет автоматизированный тест от фактического runtime
  подтверждения и явно фиксирует at-least-once, отсутствие exactly-once и негарантированную Telegram/email
  доставку.
- Gateway unit suite проверяет Origin, обязательную аутентификацию, одноразовый ticket, серверную авторизацию
  подписки, cursor catch-up в sequence order и `GAP_LIMIT`/REST resync. Новый PostgreSQL integration suite проверяет
  атомарность message/outbox, rollback, replay одного client idempotency key, 54 последовательности с параллельной
  отправкой, backward/forward pagination без повторов, блокировку, revision-bound encrypted report и запрет записи
  после выхода.
- Recovery tests покрывают сохранение `PENDING` при сбое Redis, восстановление публикации, provider timeout,
  bounded attempts до наблюдаемого `FAILED`, повтор BullMQ job после terminal state и безопасный ручной retry.
  Добавлены `retryFailed` и операторская команда `notifications:retry-delivery`, которая сохраняет исходный provider
  idempotency key, не меняет истёкшие/принятые записи и не печатает идентификатор или recipient.
- Privacy runtime policy проверяет минимальный chat outbox и delivery job, отсутствие chat text/credential полей в
  provider boundary, console и analytics и canary в production source. Integration canary подтверждает, что raw
  text не копируется в generic outbox, а evidence хранится зашифрованно.
- Два production-build Playwright-сценария добавлены для web и TMA: чат и системное событие, REST fallback send,
  live-region, inbox, включение email-категории, сохранение preferences и локальный offline draft без ложной
  доставки. Обнаруженный инфраструктурным отказом shutdown-дефект Redis исправлен: `QUIT` отправляется только
  готовому соединению, незавершённый stream закрывается без новой команды.

### Проверки этапа chat/notifications 05-verification

- Финальный `npm run verify` — успешно полностью: workspace/lockfile, TypeSpec/Redocly, policy для 74 REST
  operations/37 messages, 50 contract/data/runtime tests, compatibility/generated drift/typecheck, Prism mock,
  format/docs, lint/typecheck/test/build всех восьми workspaces. Backend: 21 suite/53 tests за 6,15 с; web: 5/19;
  TMA: 4/14. Production PWA/TMA guards успешны.
- Отдельные backend lint/typecheck, 21/53 unit tests и build успешны. Web 5/19 и TMA 4/14 component tests успешны.
  `npm run test:e2e:typecheck` и `npm run test:e2e:build` успешны; production web/TMA собраны. Сохранены известные
  предупреждения о MapLibre chunk 924 кБ и основном TMA bundle 533 кБ.
- Три целевых communication integration suites завершились за 3,62 с до assertions: sandbox запретил подключения
  к локальным PostgreSQL и Redis. Исходный прогон дополнительно показал ошибку `QUIT` во время незавершённого Redis
  подключения; shutdown исправлен и unit/build regression зелёный, но PostgreSQL/Redis recovery assertions должны
  быть выполнены в CI job `integration` после `prisma migrate deploy`.
- `npx playwright test test/e2e/communications.spec.ts --workers=1` обнаружил два теста, но оба Chrome process
  завершились `SIGABRT` при launch за 1 мс; sandbox запретил kill с `EPERM`. Browser assertions ожидают CI job
  `browser`; их успех не заявляется.
- `npm run format:check`, `npm run docs:check` и `git diff --check` успешны до финальной записи журнала; после неё
  обязательны повторное форматирование и итоговая проверка. Реальные Telegram/email/failover providers, их terms,
  residency и legal retention approval не проверялись и не заявляются.
- Кодовые, статические и локально исполнимые критерии выполнены. Полная приёмка отсутствия потерь остаётся
  environment-blocked до зелёных PostgreSQL/Redis и Playwright прогонов; к
  `llm/06-player-profile-stats/01-requirements.md` не переходили.

## 2026-09-11 — профиль и статистика, этап 01-requirements

- Активный промпт: `llm/06-player-profile-stats/01-requirements.md`. В продуктовых требованиях описаны просмотр и
  optimistic-versioned изменение собственного профиля, `PUBLIC` / `PRIVATE`, минимальная проекция состава,
  двустороннее поведение direct-доступа при блокировке, собственная и публичная история матчей, безопасная
  несинхронизируемая ссылка DUPR и доступные неунижающие empty/loading/error/stale состояния.
- Каноническая статистика: единственный источник — текущий допустимый вклад `(matchId, playerId)` для
  зарегистрированного `PLAYED`-участника согласованных `COMPLETED` / `CONFIRMED` матча и результата с уникальным
  marker. Подтверждённый факт без счёта увеличивает только played; wins/losses, win rate с denominator
  `wins + losses`, партии и командные points появляются только у scored outcome. Все totals разделены на
  `SINGLES` / `DOUBLES`, а `ALL` является их суммой; гость статистику не получает.
- Исключения и исправления: отсутствующий/proposed, superseded/отозванный, disputed, voided и cancelled outcome
  вклада не дают. Текущий lifecycle не разрешает пользователю отзывать immutable confirmation; возможный будущий
  post-confirmation review явно оставлен за trust/safety. Для безопасных коррекций определены eligibility revision,
  idempotent upsert/retract contribution, reconciliation и shadow-generation rebuild со snapshot/catch-up,
  checksum и атомарным переключением.
- Надёжность и неявки: organizer reliability учитывает подтверждённые игры и только late cancellation/окончательно
  подтверждённую ответственность; no-show — только финальное moderation решение, с дедупликацией по матчу. Оба
  публичных процента скрыты до пяти commitments; reports, reporter и evidence не раскрываются. До реализации
  trust/safety UI честно сообщает, что посещаемость ещё не учитывается.
- Аналитика и безопасность: добавлена consented таксономия profile/history/statistics/DUPR без subject graph,
  полей профиля, score или персональных totals; operational telemetry ограничена lag/rebuild/invariant counters.
  Зафиксированы cache invalidation, enumeration-safe ответы, запрет DUPR fetch/scraping/referrer/tracking,
  ограничение публичной истории, proposed retention и РФ/legal gates.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/analytics-plan.md`, `llm/_docs/security-privacy.md`, `llm/_docs/ai-development-log.md`.
- Проверки:
    - Prettier `--write` для четырёх изменённых требований и журнала — успешно;
    - `npm run format:check` — успешно, Prettier и TypeSpec format check прошли;
    - `npm run docs:check` — успешно, 118 Markdown-файлов, 0 ошибок;
    - read-only Node-проверка относительных Markdown-ссылок через `rg --files -g '*.md'` — успешно, проверено
      123 файла, отсутствующих целей нет;
    - `git diff --check` — успешно.
- Не выполнялись `contracts:check`, `lint`, `typecheck`, `test`, integration/e2e и `build`: документационный этап
  не меняет TypeSpec/AsyncAPI, generated artifacts или исполняемый код, поэтому эти команды не проверяют его
  критерии. Известные environment-blocked PostgreSQL/Redis и Playwright проверки предыдущих этапов не выдаются за
  выполненные.
- Критерии этапа выполнены на уровне требований: самооценка в каждой проекции явно названа неподтверждённой, DUPR
  не обозначается синхронизированным/verified, а статистический вклад возникает только из подходящего
  подтверждённого source outcome. Следующий промпт — `llm/06-player-profile-stats/02-contract-data.md`; к нему не
  переходили.

## 2026-09-11 — профиль и статистика, этап 02-contract-data

- Активный промпт: `llm/06-player-profile-stats/02-contract-data.md`. Backend controllers/use cases, projection
  consumer/rebuild worker и клиентские экраны не создавались: они принадлежат следующим этапам.
- TypeSpec добавляет 13 profile operations: owner profile/update, отдельную privacy setting, локальную policy-check
  и удаление DUPR, bounded avatar upload/remove, owner/public cursor history и owner/public statistics. Owner
  mutations требуют bearer, Origin, CSRF, UUIDv4 idempotency и `expectedVersion`; public reads допускают anonymous
  либо bearer для симметричной block-политики. Закрытый, blocked, absent и deleting subject дают один
  `PROFILE_NOT_AVAILABLE`. Все ответы `no-store`.
- Self-only `PlayerProfile` отделён от минимального `PublicPlayerProfile`. Публичная схема не имеет timezone,
  version, consent, credential, block/report данных; self-assessment явно не verified. Публичные attendance и
  reliability до пяти commitments не раскрывают процент или sample size. DUPR помечен
  `EXTERNAL_NOT_VERIFIED_OR_SYNCED`: PUT только проверяет синтаксис/утверждённую allowlist, не делает fetch,
  ownership check или rating import.
- Avatar contract выдаёт пятиминутный single-object PUT для server-generated private key
  `profiles/{userId}/avatars/{assetId}/original`, фиксирует JPEG/PNG/WebP, максимум 5 MiB и SHA-256. Signed URL не
  хранится; asset не публичен до decode/re-encode, metadata/malware policy check и активации.
- Prisma и SQL migration отделяют mutable profile/external link/avatar от generation-scoped statistic и
  reliability contributions/aggregates. `(generation, match, player)` и monotonic eligibility revision защищают
  replay/out-of-order; `ALL = SINGLES + DOUBLES`, `wins + losses <= played`, один organizer outcome на match и
  no-show dedup защищены constraints/indexes. Shadow generation проверяет count и SHA-256, после чего один partial
  unique `ACTIVE` атомарно заменяет прежний; failed/неполное поколение API не видит. Завершённые onboarding drafts
  backfill-ятся без переноса plaintext DUPR.
- AsyncAPI добавляет четыре privacy-minimized события `profile.*.v1`: изменение профиля, новая source revision,
  запрос и завершение rebuild. В них нет имени, locality, level, DUPR/avatar, score/points/totals,
  block/report/evidence; consumer дочитывает authoritative source по opaque reference. Generated OpenAPI,
  AsyncAPI TypeScript и копия API client обновлены только генератором.
- Policy/negative tests фиксируют allowlist операций, optional-auth public reads, mutation headers, public DTO,
  cursor history, DUPR/аватар и запрет персональных полей событий. Static migration tests проверяют 10 таблиц,
  revision/receipt dedup, generation checksum/activation, aggregate invariants и отсутствие plaintext URL/signed
  URL. Добавлены три PostgreSQL integration scenario для checksum activation, stale/conflicting revision и
  deferred `ALL` invariant.

### Проверки этапа profile/statistics 02-contract-data

- `npm run verify` — успешно полностью: workspace/lockfile, TypeSpec/Redocly, policy для 87 REST operations и 41
  messages, 58 contract/data/privacy tests, compatibility с `HEAD`, generated drift/typecheck, Prism mock с
  profile statistics, format/docs, lint/typecheck/unit tests/build всех восьми workspaces. Backend: 21 suite/53
  tests; web: 5/19; TMA: 4/14. Сохранились известные неблокирующие Vite warnings о web MapLibre chunk 924 kB и
  основном TMA bundle 533 kB.
- После финальной записи журнала повторный `npm run verify` один раз остановился на `contracts:mock:check` из-за
  transient `listen EPERM 127.0.0.1`; немедленный отдельный `npm run contracts:mock:check` успешно проверил все
  шесть групп examples, включая profile. Оставшаяся цепочка `format:check`, `docs:check`, `lint`, `typecheck`,
  `test`, `build`, `npm ls --depth=0` и `git diff --check` после этого также успешна.
- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npx prisma generate
--schema backend/prisma/schema.prisma` и `prisma:validate` с synthetic `DATABASE_URL` — успешно; Prisma Client
  6.16.2 сгенерирован и schema валидна. Первый `prisma format` без local engine override попытался получить
  checksum из сети и получил `ENOTFOUND`; повтор с локальными engine paths успешен и не менял зависимости.
- `npm ls --depth=0` и `git diff --check` — успешно; unmet/extraneous dependencies и whitespace errors отсутствуют.
- Целевой `profiles-migration.integration-spec.ts` обнаружил три теста, но каждый остановился до assertion на
  `connect EPERM 127.0.0.1:5432`; `docker ps` также запрещён доступом к Docker socket. Поэтому применение новой SQL
  migration и runtime assertions checksum/revision/deferred constraint должны пройти в CI PostgreSQL job; их
  успех не заявляется. Static data policy и Prisma validation успешны, но не заменяют runtime.
- Внешняя настройка `NODE_TLS_REJECT_UNAUTHORIZED=0` остаётся свойством окружения и вызвала предупреждение Redocly;
  она не добавлена в репозиторий. DUPR allowlist/provider approval, object storage, scanning/residency и legal
  retention approval этим этапом не заявляются.
- Контрактные, generated, статические data и общие кодовые критерии выполнены. Runtime-критерий миграции остаётся
  environment-blocked до PostgreSQL-прогона. Следующий промпт `llm/06-player-profile-stats/03-backend.md` не
  начинался.

## 2026-09-11 — профиль и статистика, этап 03-backend

- Активный промпт: `llm/06-player-profile-stats/03-backend.md`. Добавлен NestJS-модуль `profiles` с 13 ранее
  опубликованными REST operations: owner/public DTO, optimistic version и 24-часовая зашифрованная
  идемпотентность мутаций, отдельная privacy setting, cursor-bound owner/public history и три статистических
  среза. Закрытый, отсутствующий, удаляемый и заблокированный профиль сохраняют общий
  `PROFILE_NOT_AVAILABLE`; direct block проверяется в обе стороны, а anonymous чтение следует `PUBLIC`.
- Валидация повторяет утверждённые поля онбординга: NFC-имя без control characters, locality catalogue, непустые
  distinct форматы, шкала 1.0–5.0 с шагом 0.5 и IANA timezone. Биография не добавлена, поскольку утверждённые
  требования и REST-контракт намеренно оставляют тот же набор полей, что у онбординга. Завершение онбординга
  теперь атомарно создаёт `player_profiles`; это закрывает разрыв, при котором stage-02 backfill покрывал только
  профили, завершённые до миграции.
- DUPR проверяется локально без HTTP/fetch/scraping: HTTPS, отсутствие credentials/query/fragment/non-default port,
  точный approved host и path regexp. Capability и outbound fail-closed через `PROFILE_DUPR_*`; raw URL хранится
  только authenticated ciphertext, наружу всегда идёт маркировка `EXTERNAL_NOT_VERIFIED_OR_SYNCED`. Avatar port
  выдаёт пятиминутную policy только для server-generated private key и остаётся выключенным без media gateway;
  подписанный URL в БД не хранится и непроверенный asset не активируется.
- Новый BullMQ consumer получает минимальную ссылку на любое committed `match.*`, перечитывает authoritative match,
  result, marker, зарегистрированный состав и games и применяет monotonic contribution revision. Одинаковая
  revision обязана иметь тот же checksum, старая доставка не уменьшает revision, а aggregate полностью
  пересчитывается из текущих contributions в serializable transaction. Поэтому спор/void/cancel создаёт tombstone
  или удаляет organizer reliability contribution вместо конкурентного `-1`; guest slots вообще не читаются.
  Team points сохраняются целиком каждому зарегистрированному игроку и не делятся в doubles.
- Команда `profiles:rebuild-statistics` строит или возобновляет `BUILDING` shadow generation, сохраняет
  `checkpoint_match_id` отдельной migration, выполняет catch-up под общей advisory lock, сверяет канонические
  count/SHA-256 через PostgreSQL trigger и атомарно делает generation `ACTIVE`. Сбой помечает только shadow как
  `FAILED`, не заменяя прежнюю проекцию. Запрос/завершение rebuild и изменения профиля пишут минимальные outbox
  events; rebuild и profile mutations имеют audit без персональных значений.
- Изменённые области: `backend/src/profiles/`, App/Worker module, outbox routing, identity onboarding completion,
  typed environment и `.env.example`, Prisma schema и migration `20260911190000_profiles_backend`, backend README,
  profile data policy и unit/integration tests.

### Проверки этапа profile/statistics 03-backend

- Финальный `npm run verify` — успешно полностью: workspace/lockfile, TypeSpec/Redocly, policy для 87 REST
  operations/41 messages, 58 contract/data/privacy tests, compatibility с `HEAD`, generated drift/typecheck,
  OpenAPI mock, format/docs, lint/typecheck/unit tests/build всех восьми workspaces. Backend: 22 suite/56 tests;
  web: 5/19; TMA: 4/14. Сохранились известные неблокирующие Vite warnings о 924 kB map chunk и 533 kB TMA bundle.
- `npm run lint --workspace @picklehub/backend`, `npm run typecheck --workspace @picklehub/backend` и
  `npm run build --workspace @picklehub/backend` — успешно. Полный backend unit run — 22 suite, 56 tests,
  включая подпись, access-boundary, tamper и expiry profile cursor и fail-closed DUPR environment gates.
- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npx prisma generate
--schema backend/prisma/schema.prisma`, `prisma format` и `prisma validate` с synthetic `DATABASE_URL` — успешно;
  Prisma Client 6.16.2 сгенерирован, schema валидна. Целевые `profiles-policy`/`profiles-data-policy` — 8/8 успешно,
  включая постоянный rebuild checkpoint.
- Целевой integration run обнаружил три migration и два backend/concurrency сценария, но sandbox остановил их до
  assertions: `pg` получил запрет подключения к `127.0.0.1:5432`, а Prisma завершил первый create без выполнения
  теста; пробный AppModule run также получил ожидаемый `connect EPERM 127.0.0.1:6379`. Тест переведён на минимальный
  testing module без Redis, однако PostgreSQL runtime всё равно недоступен. Поэтому duplicate/out-of-order
  convergence, guest exclusion, privacy/block и checkpoint migration runtime должны быть подтверждены CI job
  после `prisma migrate deploy`; их успех в этой сессии не заявляется.
- Первый корневой `npm run verify` дошёл до `format:check` и корректно остановился на новом неформатированном
  environment unit test; после Prettier финальный полный `npm run verify` успешен. `git diff --check` успешен.
  Provider/legal approval DUPR, object storage, decode/re-encode/malware scanner и размещение медиа в РФ не
  проверялись; соответствующие capabilities остаются выключенными по умолчанию.
- Локально исполнимые критерии этапа выполнены. PostgreSQL integration/concurrency приёмка остаётся
  environment-blocked и должна быть зелёной до перехода к `llm/06-player-profile-stats/04-tma-web.md`; следующий
  промпт не начинался.

## 2026-09-11 — профиль и статистика, этап 04-tma-web

- Активный промпт: `llm/06-player-profile-stats/04-tma-web.md`. Web/PWA и TMA получили паритетные собственный и
  публичный профили, маршруты `/profile` и `/players/:playerId` и переходы из состава матча. Собственный экран
  редактирует имя, населённый пункт, форматы, строгую самооценку, часовой пояс и видимость; мутации используют
  optimistic version и сохраняют один idempotency key при сетевом повторе.
- Аватар ограничен JPEG/PNG/WebP и 5 МиБ, до выдачи upload policy в браузере считается SHA-256; PUT отправляется
  только на server-signed URL с обязательными заголовками, а UI честно сообщает об отложенной безопасной
  обработке. DUPR показан только как внешняя непроверенная и несинхронизируемая ссылка; переход имеет
  `noopener`/`noreferrer`, а capability может оставить его выключенным.
- Статистика показывает три серверных среза, timestamp расчёта в часовом поясе пользователя, textual `dl` рядом с
  полосой win rate и последнее подтверждение. Нулевой denominator даёт отсутствующий процент, а не `0%`.
  `UPDATING` сохраняет последнее согласованное состояние. Надёжность и посещаемость соблюдают public threshold и
  не раскрывают source match. Ожидающие и оспоренные записи истории отделены как ещё не вошедшие в статистику.
- Loading, empty, partial statistics/history, unavailable, retry и offline состояния не подставляют вымышленные
  нули; offline блокирует мутации. Public route вызывает только public API и не объединяет ответ с self cache.
  API client получил типизированные методы всех 13 profile routes, `no-store`, защищённые mutation headers,
  optional bearer для public read и cursor pagination.
- Аналитика соответствует утверждённой allowlist: `profile_viewed`, `match_history_opened`, `statistics_viewed` и
  `dupr_link_opened` передают только ownership, enum состояния/источника/формата и bucket количества без player,
  match, profile values или totals. События успешных экранов дедуплицируются на screen scope.
- Добавлены одинаковые Web/TMA component tests: public-only boundary, нулевой denominator, updating и disputed
  state, partial load без нулей, offline readable state и повтор mutation с тем же key. Во время теста найден и
  исправлен runtime-дефект `Intl.DateTimeFormat`: несовместимое сочетание date/time styles с `timeZoneName`
  заменено явными полями даты и времени.

### Проверки этапа profile/statistics 04-tma-web

- Целевые `lint`, strict `typecheck`, Vitest и production `build` для `@picklehub/analytics`,
  `@picklehub/api-client`, `@picklehub/web` и `@picklehub/tg` — успешно. Web: 6 suites/23 tests; TMA: 5/18;
  профильный parity-набор — по 4/4 в каждом клиенте; API client — 1/5; analytics — 1/1.
- `npm run verify` до финальной синхронизации analytics taxonomy прошёл полностью. Итоговый прогон после
  синхронизации и записи журнала успешно прошёл workspace/lockfile, TypeSpec/Redocly, policy для 87 REST
  operations/41 messages, 58 contract/data/privacy tests, compatibility и generated drift/typecheck, затем один
  раз остановился на sandbox `listen EPERM 127.0.0.1` в OpenAPI mock. Немедленный отдельный
  `npm run contracts:mock:check` успешно проверил все шесть групп examples; оставшаяся точная цепочка
  `format:check`, `docs:check`, `lint`, `typecheck`, `test`, `build`, `npm ls --depth=0` и `git diff --check` также
  успешна для восьми workspaces без unmet/extraneous dependencies.
- Production Web/PWA build подтвердил manifest/service worker; TMA guard подтвердил отсутствие development mock.
  Сохранились неблокирующие предупреждения Vite: MapLibre chunk около 924 кБ, основной web bundle около 507 кБ и
  TMA около 553 кБ; route-level splitting остаётся последующей оптимизацией.
- `NODE_TLS_REJECT_UNAUTHORIZED=0` остаётся внешним небезопасным свойством окружения и не добавлен в репозиторий.
  Реальный object storage, decode/re-encode/malware scanning, размещение медиа в РФ и DUPR provider/legal approval
  не заявляются; backend capabilities по умолчанию остаются выключенными.
- Содержательные критерии клиентского этапа выполнены. Следующий промпт —
  `llm/06-player-profile-stats/05-verification.md`; к нему не переходили.

## 2026-09-11 — профиль и статистика, этап 05-verification

- Активный промпт: `llm/06-player-profile-stats/05-verification.md`. Создана матрица прослеживаемости
  `llm/_docs/profiles-verification.md`, которая связывает исходы матчей, revision/rebuild, privacy, avatar, логи и
  UI-гарантии с contract, unit, component и PostgreSQL слоями и не выдаёт наличие теста за фактический runtime
  результат.
- Новый PostgreSQL verification-набор проверяет scored и played-without-score outcomes, proposal, dispute,
  cancellation, несыгравшего участника, guest slot, повтор события и компенсацию ранее подтверждённого результата
  через `EXCLUDED` tombstones. Отдельные сценарии сравнивают totals после incremental projection, полного rebuild
  и продолжения существующего `BUILDING` generation с checkpoint; две конкурентные записи одной версии профиля
  обязаны дать ровно один успех.
- Public/owner OpenAPI schemas закреплены точными snapshots, а runtime DTO дополнительно проверяются отдельно.
  Block и `PRIVATE` возвращают одинаковый `PROFILE_NOT_AVAILABLE`; anonymous semantics публичного профиля остаются
  неизменными. Avatar verification доказывает server-generated owner key, точные policy metadata и отказ stale
  profile version. Producer окончательного no-show остаётся функции `07-trust-safety`: до неё отмена не считается
  подтверждённой неявкой, а UI сохраняет `attendanceAvailable=false`.
- Негативный log test теперь использует canary display name, DUPR URL/ciphertext, self-assessment, score и points;
  общий structured redactor закрывает эти ключи на любой глубине. Raw значения не добавлены в audit/outbox.
- В обоих клиентах исправлена найденная аудитом гонка account/player scope: завершившийся поздно запрос прежнего
  профиля больше не может перезаписать новый экран. Паритетные тесты покрывают эту регрессию, cursor pagination
  первой страницы из 50 записей, округление `2 / 3` до `66.7%`, доступное имя диаграммы и нейтральные empty/partial
  состояния.
- Изменённые файлы: profile verification integration test, profile policy и redaction unit tests, общий logger,
  Web/TMA profile components и parity tests, `llm/_docs/profiles-verification.md` и этот журнал. REST/AsyncAPI,
  generated clients, Prisma schema и migrations не менялись.

### Проверки этапа profile/statistics 05-verification

- `npm run verify` — успешно полностью: workspace/lockfile, TypeSpec/Redocly, policy для 87 REST operations и 41
  messages, 59 contract/data/privacy tests, compatibility/generated drift/typecheck, OpenAPI mock, format/docs,
  lint/typecheck/unit tests и production build всех восьми workspaces. Backend: 22 suites/57 tests; Web: 6/25;
  TMA: 5/20. Production Web/PWA manifest/service worker и отсутствие development Telegram mock подтверждены.
- Целевые profile policy/data tests — 9/9 успешно за 366 мс; log-redaction — 3/3 за 4,625 с. После расширения
  large-history набора profile component tests повторно успешны: Web 6/6 за 905 мс, TMA 6/6 за 860 мс. Отдельные
  lint и strict typecheck backend/Web/TMA успешны.
- Три profile integration suites обнаружили 9 tests и завершились за 2,398 с до assertions: sandbox запретил
  подключения Prisma/`pg` к `127.0.0.1:5432`. Поэтому матрица исходов, фактическая эквивалентность
  rebuild/incremental, checkpoint resume, concurrent update и runtime DTO/avatar assertions должны пройти в
  PostgreSQL CI job; их успех в этой сессии не заявляется.
- `npm ls --depth=0` и `git diff --check` — успешно; unmet/extraneous dependencies и whitespace errors отсутствуют.
  Сохраняются внешнее предупреждение `NODE_TLS_REJECT_UNAUTHORIZED=0` и неблокирующие Vite warnings: web/TMA
  main bundles около 507/554 кБ и MapLibre chunk 924 кБ.
- После записи матрицы и журнала `npm run format:check`, `npm run docs:check` и `git diff --check` повторно успешны:
  Prettier/TypeSpec проверили формат, markdownlint проверил 119 Markdown-файлов без ошибок.
- Реальные object storage, decode/re-encode/malware scanning, размещение медиа в РФ, DUPR provider/legal approval и
  trust/safety no-show producer не проверялись и не заявляются. Соответствующие production capabilities остаются
  выключенными.
- Локально исполнимые критерии и автоматизация этапа выполнены, но runtime-приёмка равенства перестроенной и
  инкрементальной проекций остаётся environment-blocked до зелёного PostgreSQL-прогона. Следующий промпт —
  `llm/07-trust-safety/01-requirements.md`; к нему не переходили.

## 2026-09-11 — доверие и безопасность, этап 01-requirements

- Активный промпт: `llm/07-trust-safety/01-requirements.md`. Изменения ограничены продуктовыми требованиями,
  моделью домена, архитектурными границами, privacy/retention и аналитикой; TypeSpec/AsyncAPI, Prisma, backend,
  административная очередь и клиентские экраны trust/safety не создавались.
- Зафиксированы девять пользовательских историй и 16 сценариев «Дано/Когда/Тогда»: отзыв после подтверждённого
  матча, no-show signal, safety/content/venue/result reports, блокировка/разблокировка, собственная квитанция и
  статус, уведомление затронутого игрока, ответ, апелляция и проверяемый fallback-канал связи.
- Стартовые окна: отзыв — 14 суток после confirmation, no-show — от `startsAt + 30 минут` до семи суток, safety —
  до 90 суток после связанного взаимодействия, исключительный review подтверждённого результата — 14 суток.
  Повторы одного reporter идемпотентны, независимые сигналы не теряются при объединении case, но один no-show или
  иной decision effect уникален и не умножается числом reports.
- Разделены immutable signal, закрытый moderation case, append-only response/appeal, versioned human decision и
  идемпотентный reversible effect. Pending/withdrawn/rejected report, число заявителей и молчание target не
  становятся доказанной виной, публичным фактом, санкцией или статистическим вкладом. Автоматически разрешены
  только технические rate/spam/privacy quarantine и собственная block preference; остальные эффекты требуют
  одобренной versioned policy и human decision.
- Отзыв использует закрытые rating/tags и optional text; публично доступен только обратимый средний aggregate
  после пяти eligible авторов по разным матчам. Reports, texts, tags, blocks, sanctions и no-show evidence не
  публикуются. Подтверждённая moderation неявка создаёт один authoritative source для уже определённой profile
  statistics, а result correction меняет marker/statistics только через новую authoritative revision.
- Блокировка немедленно запрещает в обе стороны новый direct profile/search/invite/join/request/waitlist/promotion
  и будущий direct channel, но не разрушает существующий общий матч, системные факты или report action. Unblock не
  обходит встречный block/restriction и не восстанавливает прошлые заявки или очищенный контент.
- Экстренный путь прямо сообщает обратиться в `112`/местную службу при непосредственной угрозе и что PickleHub не
  является экстренной службой и не гарантирует немедленный ответ. Показ предупреждения не выдаётся за triage или
  вызов службы; реальный номер, текст, staffing, часы и внешний канал остаются production gates legal/operations.
- Evidence минимизировано, отделено от searchable metadata и предложено к authenticated encryption в РФ;
  moderator access требует assignment/no-conflict, апелляцию рассматривает другой reviewer, break-glass адресный
  и аудируемый. Зафиксированы предлагаемые retention до одного/трёх лет по категории, case-local pseudonymization,
  legal hold, cleanup всех производных sinks и запрет текста/контактов/координат/rating в logs, trace, error,
  audit, analytics, outbox, BullMQ и DLQ.
- Analytics plan получил четыре consented события только с broad enum/buckets и обязательные operational
  queue/decision/appeal/effect/cleanup guardrails без reporter-subject graph, case IDs, узкой причины или текста.
  Block, target response, moderator action и emergency warning не экспортируются как behavioral analytics.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/architecture.md`, `llm/_docs/security-privacy.md`, `llm/_docs/analytics-plan.md` и этот журнал.

### Проверки этапа trust/safety 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/domain-model.md llm/_docs/architecture.md
llm/_docs/security-privacy.md llm/_docs/analytics-plan.md` — успешно; пять содержательных документов
  отформатированы.
- После исправлений `npx prettier --write llm/_docs/product-requirements.md llm/_docs/analytics-plan.md` — успешно,
  файловый drift отсутствовал.
- `npm run format:check` — успешно: Prettier и TypeSpec format check прошли, шесть TypeSpec source не изменены.
- `npm run docs:check` — успешно: markdownlint проверил 119 Markdown-файлов, ошибок нет.
- Read-only Node.js-проверка всех относительных Markdown-ссылок через `rg --files -g '*.md'` — успешно: проверено
  92 ссылки, отсутствующих целей нет.
- `git diff --check` — успешно; whitespace errors отсутствуют.
- `contracts:check`, lint/typecheck/tests/build и runtime integration/e2e не запускались: документационный этап не
  меняет контракты, generated artifacts или исполняемый код, а их успешность не проверяет ещё не реализованные
  lifecycle, RBAC, encryption, concurrency и cross-module block guarantees. Предыдущие environment-blocked
  PostgreSQL/Redis/Playwright проверки не выдаются за выполненные.
- Критерии этапа выполнены на уровне требований: неподтверждённая жалоба не публикуется как факт, direct
  взаимодействие заблокированных пользователей запрещено, а продукт явно не выдаёт модерацию за экстренную
  службу. Следующий промпт — `llm/07-trust-safety/02-contract-data.md`; к нему не переходили.

## 2026-09-11 — доверие и безопасность, этап 02-contract-data

- Активный промпт: `llm/07-trust-safety/02-contract-data.md`. TypeSpec добавляет 11 player operations: создание,
  замена и отзыв review; no-show и safety/content/venue/result report; cursor-bound список и собственный detail
  квитанции; withdrawal intent, response, appeal; список собственных active blocks и пороговую публичную
  репутацию. Существующие `/communication-blocks/{blockedUserId}` сохранены совместимыми и теперь документируют
  платформенный двухсторонний deny новых direct interactions.
- Все мутации требуют bearer, browser Origin/CSRF и UUIDv4 idempotency key. Чужой receipt совпадает с отсутствующим;
  список содержит только receipt/category/status/safe outcome, а detail возвращает лишь собственный сохранённый
  текст. Case/reporters/subject/source/reason/evidence другой стороны/assignment/sanction detail отсутствуют.
  Публичная репутация отдаёт только reversible average и count после пяти eligible независимых источников.
- Prisma и SQL migration добавляют `Review` с append-only revisions, immutable `SafetySignal` и отдельные
  `NoShowReport`/`Report`/encrypted evidence, `ModerationCase`, links/responses, append-only versioned decisions,
  appeal, idempotent reversible effect, rebuildable review contributions/aggregate, scoped legal hold и
  encrypted 24-hour idempotency response. Физический active block и общий `AuditEntry` не дублируются:
  communications остаётся владельцем block graph, а audit защищён новым UPDATE/DELETE trigger.
- Ограничения БД фиксируют author-subject-match review, reporter business hash, exact signal subtype/taxonomy,
  автоматы signal/case/appeal/effect, monotonic revisions, decision assignment/no-conflict, другого appeal reviewer,
  72-часовой temporary review, один appeal стороны и один final no-show effect на match + subject. Account deletion
  поддерживает одноразовую замену actor links на несвязуемые pseudonyms; текст не хранится в searchable metadata.
- `trust-safety.events.v1` содержит четыре outbox-события. Каждое несёт только один opaque
  signal/case/decision/effect ID и broad category; subject/reporter/source/revision/reason/status/outcome/rating,
  text/evidence/attachments и block direction запрещены policy test. Generated OpenAPI, AsyncAPI TypeScript и
  копия API client обновлены только генератором.
- Новый `trust-safety-data-policy.md` документирует authenticated encryption/AAD, least-privilege evidence access,
  proposed retention, cryptoshredding, deletion/suppression ledger, 35-дневное истечение backups и адресный
  case/record-scoped legal hold. Это проект контракта, а не legal/residency/staffing approval; реальные safety-данные
  до approvals собирать нельзя.

### Проверки этапа trust/safety 02-contract-data

- `npm run verify` — успешно полностью на финальном содержательном состоянии: workspace/lockfile, TypeSpec/Redocly,
  policy для 98 REST operations и 45 messages, 66 contract/data/privacy tests, compatibility с `HEAD`, generated
  drift/typecheck, OpenAPI mock с trust/safety, format/docs, lint/typecheck/unit tests/build всех восьми workspaces.
  Backend: 22 suite/57 tests; web: 6/25; TMA: 5/20. Сохранились известные неблокирующие Vite warnings о 924 kB map
  chunk, web main 507 kB и TMA main 554 kB.
- После финального no-op уточнения TypeSpec полный `npm run verify` повторно прошёл до `contracts:mock:check`, но
  sandbox три раза запретил новый listener `127.0.0.1` с `EPERM`. Перед этим отдельный `npm run contracts:mock:check`
  уже успешно проверил trust/safety response; после уточнения generated schemas структурно не менялись. Оставшаяся
  цепочка `format:check`, `docs:check`, lint/typecheck/tests/build прошла успешно, а `contracts:generated:check` и
  `contracts:typecheck` повторены успешно на окончательных файлах.
- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npx prisma format`,
  `prisma validate` с synthetic `DATABASE_URL` и `prisma generate` — успешно; Prisma Client 6.16.2 сгенерирован,
  schema валидна.
- Целевой `trust-safety-migration.integration-spec.ts` обнаружил два PostgreSQL scenario, но оба остановились до
  первого assertion на `pool.connect()` из-за запрещённого sandbox подключения. Поэтому runtime применение новой
  SQL migration и assertions business dedup/subtype, append-only history и unique no-show effect должны пройти в
  CI PostgreSQL job; их успех здесь не заявляется. Static migration/data policy tests — 4/4 успешно, но не заменяют
  runtime PostgreSQL.
- `npm ls --depth=0` и `git diff --check` — успешно; unmet/extraneous dependencies и whitespace errors отсутствуют.
  Внешняя настройка `NODE_TLS_REJECT_UNAUTHORIZED=0` остаётся свойством окружения и один раз дала предупреждение
  Redocly; она не добавлена в репозиторий.
- Локально исполнимые критерии этапа выполнены. Runtime-критерий миграции остаётся environment-blocked до зелёного
  PostgreSQL-прогона; следующий промпт `llm/07-trust-safety/03-backend.md` не начинался.

## 2026-09-11 — доверие и безопасность, этап 03-backend

- Активный промпт: `llm/07-trust-safety/03-backend.md`. Добавлен NestJS-модуль `trust-safety` с player-facing
  endpoints опубликованного контракта: create/replace/withdraw review, no-show и категоризированные reports,
  caller-scoped receipt list/detail, withdrawal intent, response, appeal, active block list и thresholded public
  reputation. Browser mutations используют Origin/CSRF, отдельный rate-limit budget и зашифрованную 24-часовую
  идемпотентность с serializable retry.
- Review разрешён только двум сыгравшим участникам подтверждённого матча в 14-дневном окне. Один
  `author + subject + match` сериализуется блокировкой match aggregate и append-only revision; rating/tags/text не
  публикуются. Rebuildable contribution и aggregate учитывают только effective eligible review, withdrawal
  исключает вклад, а публичная проекция появляется только после пяти источников.
- No-show проверяет обе стороны состава и окно `startsAt + 30 минут` — семь суток. Остальные reports сначала
  проходят closed enum taxonomy, затем проверку доступа к точной source revision. Optional evidence, response,
  appeal и idempotency response используют отдельный `SAFETY_ENCRYPTION_KEY`, AES-256-GCM и record-bound AAD;
  outbox, audit и notification содержат только opaque ID, broad category или безопасный route без текста.
- Каждый новый signal атомарно получает case/link и минимальные `safety.signal.received.v1` /
  `safety.case.status.changed.v1`. Внутренний moderation repository реализует optimistic state machine
  `OPEN → TRIAGED → ASSIGNED → INVESTIGATING → DECIDED`, assignment/no-conflict evidence gate, аудит разрешённого
  и запрещённого чтения, безопасный запрос ответа target, семидневное окно, versioned human decision и одну
  апелляцию. Существенное неэкстренное решение нельзя записать до ответа либо окончания окна; urgent priority не
  выдаётся за экстренную службу.
- Decision создаёт только минимальные `decision/effect/case` events. `NO_VIOLATION` не создаёт sanction effect;
  остальные effects остаются `PENDING` до owning consumer. Подтверждённая human decision неявки защищена
  существующим partial unique index; profile worker дедуплицированно применяет или отменяет contribution и полный
  statistics rebuild перечитывает все active applied no-show effects.
- Общий `InteractionPolicyService` применяет физический block graph в обе стороны. Авторизованный поиск матчей
  скрывает матчи counterpart, direct detail безопасно недоступен кроме уже общего матча, join/request approval и
  ручной/автоматический waitlist promotion запрещены. Создание блока в той же транзакции завершает pending
  requests/waitlist, сохраняет существующий roster/history и пишет audit; unblock старые действия не восстанавливает.
- Добавлены отдельные production-gated `SAFETY_ENCRYPTION_KEY` и `SAFETY_POLICY_VERSION`, пример окружения и
  описание backend boundary. Добавлены unit privacy test authenticated encryption/AAD и PostgreSQL integration
  scenarios для закрытого review, threshold projection, concurrent idempotency, minimized outbox, cross-module
  block и assignment-only evidence.
- Изменённые файлы: `backend/src/trust-safety/*`, `backend/src/app.module.ts`,
  `backend/src/common/config/environment.ts`, `backend/src/common/database/database.module.ts`,
  `backend/src/common/database/interaction-policy.service.ts`, communications/matches/profile projection services
  и modules/controllers, `backend/test/unit/trust-safety-crypto.spec.ts`,
  `backend/test/integration/trust-safety-backend.integration-spec.ts`, `backend/test/unit/overpass.adapter.spec.ts`,
  `backend/.env.example`, `backend/README.md` и этот журнал. TypeSpec, generated clients и stage-02 migration не
  редактировались.

### Проверки этапа trust/safety 03-backend

- `npm run verify` — один полный прогон основной реализации успешно проверил workspace/lockfile,
  TypeSpec/Redocly, policy для 98 REST operations и 45 messages, 66 contract/data/privacy tests, compatibility с
  `HEAD`, generated drift/typecheck, OpenAPI mock, format/docs, lint/typecheck/unit tests/build всех восьми
  workspaces. После финального уточнения caller/subject receipt и безопасного notification route повторный verify
  прошёл до `contracts:typecheck`, но sandbox запретил listener OpenAPI mock на `127.0.0.1` с `EPERM`; контракты при
  этом не менялись. Оставшаяся цепочка `format:check`, `docs:check`, lint, typecheck, tests и build повторена
  отдельно и успешно. Backend: 23 suite/58 tests, включая новый AAD privacy test; web: 6/25; TMA: 5/20.
  Сохранились известные неблокирующие Vite warnings о 924 kB map chunk, web main 507 kB и TMA main 554 kB.
- `npm run lint --workspace @picklehub/backend`, `npm run typecheck --workspace @picklehub/backend`,
  `npm test --workspace @picklehub/backend -- --runInBand` и `npm run build --workspace @picklehub/backend` —
  успешно отдельно перед полным verify; ESLint без warnings, TypeScript strict и build зелёные, 23/23 suite и 58/58
  unit tests прошли.
- `npm run test:integration --workspace @picklehub/backend -- --runInBand
test/integration/trust-safety-backend.integration-spec.ts` — suite обнаружил три сценария и скомпилировался, но
  все остановились в setup до первого assertion на первой Prisma-записи (`onboardingLocality.create`); локальная
  PostgreSQL/Redis инфраструктура недоступна из sandbox. Поэтому concurrent signal/case/effect, SQL transition
  guards, block cross-module runtime и restricted repository должны быть подтверждены CI integration job; их
  успешность здесь не заявляется.
- `git diff --check` — успешно до журналирования; whitespace errors отсутствовали. После журналирования повторены
  `npm run format:check`, `npm run docs:check` и `git diff --check`.
- Локально исполнимые критерии выполнены. Единственный незакрытый критерий — runtime PostgreSQL integration в CI;
  следующий промпт остаётся `llm/07-trust-safety/03-backend.md` до зелёного прогона, к `04-tma-web.md` не переходили.

## 2026-09-11 — доверие и безопасность, этап 04-tma-web

- Активный промпт: `llm/07-trust-safety/04-tma-web.md`. Web/PWA и TMA получили одинаковый player-facing safety
  workflow: навигацию и центр собственных минимальных квитанций, caller-only detail, запрос отзыва обращения,
  ответ на запрос и апелляцию. Статус показывает только broad category/state/outcome из backend projection, не
  обещает решение или срок и не раскрывает case, другого заявителя, evidence другой стороны, назначение или
  детали санкции.
- Контекстные входы добавлены из матча, подтверждённого результата, точной revision сообщения и versioned
  площадки. Старые chat/venue формы, возвращавшие разрозненные receipt, заменены переходами в единый
  `/safety/report`; форма сначала требует закрытую категорию/причину и только затем предлагает необязательный текст.
  Публичный профиль не создаёт некорректную жалобу с выдуманной revision: опубликованный profile contract не
  раскрывает revision, поэтому там реализована только доступная блокировка, а обращение открывается из точного
  match/chat контекста.
- После подтверждённого матча участник получает отдельный экран приватного review и possible no-show report.
  Review text/tags не выдаются за публичные, а no-show прямо сообщает, что сигнал сам по себе не меняет репутацию
  или статистику. Все mutation используют UUIDv4 idempotency key на логическую попытку, сохраняют его после ошибки,
  отключены offline и не создают optimistic success.
- Safety/report, no-show, response и appeal text находятся только в controlled form state и request body; после
  завершения запроса состояние текста очищается как при успехе, так и при ошибке. Клиент не пишет содержание в
  URL, console, analytics или error provider. Подсказки требуют минимизировать сведения и не добавлять документы,
  контакты и точные перемещения; собственная сохранённая копия evidence читается только на caller-owned detail.
- На форме жалобы постоянно виден явный emergency boundary: при непосредственной угрозе нужно звонить 112 или в
  местную службу, PickleHub не является экстренной службой и не гарантирует немедленный ответ. Критические экраны
  и post-match safety panels помечены ad-free и не содержат ad slot или third-party embed.
- Блокировка из публичного профиля требует модального подтверждения с описанием двухстороннего запрета новых
  direct interactions, Escape и возвратом фокуса. До загрузки caller-owned block state прямое действие не
  показывается; после блокировки оно заменяется состоянием и разблокировкой, а факты общих матчей/история
  сохраняются. В chat перед прежним быстрым block также добавлено подтверждение.
- Доступность включает label/fieldset, status/alert, фокус на ошибке или success receipt, keyboard dialog и
  offline/loading/empty/error/success states. Общая workflow-компонента переиспользована осознанно для строгого
  TMA/web policy parity, тогда как CSS остаётся отдельным platform-owned source.
- `@picklehub/api-client` получил типизированные методы 11 опубликованных trust/safety routes без изменений
  TypeSpec или generated client. API test подтверждает CSRF, bearer/idempotency headers и нахождение evidence
  только в JSON body. Component tests подтверждают emergency copy, отсутствие ad slot, exact source revision,
  очистку текста после request, offline deny, подтверждение block и раздельные review/no-show flows.

### Проверки этапа trust/safety 04-tma-web

- Целевые `lint`, strict `typecheck`, Vitest и production `build` для `@picklehub/api-client`, `@picklehub/web` и
  `@picklehub/tg` — успешно. Финальные результаты: web 7 suites/30 tests, TMA 6/21, API client 1/6.
- `npm run test:e2e:typecheck` и `npm run test:e2e:build` — успешно; production web build содержит manifest и
  service worker, TMA build не содержит development Telegram mock. Browser e2e для safety workflow не добавлялся:
  критические состояния покрыты component/API tests, а live backend integration остаётся verification stage/CI.
- `npm run verify` — успешно полностью на итоговом состоянии: 8 workspaces и один lockfile, TypeSpec/Redocly,
  policy для 98 REST operations и 45 messages, 66 contract/data/privacy tests, compatibility и generated drift,
  OpenAPI mock, format/docs, lint/typecheck/tests/build. Backend regression: 23 suites/58 tests; web 7/30; TMA 6/21.
- Сохранились неблокирующие Vite warnings: MapLibre chunk около 924 kB, основной web bundle около 531 kB и TMA
  около 578 kB; route-level splitting остаётся performance debt. Внешнее окружение по-прежнему задаёт
  `NODE_TLS_REJECT_UNAUTHORIZED=0`, это не добавлено в репозиторий.
- Runtime PostgreSQL integration предыдущего backend-этапа в этом frontend-промпте не повторялась и остаётся
  обязательной CI-проверкой, как записано выше. Локально исполнимые критерии текущего этапа выполнены. Следующий
  промпт — `llm/07-trust-safety/05-verification.md`; к нему не переходили.

## 2026-09-11 — доверие и безопасность, этап 05-verification

- Активный промпт: `llm/07-trust-safety/05-verification.md`. Создана матрица проверки
  `llm/_docs/trust-safety-verification.md`: assets/trust boundaries, threat model, actor matrix для заявителя,
  обвиняемого, постороннего игрока, назначенного и неназначенного Moderator, Superadmin, Editor и Ads manager,
  privacy/retention scan и прослеживаемость contract, unit, PostgreSQL, component и browser слоёв.
- Проверка обнаружила, что реализованные переходы `OPEN → TRIAGED → ASSIGNED → INVESTIGATING` создавали outbox
  event без audit entry. Moderator repository теперь требует actor ID для triage/assignment и атомарно пишет
  минимальные `safety.case.triaged`, `safety.case.assigned` и `safety.case.investigation.started` с полями только
  `state/revision`. Решение сохраняет существующий `safety.decision.recorded`; narrative в audit не попадает.
- PostgreSQL regression расширен: concurrent same-key retry и business duplicate с другим transport key дают один
  signal; block проверяется в обе стороны и снимается unblock; reporter видит собственный evidence, subject — только
  safe receipt без evidence, outsider получает тот же 404, а restricted repository разрешён только exact assignee.
  Отдельный сценарий проводит case по всему реализованному lifecycle до `DECIDED` и требует точный audit trail без
  canary-текста.
- Общий structured logger теперь рекурсивно скрывает `evidence`, `submittedEvidence`, `reviewText`, `responseText`,
  `appealText` и `reportDescription`. Unit test проверяет canary на глубине error-report metadata. Новый обязательный
  contract verification scan не допускает эти поля в analytics/client telemetry, проверяет public projection,
  минимальный outbox, audit actions и retention primary/cache/queue/DLQ/export/backups/legal hold.
- Локальный unit regression проводит moderation repository по переходам до `INVESTIGATING` через транзакционный
  порт и проверяет actor, action, минимальные changed fields и по одному outbox event без зависимости от PostgreSQL.
- Добавлен Playwright workflow на production builds для Web и TMA: safety report с emergency boundary и ad-free
  surface, очистка narrative из DOM, no-show без ложного публичного эффекта, block confirmation, unblock и UUID
  idempotency headers. TypeSpec/OpenAPI/generated clients/Prisma schema и migration не менялись.

### Проверки этапа trust/safety 05-verification

- `npm run verify` — успешно полностью: 8 workspaces/один lockfile, TypeSpec/Redocly, policy для 98 REST operations
  и 45 messages, 70 contract/data/privacy tests, compatibility/generated drift/typecheck, OpenAPI mock,
  format/docs, lint, strict typecheck, tests и production build. Backend: 24 suites/60 tests; Web: 7/30; TMA: 6/21;
  API client: 1/6. PWA manifest/service worker и отсутствие development Telegram mock подтверждены.
- `node --test contracts/scripts/trust-safety-policy.test.mjs contracts/scripts/trust-safety-data-policy.test.mjs
contracts/scripts/trust-safety-verification-policy.test.mjs` — 11/11 успешно. Полный `npm run contracts:lint` —
  70/70 policy/data/privacy tests успешно. `npm run test:e2e:typecheck` и `npm run test:e2e:build` — успешно для
  нового safety spec и обоих production clients.
- `npm run lint --workspace @picklehub/backend`, `npm run typecheck --workspace @picklehub/backend` и
  `npm test --workspace @picklehub/backend -- --runInBand` — успешно, 24/24 suites и 60/60 tests. Исправленные
  команды `npm test --workspace @picklehub/web`, `npm test --workspace @picklehub/tg` и
  `npm test --workspace @picklehub/api-client` — успешно: 30/30, 21/21 и 6/6 tests. Первая попытка передать
  Jest-флаг `--runInBand` в Vitest корректно завершилась ошибкой unknown option и не считается прогоном тестов.
- `npm run test:integration --workspace @picklehub/backend -- --runInBand
test/integration/trust-safety-backend.integration-spec.ts` обнаружил четыре сценария, но все остановились в общем
  setup до первого assertion на `onboardingLocality.create`: локальная PostgreSQL недоступна. Поэтому новые
  concurrency, actor matrix, block/unblock и lifecycle audit assertions должны пройти в PostgreSQL CI job; их успех
  в этой сессии не заявляется.
- `npx playwright test test/e2e/safety.spec.ts` обнаружил два сценария, но оба остановились до первого test step:
  sandbox завершил local Chrome с `SIGABRT`, а cleanup получил `kill EPERM`. Typecheck и production build spec
  зелёные, component tests покрывают соответствующие состояния, но browser assertions должны пройти в Playwright
  CI job; их успех в этой сессии не заявляется.
- После записи журнала `npm run format:check`, `npm run docs:check`, `npm ls --depth=0` и `git diff --check`
  повторены успешно; unmet/extraneous dependencies и whitespace errors отсутствуют. Сохраняются внешнее
  предупреждение `NODE_TLS_REJECT_UNAUTHORIZED=0` и неблокирующие Vite warnings: web/TMA main bundles около
  531/578 kB и MapLibre chunk 924 kB.
- Локально исполнимые критерии и автоматизация этапа выполнены. Runtime PostgreSQL и browser E2E остаются
  environment-blocked до зелёных CI jobs. Следующий промпт — `llm/08-admin-backoffice/01-requirements.md`; к нему
  не переходили.

## 2026-09-11 — административная панель, этап 01-requirements

- Активный промпт: `llm/08-admin-backoffice/01-requirements.md`. Изменения ограничены продуктовыми требованиями,
  доменной/архитектурной границей, privacy и operational analytics; TypeSpec/AsyncAPI, Prisma, backend и admin UI
  не создавались.
- Зафиксирована code-defined матрица для `SUPERADMIN`, `MODERATOR`, `EDITOR`, `ADS_MANAGER` без конструктора ролей,
  wildcard или неявного наследования всех данных superadmin. Обычная player-сессия и client-side route не дают
  административных прав; production admin требует отдельную audience/session, phishing-resistant MFA, idle и
  absolute timeout, свежую re-auth для чувствительных операций и server-side capability check на каждом запросе.
- Определены 11 MVP-историй и 12 сценариев «Дано/Когда/Тогда»: управление platform role, точный минимизированный
  user lookup, case queue/assignment/decision/appeal, ограничение пользователя, approve/reject/merge venue,
  audit search и break-glass. Каждая мутация требует actor, reason code, policy/version, idempotency key, expected
  revision и атомарный audit; недоступность audit откатывает доменное изменение.
- `MODERATOR` читает description/evidence только назначенного case без конфликта, апелляцию рассматривает другой
  reviewer. `SUPERADMIN` не имеет постоянного evidence bypass: break-glass адресован одному case, действует не
  более 30 минут, требует incident/reason/re-auth, не разрешает bulk/export/final decision и отдельно аудирует
  grant, чтения, отказы, отзыв и expiry. `EDITOR` и `ADS_MANAGER` не видят очередь, описание, evidence или стороны
  safety case.
- Списки получили opaque signed cursor, snapshot boundary, default 25/maximum 100 и allowlist-фильтры. User search
  ограничен exact UUID/receipt или exact identity через keyed index без query в URL/log/audit/analytics; audit
  search ограничен 31 сутками и не ищет narrative/evidence/before-after. Venue merge требует явного survivor,
  re-auth, отдельного подтверждения и optimistic revision.
- Административные CSV/JSON/export jobs/signed URL, bulk actions и case print packet запрещены в MVP. Для будущего
  legal/incident export перечислены отдельные approval, purpose, field/row limit, encryption, РФ-residency,
  download audit и cleanup gates. CMS и advertising оставлены точками расширения с отдельными capabilities без
  преждевременных экранов, API или таблиц и без доступа Editor/Ads manager к safety descriptions.
- Operational metrics используют только role/action/object/outcome/time-count buckets, не зависят от analytics
  consent, не содержат staff/user/case/venue IDs или narrative и не ранжируют сотрудников. Administration
  координирует узкие owning-module ports, но не копирует restricted данные и не пишет чужие authoritative таблицы.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/architecture.md`, `llm/_docs/security-privacy.md`, `llm/_docs/analytics-plan.md` и этот журнал.

### Проверки этапа admin backoffice 01-requirements

- Первый `git diff --check && npm run format:check && npm run docs:check` остановился на `format:check`: Prettier
  обнаружил форматирование `llm/_docs/product-requirements.md`; `docs:check` в этой цепочке не запускался.
- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/security-privacy.md
llm/_docs/analytics-plan.md llm/_docs/domain-model.md llm/_docs/architecture.md` — успешно; product requirements
  отформатирован, остальные четыре файла уже соответствовали стилю.
- `npm run format:check` — успешно: Prettier проверил репозиторий, TypeSpec format check — семь файлов.
- `npm run docs:check` — успешно: markdownlint проверил 121 Markdown-файл, ошибок нет.
- Read-only Node.js-проверка относительных Markdown-ссылок по списку `rg --files -g '*.md'` — успешно: проверена
  101 ссылка, отсутствующих целей нет.
- `npm ls --depth=0` — успешно; unmet/extraneous dependencies отсутствуют. `git diff --check` — успешно,
  whitespace errors отсутствуют.
- Первый финальный `npm run format:check` после добавления журнала обнаружил форматирование самого журнала;
  `npx prettier --write llm/_docs/ai-development-log.md` исправил его. После этого `npm run format:check`,
  `npm run docs:check`, проверка 101 Markdown-ссылки, `npm ls --depth=0` и `git diff --check` повторно успешны.
- Contracts, lint/typecheck/tests/build и runtime integration/e2e не запускались: документационный этап не меняет
  contracts, generated artifacts или исполняемый код, а эти проверки не подтверждают ещё не реализованные RBAC,
  admin session, break-glass, audit atomicity, pagination и venue moderation. Ранее заблокированные окружением
  PostgreSQL и Playwright проверки не выдаются за выполненные.
- Критерии этапа выполнены на уровне требований: каждое изменение имеет исполнителя, причину и audit; Editor и Ads
  manager не имеют доступа к описаниям safety cases; гибкого конструктора разрешений нет. Следующий промпт —
  `llm/08-admin-backoffice/02-contract-data.md`; к нему не переходили.

## 2026-09-11 — административная панель, этап 02-contract-data

- Активный промпт: `llm/08-admin-backoffice/02-contract-data.md`. Добавлен TypeSpec source
  `contracts/rest/administration.tsp` с 17 операциями под `/v1/admin`: отдельный admin session context, fixed role
  grant/revoke, exact user lookup через POST body, case queue/detail/assignment/decision, versioned user restriction,
  venue queue/detail/approve/reject/merge, bounded audit search и exact-case break-glass. Export/bulk/print/download
  endpoints, CMS и advertising API не добавлялись; AsyncAPI не менялся, потому что этап не вводит новый публичный
  или межмодульный event payload.
- Все операции требуют bearer admin audience и `no-store`, документируют безопасные 403 и scope-hiding
  `404 ADMIN_RESOURCE_NOT_FOUND`. Мутации требуют Origin/CSRF, UUIDv4 idempotency key, closed reason,
  policy/version и expected revision; чувствительные merge/role/break-glass действия имеют одноразовый confirmation
  token. Case/venue/audit списки используют default 25/maximum 100, закрытые filter enums и opaque cursor; audit
  interval ограничен 31 UTC сутками. Exact email/Telegram subject существует только во входном union lookup и не
  появляется в URL, ответе, audit или storage.
- Каждая операция получила машинно-проверяемые OpenAPI extensions `x-admin-capability`, `x-admin-roles` и, где
  нужен resource check, `x-admin-resource-policy`. `administrationRoleCapabilities` фиксирует deny-by-default
  registry для четырёх ролей; policy test не допускает wildcard/custom role, выдачу operation capability чужой
  роли, unrestricted string filters или admin export route. `EDITOR`/`ADS_MANAGER` имеют на этом этапе только
  session access; `SUPERADMIN` без exact-case break-glass не получает narrative, а break-glass не даёт decision.
- Prisma и новая additive migration `20260911230000_admin_backoffice_contract_data` добавляют четыре enum,
  `platform_role_grants`, отдельные hashed `admin_sessions`, encrypted `break_glass_grants`, encrypted 24-hour
  `admin_operation_receipts` и versioned `user_restrictions`. SQL защищает independent approval/no self-grant,
  одну effective роль/scope, admin audience, 15-minute idle/8-hour absolute session bounds, 30-minute exact-case
  break-glass, immutable scope/expiry, optimistic revision и запрет hard delete. Backend implementation и admin UI
  не создавались.
- Существующий `audit_entries` расширен nullable `operation_id`/`policy_version`, поэтому старые append-only строки
  не переписываются. Для всех новых `source = administration` rows DB требует operation, actor, opaque target,
  closed action/reason/outcome, policy и единственный allowlisted `changed_fields.names`; generic narrative,
  evidence и before/after отсутствуют. Старые immutable triggers сохраняются, новый constraint объявлен `NOT VALID`
  для совместимого добавления и всё равно проверяет новые строки; runtime PUBLIC лишён UPDATE/DELETE/TRUNCATE.
- Добавлен `llm/_docs/admin-backoffice-data-policy.md`, уточнена административная часть domain model и contract
  README. OpenAPI и оба generated TypeScript клиента обновлены только через `npm run contracts:generate`. OpenAPI
  mock расширен безопасной admin case queue без reporter/subject/narrative/evidence.

### Проверки этапа admin backoffice 02-contract-data

- Первый `npm run contracts:typespec:check` обнаружил три ошибки TypeSpec: duplicate `justification` после spread и
  конфликт query filter names с request headers. Поля исправлены; повторная компиляция успешна. Первый запуск
  targeted policy tests обнаружил слишком узкое ожидание текста 404 в новом checker; assertion исправлен, после
  чего admin policy/data tests — 8/8 успешно.
- Первый полный `npm run contracts:lint` после добавления API остановился на 17 Redocly
  `operation-summary` errors. Для каждой операции добавлен summary. Финальный `npm run contracts:lint` успешен:
  TypeSpec и Redocly зелёные, allowlist содержит 115 REST operations и 45 messages, весь набор — 78 contract/data/
  privacy tests. `npm run contracts:breaking`, `contracts:generated:check`, `contracts:typecheck` также успешны.
- `npm run contracts:mock:check` успешно проверил health, identity, venue, match, communication, profile,
  trust/safety и новую administration queue. В двух составных запусках sandbox эпизодически запретил резервирование
  localhost socket (`listen EPERM 127.0.0.1`) до запуска Prism; оба раза немедленный отдельный повтор той же команды
  успешно завершился. Это ограничение harness/sandbox, а не ошибка ответа mock.
- `npm run format:check` и `npm run docs:check` успешны: восемь TypeSpec files и 122 Markdown files. Первый targeted
  вызов `npx prettier --write` ошибочно включал `.tsp` и остановился с `No parser could be inferred`; TypeSpec затем
  форматировался штатной `tsp format`, а остальные файлы — Prettier.
- `npm run lint`, `npm run typecheck`, `npm test` и `npm run build` успешны для восьми workspaces. Backend regression:
  24/24 suites и 60/60 tests; API client 6/6, web 7 suites/30 tests, TMA 6/21. Production web PWA и отсутствие TMA
  development mock подтверждены. Сохраняются неблокирующие Vite warnings: web/TMA main bundles около 531/578 kB и
  MapLibre chunk 924 kB.
- `npx prisma validate --schema backend/prisma/schema.prisma` не запустил schema engine: локального binary нет, а
  restricted network не разрешил загрузку checksum с Prisma (`ENOTFOUND claude-fwd.raiffeisen.ru`). Применение SQL к
  PostgreSQL также недоступно: Docker daemon socket запрещён sandbox (`permission denied`), `pg_isready`/`psql`
  отсутствуют. Поэтому Prisma engine validation и runtime migration/constraint tests должны пройти в PostgreSQL CI;
  их успех здесь не заявляется. Статические migration/data-policy tests, contract generation и весь TypeScript
  regression зелёные.
- После финальных enum/minimization исправлений `npm run contracts:check` повторно прошёл все этапы до описанного
  разового localhost bind отказа; отдельный `npm run contracts:mock:check` успешен. Локально исполнимые критерии
  prompt выполнены. Финальные `npm run contracts:lint` — 78/78 tests, targeted admin tests — 8/8;
  `npm run format:check`, `npm run docs:check`, `npm ls --depth=0` и `git diff --check` успешны, unmet/extraneous
  dependencies и whitespace errors отсутствуют. Следующий prompt — `llm/08-admin-backoffice/03-backend.md`; к нему
  не переходили.

## 2026-09-11 — административная панель, этап 03-backend

- Активный промпт: `llm/08-admin-backoffice/03-backend.md`. Создан NestJS-модуль `administration` и подключён к
  API application. Реализованы 17 ранее согласованных `/v1/admin` routes без export/bulk/CMS/advertising API:
  session context, role grant/revoke, exact user lookup, case queue/detail/assignment/decision, reversible user
  restrictions, venue candidate queue/detail/approve/reject/merge, bounded audit search и exact-case break-glass.
- Центральный deny-by-default registry фиксирует capabilities четырёх `PlatformRole`; wildcard и динамических
  разрешений нет. Каждая операция восстанавливает отдельную `picklehub-admin` session, проверяет активный grant,
  MFA-backed session timestamps, idle/absolute TTL, user security epoch и capability. Player bearer не принимается.
  Role revoke в одной транзакции отзывает admin sessions и увеличивает security epoch, поэтому кешированная сессия
  не сохраняет прежние права.
- Sensitive role, break-glass, venue merge и broad/permanent restriction требуют re-auth не старше пяти минут и
  одноразового HMAC confirmation proof, связанного с actor/action/target и погашаемого fail-closed через Redis.
  Все browser mutations также проходят существующую Origin/CSRF-защиту. Redis rate limits ограничивают exact user
  lookup, очереди, audit search и мутации; недоступность rate limiter закрывает административный доступ.
- User lookup принимает только один exact UUID/receipt/email/Telegram subject из POST body, использует существующий
  keyed identity index, не сохраняет raw lookup и возвращает минимальную account projection. Masked identity
  раскрывается только для `SUPPORT`. Списки имеют максимум 100 строк, allowlisted filters, snapshot и подписанный
  actor/role/query-bound cursor; audit interval ограничен 31 сутками, export route отсутствует.
- Case detail повторно проверяет assignment/no-conflict либо активный break-glass ровно для case. Superadmin role
  сама по себе не раскрывает narrative; разрешённые и запрещённые case reads аудируются. Case decision создаёт
  versioned decision/effect, terminal signal state, outbox и minimal admin audit атомарно. Break-glass не даёт
  decision capability.
- Venue approve/reject и explicit survivor/duplicate merge используют expected revision/state guard. Публикация,
  provenance relink, canonical alias, moderation decision, outbox и audit находятся в одной serializable transaction.
  User restriction создаётся только из решения по тому же subject, отзывается новой revision без hard delete, а
  platform-wide restriction также отзывает player sessions.
- Каждая мутация получает UUIDv4 idempotency key. Encrypted 24-hour operation receipt возвращает сохранённый ответ
  при безопасном replay и не повторяет effect/audit. Domain mutation, outbox, administration-shaped append-only
  audit и receipt коммитятся одной serializable transaction; исключение audit откатывает изменение и поднимает
  `ADMIN_AUDIT_WRITE_FAILED` alert. Operational metrics/alerts имеют только role/action/object/outcome/age labels;
  добавлены alerts для queue age, audit failure и пяти повторных authorization denials без actor/target IDs.
- `AuditService` расширен уже предусмотренными nullable `operationId`/`policyVersion`; `TrustSafetyCryptoService`
  экспортирован узко для авторизованной расшифровки case card. Добавлены unit tests fixed policy/no wildcard,
  actor-bound cursor, operational alerts и немедленного session invalidation по revoked grant/security epoch.
- При воспроизводимой генерации обнаружен оставшийся после этапа 02 stale generated type exact email
  (`AdminExactIdentity` вместо source-of-truth `EmailInput`). `openapi.yaml` и оба generated TypeScript клиента
  обновлены только командой `npm run contracts:generate`; TypeSpec source не менялся.

### Проверки этапа admin backoffice 03-backend

- Обычный `npm run prisma:generate --workspace=@picklehub/backend` не смог загрузить checksum schema engine из-за
  restricted network (`ENOTFOUND claude-fwd.raiffeisen.ru`). Повтор с локально доступными
  `PRISMA_SCHEMA_ENGINE_BINARY` и `PRISMA_QUERY_ENGINE_LIBRARY` успешно сгенерировал Prisma Client v6.16.2 из
  принятой схемы; внешняя сеть не использовалась.
- Backend targeted: `npm run lint --workspace=@picklehub/backend`, `npm run typecheck --workspace=@picklehub/backend`,
  `npm test --workspace=@picklehub/backend -- --runInBand` и `npm run build --workspace=@picklehub/backend` —
  успешно; 27/27 suites и 66/66 tests.
- `npm run contracts:lint` — успешно: TypeSpec/OpenAPI/allowlist и 78/78 contract/data/privacy tests. Первый
  `contracts:generated:check` корректно обнаружил stale generated exact-email reference; после штатного
  `npm run contracts:generate` команды `contracts:generated:check`, `contracts:typecheck`, `contracts:breaking` и
  отдельный `contracts:mock:check` успешны.
- Полная monorepo-регрессия `npm run lint`, `npm run typecheck`, `npm test` и `npm run build` успешна для восьми
  workspaces. Backend — 27 suites/66 tests, API client — 6 tests, web — 7 suites/30 tests, TMA — 6/21; production
  PWA и отсутствие TMA development mock подтверждены. Сохраняются прежние неблокирующие warnings о web/TMA
  bundles около 531/578 kB и MapLibre chunk 924 kB.
- `npm run format:check` и `npm run docs:check` до финальной записи журнала успешны: восемь TypeSpec sources и 122
  Markdown files. Финальные повторы после журнала перечислены ниже.
- `npm run test:integration --workspace=@picklehub/backend -- --runInBand` запущен, но runtime suite не выполнен:
  sandbox запретил соединение с Redis `127.0.0.1:6379` (`EPERM`), а PostgreSQL calls завершились ошибками
  Prisma connection. Поэтому применение migration, DB constraints, audit rollback и конкурентные admin transitions
  должны быть подтверждены PostgreSQL/Redis CI; их локальный успех не заявляется.
- Локально исполнимые критерии backend выполнены. Production bootstrap первого superadmin, реальная MFA/re-auth
  ceremony, security notification/post-review для break-glass и on-call delivery alerts остаются эксплуатационными
  gates и не выдаются за проверенные. Следующий промпт — `llm/08-admin-backoffice/04-tma-web.md`; к нему не переходили.

## 2026-09-11 — административная панель, этап 04-tma-web

- Активный промпт: `llm/08-admin-backoffice/04-tma-web.md`. В `frontend/web` добавлена отдельная ветка `/admin` с
  собственными защищёнными layout, маршрутизацией и визуальным контуром. Обычная player-сессия не используется:
  сотрудник вводит credential отдельной admin audience, после чего UI получает текущую роль и точный список
  capabilities из `GET /admin/session`. Credential, bearer и CSRF остаются только в замыканиях памяти вкладки,
  не попадают в URL/localStorage/sessionStorage и очищаются при 401, `pagehide` и явном выходе.
- Deep link сохраняется до успешной повторной аутентификации. Все admin fetch используют `cache: no-store`,
  `credentials: include`, bearer admin credential и для мутаций CSRF/idempotency. Выход размонтирует restricted
  response state, заменяет текущую history entry на `/admin/access`; возврат страницы из bfcache также теряет
  credential и требует новый вход. Admin surfaces не отправляют продуктовую аналитику.
- Реализованы доступные очереди и allowlisted filters обращений и площадок, detail обращения с policy-controlled
  narrative/responses/appeal, назначение и решение, exact user lookup через POST body, создание ограничения,
  сравнение venue candidate с nearby canonical IDs, approve/reject/merge и bounded audit search. Таблицы имеют
  caption, заголовки и горизонтальный fallback; loading/empty/error/offline состояния сообщаются семантически.
- Все мутации передают server revision, closed reason и policy version. Решение по обращению, venue decision,
  merge и user restriction имеют отдельный confirmation dialog; merge и sensitive restriction принимают
  одноразовый server-issued confirmation proof. `REVISION_CONFLICT` не показывает ложный успех и предлагает
  загрузить свежую версию.
- `maskedIdentity` показывается только в минимизированной backend projection; raw email/Telegram exact lookup
  очищается из формы после ответа и никогда не помещается в URL. Editor и Ads manager не получают safety routes
  или navigation, а visibility controls дополняют, но не заменяют backend authorization.
- TMA не менялся и не импортирует admin source. Production bundle scan подтвердил отсутствие строк
  `Вход для сотрудников`, `Операционная панель` и `ADMIN_SESSION_ACCESS` в TMA build; отдельный browser scenario
  требует 404 на `/admin` в TMA. Изменённые файлы: `frontend/web/src/app.tsx`, `frontend/web/src/admin-client.ts`,
  `frontend/web/src/admin-ui.tsx`, `frontend/web/src/admin-ui.test.tsx`, `frontend/web/src/styles.css`,
  `test/e2e/admin.spec.ts` и этот журнал.

### Проверки этапа admin backoffice 04-tma-web

- Targeted `npm run lint --workspace @picklehub/web`, `npm run typecheck --workspace @picklehub/web`,
  `npm test --workspace @picklehub/web -- --run src/admin-ui.test.tsx` и
  `npm run build --workspace @picklehub/web` — успешно. Admin component suite: 8/8 tests; полный web regression:
  8/8 файлов и 38/38 tests. Production PWA manifest/service worker присутствуют; остаётся неблокирующее
  предупреждение Vite о web main bundle около 565 kB и MapLibre chunk 924 kB.
- `npm run test:e2e:typecheck` и `npm run test:e2e:build` — успешно для всех browser specs и production web/TMA
  clients. Read-only scan `/private/tmp/picklehub-e2e-tg` подтвердил отсутствие admin markers; web build содержит
  ожидаемый admin route.
- `npx playwright test test/e2e/admin.spec.ts` обнаружил шесть сценариев: capability navigation для всех четырёх
  ролей, deep-link re-auth/очистка restricted content и отсутствие admin route в TMA. Все шесть остановились до
  первого test step: sandbox завершил local Chrome с `SIGABRT`, cleanup получил `kill EPERM`. Browser assertions
  должны пройти в Playwright CI и не заявляются успешными локально.
- Полный `npm run verify` — успешно: восемь workspaces/один lockfile, TypeSpec/Redocly, 78/78 contract/data/privacy
  tests, compatibility/generated drift/typecheck, OpenAPI mock, format/docs, lint, strict typecheck, tests и
  production build. Backend: 27/27 suites и 66/66 tests; Web: 8/38; TMA: 6/21; API client: 1/6.
- После записи журнала `npm run format:check`, `npm run docs:check`, `npm ls --depth=0` и `git diff --check`
  повторены успешно; unmet/extraneous dependencies и whitespace errors отсутствуют. Следующий промпт —
  `llm/08-admin-backoffice/05-verification.md`; к нему не переходили.

## 2026-09-11 — административная панель, этап 05-verification

- Активный промпт: `llm/08-admin-backoffice/05-verification.md`. Добавлен
  `llm/_docs/admin-backoffice-verification.md` с threat model, точной матрицей 17 admin operations для четырёх
  platform roles, player bearer и гостя, правилами audit/rollback, браузерными границами, прослеживаемостью тестов и
  остаточными production gates.
- Новая controller-boundary suite `administration-authorization.spec.ts` систематически проверяет все операции:
  guest/player всегда получают session denial, а каждая platform role проходит только capability из fixed registry.
  Всего 86 scenarios, включая доказательство audit известного admin actor при прямом capability denial. Тест не
  открывает локальный socket и поэтому воспроизводим в restricted sandbox.
- Верификация обнаружила, что capability denial для известной admin role ранее создавал только безопасную метрику,
  хотя требования требуют audit. Controller теперь fail-closed вызывает `auditAuthorizationDenied`; append-only
  запись использует capability-specific action `*_DENIED`, admin session как opaque target, outcome `DENIED`,
  request/correlation и пустой changed-field allowlist. Guest/player отклоняются до появления подтверждённого actor.
- Для конкурентных serializable admin mutations Prisma `P2034` теперь стабильно отображается в
  `REVISION_CONFLICT`. Unique conflict `P2002` по умолчанию также является stale/revision conflict; только создание
  активного role grant явно возвращает `CONFLICTING_ACTIVE_GRANT`. Это не позволяет гонке moderator masquerade как
  audit outage или ошибка grant.
- Добавлена PostgreSQL/Redis integration suite `administration-verification.integration-spec.ts`: ровно одно из двух
  конкурентных решений, stale retry без второго audit/receipt/event, минимальный/неизменяемый audit и rejection
  narrative metadata, создание/снятие restriction как revision, полный rollback venue merge при rejected audit и
  немедленная инвалидизация session/security epoch после role revoke.
- Новый `administration-verification-policy.test.mjs` включён в `contracts:lint`: он сравнивает все generated OpenAPI
  roles с reviewed matrix, проверяет capability boundary и denied audit, единый audited transaction wrapper,
  serialization mapping, DB guards, `no-store`/отсутствие admin Workbox cache и отсутствие admin implementation в
  TMA source.
- Browser suite исправлена по source-of-truth matrix: venue moderation принадлежит `MODERATOR`, а не
  `SUPERADMIN`; moderator также получает согласованные lookup/audit capabilities. Добавлены Back/Forward/reload
  assertions после logout и полностью клавиатурный deep-link login. TMA 404 сохранился.

### Проверки этапа admin backoffice 05-verification

- `npm run verify` — успешно полностью: восемь workspaces, TypeSpec/Redocly, compatibility/generated drift,
  OpenAPI mock, format/docs, lint, strict typecheck, unit/component tests и production builds. Contract/data/privacy
  набор — 84/84 tests; backend — 28/28 suites и 152/152 tests; web — 8/8 suites и 38/38 tests; TMA — 6/6 и 21/21;
  API client — 6/6. Сохраняются неблокирующие bundle warnings: web/TMA около 565/578 kB и MapLibre 924 kB.
- Targeted проверки `node --test contracts/scripts/administration-policy.test.mjs
contracts/scripts/administration-data-policy.test.mjs
contracts/scripts/administration-verification-policy.test.mjs` — 14/14; отдельная verification policy — 6/6.
  `npm test --workspace=@picklehub/backend -- --runInBand
backend/test/unit/administration-authorization.spec.ts` — 86/86. Backend lint/typecheck и web admin component
  tests — успешно; `npm run test:e2e:typecheck` и production `npm run test:e2e:build` — успешно.
- Первый socket-based вариант новой unit matrix запускался через Supertest, но sandbox эпизодически запретил
  ephemeral listen (`EPERM 0.0.0.0`). Suite переведена на ту же реальную controller/capability boundary без socket;
  после этого полный unit regression зелёный. Первые targeted lint/static запуски также нашли assertion syntax,
  enum typing и одну запрещённую non-null assertion; тесты исправлены без ослабления проверок.
- `npm run test:integration --workspace=@picklehub/backend -- --runInBand
backend/test/integration/administration-verification.integration-spec.ts` обнаружил все 5 tests, но ни один не
  дошёл до fixture: sandbox запретил PostgreSQL/Redis loopback (`EPERM`, в том числе `127.0.0.1:6379`). Поэтому
  конкурентный runtime, DB rollback/immutability и session revoke должны пройти в PostgreSQL/Redis CI; локальный
  успех не заявляется.
- `npx playwright test test/e2e/admin.spec.ts` после успешных typecheck/build обнаружил 7 scenarios, включая новый
  keyboard и history test, но Chrome во всех случаях завершился до первого шага с `SIGABRT`, а cleanup получил
  `kill EPERM`. Browser assertions должны пройти в Playwright CI и не заявляются успешными локально.
- Финальный повтор `npm run verify` после записи журнала дошёл до `contracts:mock:check` и один раз остановился на
  sandbox bind `listen EPERM 127.0.0.1`; отдельный повтор `npm run contracts:mock:check` успешно проверил все mock
  группы. Оставшаяся финальная цепочка `format:check`, `docs:check`, `lint`, `typecheck`, `test`, `build` повторно
  прошла для восьми workspaces; backend сохранил 28/28 suites и 152/152 tests.
- Остаточные риски: production MFA/WebAuthn, bootstrap/independent approval evidence, break-glass notification и
  post-review, on-call alert delivery, backup/restore/retention execution, data residency и legal approval остаются
  эксплуатационными gates. Следующий промпт — `llm/09-clubs/01-requirements.md`; к нему не переходили.

## 2026-09-11 — клубы, этап 01-requirements

- Активный промпт: `llm/09-clubs/01-requirements.md`. Изменения ограничены продуктовыми требованиями, доменной и
  архитектурной границей, privacy/retention и аналитикой. TypeSpec/AsyncAPI, Prisma, backend, worker и клиенты не
  менялись и не выдаются за реализованные.
- Определены 14 пользовательских историй и 14 сценариев «Дано/Когда/Тогда»: создание/изменение/поиск, три пути
  вступления, заявки и приглашения, выход/исключение/club block, передача ownership и роли, площадки, клубные
  матчи/будущие турниры, серии и archive/restore. Зафиксированы отдельные lifecycle клуба, membership, request,
  invitation, block, recurring rule и materialized match.
- Клуб создаётся атомарно с единственным `OWNER` и может иметь ноль площадок. Transfer одновременно назначает
  активного target владельцем и понижает прежнего owner до admin; выход, исключение или понижение текущего owner до
  transfer запрещены. Инвариант ровно одного owner, unique membership и конкурентные переходы должны защищаться БД.
- Scoped `OWNER`/`ADMIN`/`MEMBER` отделены от `SUPERADMIN`/`MODERATOR`/`EDITOR`/`ADS_MANAGER`: ни platform role, ни
  organizer другого агрегата не получает club capability. Platform moderation остаётся отдельным аудированным
  действием без impersonation; club admin не получает venue moderation или platform administration.
- Политики `OPEN`, `APPROVAL`, `INVITE_ONLY` создают соответственно membership, pending request или требуют
  адресного invite. Pending intent прав не даёт; accept/reject/cancel/revoke/expire/supersede terminal, replay не
  создаёт второго membership. Club block закрывает повторные intents, а снятие не восстанавливает старое состояние.
- `ClubVenue` закреплена как необязательная many-to-many ссылка на public canonical venue без передачи владения.
  Unlink/merge/deletion не удаляет клуб или готовые события; недоступная обязательная venue приостанавливает только
  будущую генерацию зависимого правила. Клуб остаётся валидным и доступным в поиске без площадок.
- Клубный матч принадлежит `matches` и имеет реального user-organizer. Серия — timezone-aware bounded generator:
  каждая календарная позиция идемпотентно создаёт отдельный match с собственной вместимостью, roster, очередью,
  гостями, lifecycle и результатом; membership/прошлая встреча не записывает игрока в следующую автоматически.
  Archive закрывает новые действия и генерацию без backlog или неявной отмены materialized matches.
- Метрики формализованы: active clubs за rolling 28 days, раздельная membership conversion для open/request/invite,
  unique confirmed club matches и fill snapshot recurring occurrence на scheduled start. Creator-owner/replay не
  входят в конверсию, pending/waitlist не входят в fill, recurring match не удваивает общий match count. Behavioral
  events зависят от consent и не содержат IDs, token, member graph, reason text, координаты или точное расписание.
- При удалении аккаунта последнего owner identity lifecycle не блокируется: клуб архивируется, credentials и
  публичная projection отзываются, а минимальная псевдонимизированная ownership-ссылка сохраняет governance history
  без выдачи platform staff членства. Recovery с согласием нового owner и окончательные retention/legal правила
  оставлены явным последующим gate, а не выдуманной автоматической передачей.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`, `llm/_docs/architecture.md`,
  `llm/_docs/security-privacy.md`, `llm/_docs/analytics-plan.md` и этот журнал.

### Проверки этапа clubs 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/analytics-plan.md
llm/_docs/architecture.md llm/_docs/domain-model.md llm/_docs/security-privacy.md` — успешно; после уточнения
  историй и identity deletion повторно отформатированы затронутые requirements/analytics/security документы.
- `npm run verify` — успешно полностью: восемь workspaces/один root lockfile; TypeSpec compile, Redocly,
  compatibility/generated drift/typecheck и OpenAPI mock; format/docs; lint, strict typecheck, tests и production
  build. Contract/data/privacy набор — 84/84 tests; backend — 28/28 suites и 152/152 tests; web — 8/8 suites и
  38/38 tests; TMA — 6/6 и 21/21; API client — 6/6. Сохраняются прежние неблокирующие bundle warnings web/TMA
  около 565/578 kB и MapLibre 924 kB.
- `git diff --check`, `npm ls --depth=0` и read-only Node.js-проверка относительных Markdown-ссылок по списку
  `rg --files -g '*.md'` — успешно: whitespace errors и unmet/extraneous dependencies отсутствуют, проверено 111
  ссылок без отсутствующих целей.
- После записи журнала повторены `npm run format:check`, `npm run docs:check`, проверка Markdown-ссылок,
  `npm ls --depth=0` и `git diff --check` — успешно: 123 Markdown-файла и 111 относительных ссылок проверены,
  dependency tree и whitespace чисты.
- Критерии этапа выполнены на уровне требований: ноль площадок допустимы, клуб не остаётся без owner, club/platform
  admin разделены, членских платежей нет. Точные enum/TTL, recurring horizon, wire events и SQL guards принадлежат
  следующему промпту `llm/09-clubs/02-contract-data.md`; к нему не переходили.

## 2026-09-11 — клубы, этап 02-contract-data

- Активный промпт: `llm/09-clubs/02-contract-data.md`. Добавлен TypeSpec source `contracts/rest/clubs.tsp`: 36
  операций на 30 paths для публичного поиска/карточки, CRUD через create/read/update и обратимый archive/restore,
  scoped roster/roles/ownership, join requests, адресных invitations, leave/exclude/block, optional venue links,
  обычного club-attributed match и recurring rules/occurrences. Tournament API, backend use cases, UI, платежи,
  членские взносы и club XP не создавались.
- Поиск и публичная карточка детерминированы и сохраняют клуб без площадок. Остальные reads требуют player bearer,
  а мутации дополнительно требуют Origin/CSRF, UUIDv4 idempotency key и expected club/resource revision. Platform
  roles не появляются в club DTO. Hard delete клуба отсутствует; archive/restore, ownership/role, exclusion и block
  имеют закрытые причины. Invitation адресовано user ID, raw capability не менее 128 бит возвращается один раз,
  хранится только keyed hash и истекает ровно через семь суток.
- Prisma schema и additive migration `20260912120000_clubs_contract_data` добавляют `Club`, интервальные
  `ClubMembership`, `ClubJoinRequest`, `ClubInvitation`, `ClubBlock`, optional `ClubVenue`, `RecurringMatchRule`,
  immutable `RecurringMatchOccurrence`, encrypted 24-hour operation receipt и append-only governance audit. Все
  сущности живут в общей PostgreSQL schema; отдельных tenant database/credentials нет.
- Partial unique indexes запрещают второе active membership и второго active owner. Deferred constraint triggers на
  корне и membership требуют ровно одного owner на commit, поэтому создание клуба и transfer атомарны, а промежуточные
  ноль/два владельца не наблюдаемы. Terminal membership intents не переоткрываются, active club block и archive
  запрещают новые intents, FK используют `RESTRICT`, а venue link принимает только опубликованную canonical venue.
- `matches` расширен nullable club source: обычная club attribution хранит club ID, recurring attribution — club/rule/
  occurrence IDs. Reciprocal deferred constraints связывают одну immutable calendar position ровно с одним match;
  после публикации attribution неизменяема. Rule не хранит roster, участников, очередь или общую вместимость.
- Стартовая recurring policy: `WEEKLY`, interval 1–12 недель, уникальные ISO weekdays, horizon ровно 42 суток,
  local wall time, IANA timezone, tzdata version, gap=`SKIP` и явный overlap=`EARLIER_OFFSET`/`LATER_OFFSET`.
  Уникальный ключ `rule + YYYY-MM-DDTHH:mm` занимает также DST/pause skip marker. SQL resolver перебирает допустимые
  UTC offsets, детерминированно выбирает overlap и отвергает несогласованный UTC instant; monotonic watermark не
  позволяет resume/restore достроить backlog.
- AsyncAPI получил internal transactional-outbox channel `club.events.v1` с шестью событиями. Каждое содержит
  `clubId`, opaque aggregate IDs, версии и закрытые состояния; user/invitee/organizer ID, capability token, имя,
  описание/locality, member graph, координаты, roster, reason и exact schedule запрещены policy test. OpenAPI и оба
  TypeScript-клиента обновлены только через `npm run contracts:generate`; representative Prism smoke включает clubs.
- Добавлен `llm/_docs/clubs-data-policy.md`, обновлены domain model и contract README. Новые contract/data policy
  tests проверяют surface/authorization/no-store, privacy событий, обязательные модели, отсутствие hard-delete,
  owner/membership uniqueness, terminal intents, secret storage, archive/block guards, DST resolver, horizon и
  reciprocal match source.

### Проверки этапа clubs 02-contract-data

- Первичная TypeSpec-проверка нашла invalid regex escaping, неподдерживаемый `@uniqueItems` и конфликт path
  `requestId` с request header; исправлено. Первый Redocly lint нашёл 21 operation без description; для каждой
  добавлено описание. Targeted club policy/data tests после исправления enum dereference — 7/7 успешно.
- `npm run contracts:check` прошёл TypeSpec, Redocly, allowlists/privacy и 91/91 contract/data tests; compatibility с
  `HEAD`, reproducible generated artifacts и strict generated typecheck успешны. Завершающий mock один раз получил
  sandbox `listen EPERM 127.0.0.1`; отдельный `npm run contracts:mock:check` успешен, включая club search.
- `npm run format:check` и `npm run docs:check` успешны для девяти TypeSpec sources и 124 Markdown files. `npm run
lint`, `npm run typecheck`, `npm test` и `npm run build` успешны для восьми workspaces. Backend regression — 28/28
  suites и 152/152 tests; API client — 6/6, web — 8 suites/38 tests, TMA — 6/21. Production PWA и отсутствие TMA
  development mock подтверждены; остаются прежние неблокирующие warnings о web/TMA bundles около 565/578 kB и
  MapLibre 924 kB.
- `npm run workspace:check`, `npm ls --depth=0` и `git diff --check` успешны: восемь workspaces, один root lockfile,
  unmet/extraneous dependencies и whitespace errors отсутствуют.
- `npx prisma format` и `npx prisma validate --schema backend/prisma/schema.prisma` не смогли получить schema engine:
  restricted network завершился `ENOTFOUND claude-fwd.raiffeisen.ru`. Runtime migration/constraint tests также не
  запускались: sandbox запретил Docker daemon socket (`operation not permitted`), а `psql`/`pg_isready` отсутствуют.
  Поэтому применение SQL, deferred owner transfer и DST constraints должны пройти в PostgreSQL CI; их локальный
  runtime-успех не заявляется. Статические data-policy tests и вся доступная contract/TypeScript regression зелёные.
- Локально исполнимые критерии prompt выполнены: клуб без площадки моделируется без `venue_id`, ownership transfer
  защищён deferred DB invariant, DST gap/overlap фиксируются явной политикой и уникальной local calendar position,
  generated client проходит проверки. Следующий prompt — `llm/09-clubs/03-backend.md`; к нему не переходили.

## 2026-09-11 — клубы, этап 03-backend

- Активный промпт: `llm/09-clubs/03-backend.md`. Добавлен NestJS-модуль `clubs` и подключён к API/worker. Реализованы
  все опубликованные club routes: поиск/карточка/изменение/archive/restore, scoped roster, открытое вступление и
  заявки, адресные приглашения, leave/exclude/block, роли и атомарная передача владения, optional canonical venue
  links, обычные club-attributed matches и управление recurring rules/occurrences.
- Каждая защищённая операция повторно читает активное membership именно данного клуба и применяет фиксированную
  матрицу `OWNER` / `ADMIN` / `MEMBER`; platform role и чужой club membership не используются. Команды проходят
  Origin/CSRF, rate limit, UUIDv4 idempotency и serializable transaction. Encrypted 24-hour receipts не сохраняют
  raw invitation capability; HTTP logging маскирует capability как в preview, так и в accept/decline path.
- Membership/request/invitation переходы сериализуются блокировкой club root и optimistic club/resource revision.
  Pending intent не выдаёт права, принятие адресного invite атомарно supersede-ит pending request, block завершает
  membership/intents, а owner не может выйти или быть исключён. Governance audit пишет только разрешённые
  миграцией закрытые действия и reason codes; outbox payload соответствует минимизированным club event schemas.
- `MatchService.create` получил необязательный внутренний club source и заранее выбранный match ID. Обычный club
  match и recurring generator используют этот существующий сценарий, включая onboarding, roster, match audit и
  outbox; match lifecycle не дублируется в clubs. Club membership не копируется в roster встречи.
- Worker раз в час обрабатывает bounded набор правил до rolling horizon 42 суток. Calendar key и unique constraint
  делают retry идемпотентным; watermark монотонный. Локальное время разрешается независимо от server timezone:
  spring gap записывается `SKIPPED_DST_GAP`, overlap выбирает явно ранний/поздний offset. Pause, archive, отсутствие
  manager capability или недоступная/unlinked venue дают неизменяемый `SKIPPED_PAUSE`; готовые matches не меняются.
- Добавлены unit tests role policy и часовых поясов (`Europe/Berlin` gap/overlap, `Europe/Moscow`, fractional
  `Asia/Kathmandu`) и PostgreSQL integration suite для конкурентного open join, owner transfer/last-owner guard,
  повторного запуска генератора и запрета materialized matches архивного клуба.
- Изменённые файлы: новый `backend/src/clubs/`, `backend/src/app.module.ts`, `backend/src/worker.module.ts`,
  `backend/src/matches/match.service.ts`, HTTP logging middleware/test, два club unit test и
  `backend/test/integration/clubs-backend.integration-spec.ts`. TypeSpec, AsyncAPI, Prisma schema и contract
  migration этапа 02 не менялись.

### Проверки этапа clubs 03-backend

- `PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true npx prisma generate --schema
backend/prisma/schema.prisma` — успешно, Prisma Client 6.16.2 сгенерирован локально без изменения tracked
  artifacts.
- `npm run lint --workspace @picklehub/backend`, `npm run typecheck --workspace @picklehub/backend`, `npm test
--workspace @picklehub/backend -- --runInBand` и `npm run build --workspace @picklehub/backend` — успешно;
  backend unit regression: 30/30 suites и 161/161 tests.
- `npm run verify` — успешно полностью: восемь workspaces/один lockfile; TypeSpec/Redocly, policy для 151 REST
  operations и 51 messages, 91/91 contract/data/privacy tests, compatibility/generated drift/typecheck, OpenAPI
  mock, format/docs, lint, strict typecheck, tests и production builds. Backend — 30/161; web — 8/38; TMA — 6/21;
  API client — 1/6. Сохраняются прежние неблокирующие warnings о web/TMA bundles около 565/578 kB и MapLibre
  924 kB, а внешнее окружение по-прежнему задаёт `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `npm run test:integration --workspace @picklehub/backend -- --runInBand
test/integration/clubs-backend.integration-spec.ts` обнаружил три сценария, но общий setup не смог создать venue:
  локальное окружение не предоставило пригодное итоговое состояние PostgreSQL; параллельно sandbox запрещает Redis
  socket (`connect EPERM 127.0.0.1:6379`). Поэтому runtime assertions конкурентного membership/ownership и
  recurring idempotency должны пройти после `prisma migrate deploy` в PostgreSQL/Redis CI; их локальный успех не
  заявляется. Unit timezone assertions и статические SQL constraints зелёные.
- `npm ls --depth=0`, `git diff --check`, финальные `npm run format:check` и `npm run docs:check` — успешно;
  unmet/extraneous dependencies и whitespace errors отсутствуют.
- Повторный `npm run verify` после финальной минимизации invitation path остановился в `contracts:mock:check` на
  sandbox `listen EPERM 127.0.0.1`; TypeSpec, Redocly, 91 contract tests, compatibility, generated drift и contract
  typecheck до него прошли. Этот же полный verify ранее в сессии был успешен, а после финальных backend-правок
  отдельно успешно повторены backend lint/typecheck/targeted tests/build, format/docs и `git diff --check`.
- Локально исполнимые критерии prompt выполнены; обязательный runtime PostgreSQL integration остаётся
  environment-blocked, а не отмечен успешным. Следующий prompt — `llm/09-clubs/04-tma-web.md`; к нему не переходили.

## 2026-09-12 — клубы, этап 04-tma-web

- Активный промпт: `llm/09-clubs/04-tma-web.md`. В web/PWA и TMA добавлены одинаковые маршруты поиска,
  создания и публичной карточки клуба, защищённый invitation deep link и отдельный club-scoped контур управления.
  Публичный поиск фильтрует по названию/городу, показывает пустую выдачу и явно сохраняет валидное состояние клуба
  без площадок. Успешная первая страница отправляет consent-gated `club_search_completed` только с разрешёнными
  bucket/filter/channel, без текста запроса, club ID или member graph.
- Карточка показывает профиль, политику, archive/offline/stale/error/success состояния, связанные canonical venue и
  доступные материализованные встречи. Встреча из серии явно отделена от шаблона: у неё собственный roster и
  вместимость, а pause/resume/end серии не обещают изменить уже созданные матчи. Из-за отсутствия в принятом
  контракте публичной выдачи обычных клубных матчей карточка не синтезирует её на клиенте и даёт ссылку на общий
  публичный поиск матчей; manager видит occurrence links из авторизованного endpoint.
- Owner/admin поверхности включают изменение профиля и membership policy, archive/restore, roster и роли,
  атомарную передачу ownership, leave/exclude/club-block, решения по заявкам, создание/отзыв адресных приглашений,
  link/unlink площадок, разовую клубную встречу и создание/pause/resume/end повторяющихся правил. Видимость controls
  остаётся только UX: каждый вызов идёт в защищённый backend route с bearer, CSRF, idempotency и server revision;
  компонентный тест отдельно подтверждает, что backend 403 показывается пользователю, а 409 требует свежие данные.
- Invitation capability остаётся только в path и защищённом request, не попадает в текст страницы/analytics;
  `no-referrer` сохранён. Экран сначала получает адресный invite, затем актуальную public club version, необходимую
  контракту решения. Неавторизованный deep link сохраняется как allowlisted relative `next` через вход; произвольный
  redirect не принимается. Мутации выключены offline и не показывают ложный optimistic success.
- Handwritten API client расширен типизированными club methods поверх generated OpenAPI types; generated source не
  редактировался. Добавлены по четыре component scenarios для каждого клиента и четыре browser scenarios для
  публичного/deferred-auth deep link parity. Изменённые файлы: `frontend/packages/analytics/src/index.ts`,
  `frontend/packages/api-client/src/index.ts`, `frontend/web/src/{app,clubs-ui,clubs-ui.test,styles}.tsx/css`,
  соответствующие TMA-файлы, `test/e2e/clubs.spec.ts` и этот журнал.

### Проверки этапа clubs 04-tma-web

- Targeted lint/typecheck для `@picklehub/analytics`, `@picklehub/api-client`, `@picklehub/web`, `@picklehub/tg` —
  успешно. `npm test --workspace @picklehub/web -- --run src/clubs-ui.test.tsx` и аналогичная TMA-команда — по 4/4
  tests; production builds web/TMA успешны, PWA manifest/service worker присутствуют, TMA development mock
  отсутствует. Сохраняются неблокирующие bundle warnings: web около 590 kB, TMA около 602 kB и MapLibre 924 kB.
- Полная доступная регрессия `npm run format:check`, `npm run docs:check`, `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run build` — успешно для восьми workspaces. Backend — 30/30 suites и 161/161 tests; web — 9/9
  suites и 42/42 tests; TMA — 7/7 и 25/25; API client — 1/1 и 6/6. После добавления analytics taxonomy отдельно
  повторены все targeted checks, component tests и production client builds.
- Contract portion полного `npm run verify` прошёл TypeSpec/Redocly, policy для 151 REST operations и 51 messages,
  91/91 contract/data/privacy tests, breaking/generated drift и typecheck. `contracts:mock:check` дважды не смог
  открыть loopback listener: sandbox вернул `listen EPERM 127.0.0.1`; поэтому полный wrapper завершился там, а все
  последующие format/docs/lint/typecheck/test/build команды были запущены отдельно и успешны.
- `npm run test:e2e:typecheck` и `npm run test:e2e:build` успешны. `npx playwright test test/e2e/clubs.spec.ts`
  обнаружил четыре сценария для web/TMA, но каждый остановился до первого test step: local Chrome завершился с
  `SIGABRT`, cleanup получил `kill EPERM`. Public club/invitation browser assertions должны пройти в Playwright CI
  и не заявляются успешными локально.
- `git diff --check` успешен. Локально исполнимые критерии промпта выполнены; следующий промпт —
  `llm/09-clubs/05-verification.md`, к нему не переходили.

## 2026-09-12 — клубы, этап 05-verification

- Активный промпт: `llm/09-clubs/05-verification.md`. Добавлен `llm/_docs/clubs-verification.md` с моделью угроз,
  матрицей membership/authorization/recurrence/venue/end-to-end сценариев, привязкой к исполняемым тестам и
  честными production gates. Следующий feature prompt не начинался.
- Unit authorization усилена точной проверкой `clubId + userId + ACTIVE`; source policy запрещает platform-role
  shortcuts в club boundary и проверяет owner/admin matrix, root locking, SQL uniqueness/deferred owner constraint,
  terminal intents, DST/calendar key и immutable club attribution.
- PostgreSQL integration suite расширена с 3 до 8 сценариев: все три membership policy; гонка approval против
  invitation acceptance; pending intent без roster access; межклубный отказ; leave/block и сохранение истории;
  last-owner/transfer; duplicate recurring run, archive и независимая отмена встречи; canonical venue merge без
  переписывания исторического match; сквозной путь `join club → recurring match → join/start → result → confirm`.
- Исправлена public venue projection: merged link разрешается в опубликованный canonical survivor, совпавшие ссылки
  дедуплицируются, CLOSED/непубличная ссылка без survivor скрывается. Search по survivor находит клуб через alias;
  исходная `ClubVenue` и `Match.venueId` не переписываются и venue не удаляется. Добавлена socket-free unit проверка.
- Добавлен внутренний `ClubMetricsService`: total и закрытые `origin/format` buckets считаются только из уникальных
  `MatchMetricMarker(CONFIRMED_MATCH)` с club attribution. Proposal, dispute, mutable match state, analytics consent
  и provider delivery не являются источником; recurring match входит в общий total один раз.
- Изменённые файлы: `backend/src/clubs/{club.service,clubs.module,club-metrics.service}.ts`, club unit/integration
  tests, `contracts/scripts/clubs-verification-policy.test.mjs`, root `package.json`,
  `llm/_docs/clubs-verification.md` и этот журнал. TypeSpec, OpenAPI/AsyncAPI, generated clients, Prisma schema и
  migrations не менялись.

### Проверки этапа clubs 05-verification

- Первый targeted backend lint завершился одной новой ошибкой `@typescript-eslint/unbound-method` в assertion;
  тест переписан с локальным spy. Повторные `npm run lint --workspace @picklehub/backend`, `npm run typecheck
--workspace @picklehub/backend`, unit tests и backend build успешны.
- Backend unit regression до финального venue unit: 31/31 suites и 164/164 tests. После его добавления targeted
  `club-policy`, `club-timezone`, `club-metrics`, `club-venue-projection` — 4/4 suites и 12/12 tests; lint и strict
  typecheck повторно успешны.
- Первый targeted club policy запуск: 11/12 успешно, один verifier assertion ошибочно находил слово `analytics` в
  комментарии production service. Проверка уточнена до запрета `match.state`; повторный club contract/data/
  verification набор — 12/12 успешно. В полном contract lint новый verifier вошёл в общие 96/96 tests.
- `npm run verify` успешно полностью: 8 workspaces/один lockfile; TypeSpec и Redocly; policy для 151 REST operations
  и 51 messages; 96/96 contract/data/privacy/verification tests; breaking/generated drift/typecheck; OpenAPI mock;
  format/docs; lint; strict typecheck; tests и production builds. На момент полного запуска backend — 31/164,
  web — 9/42, TMA — 7/25, API client — 1/6. Сохраняются неблокирующие bundle warnings: web около 590 kB, TMA
  около 602 kB, MapLibre 924 kB; окружение по-прежнему задаёт небезопасный `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `npm run test:e2e:typecheck` и `npm run test:e2e:build` успешны; production PWA и TMA bundles собраны. `npx
playwright test test/e2e/clubs.spec.ts` обнаружил 4 сценария, но Chrome завершился с `SIGABRT` до первого шага,
  cleanup получил `kill EPERM`; browser assertions не заявляются успешными и должны пройти в browser CI.
- `npm run test:integration --workspace @picklehub/backend -- --runInBand
test/integration/clubs-backend.integration-spec.ts` обнаружил 8 сценариев, но общий setup не смог создать venue в
  локальном несмигрированном PostgreSQL; Redis socket также запрещён (`connect EPERM 127.0.0.1:6379`), а BullMQ
  завершил cleanup с closed connection. Ни один runtime assertion не выполнялся; suite должен пройти после
  `prisma migrate deploy` в PostgreSQL/Redis CI, и его успех здесь не заявляется.
- Финальный повтор `npm run verify` после добавления venue projection unit прошёл workspace, TypeSpec/Redocly,
  96/96 policy tests, breaking/generated/typecheck и остановился только на повторном sandbox
  `listen EPERM 127.0.0.1` в OpenAPI mock. Отдельный немедленный retry mock получил тот же запрет. Все последующие
  `format:check`, `docs:check`, lint, typecheck, tests и builds запущены отдельно и успешны для восьми workspaces;
  итоговая backend unit regression — 32/32 suites и 165/165 tests. `npm ls --depth=0` успешен, unmet/extraneous
  dependencies отсутствуют.
- `git diff --check` успешен до финальной записи журнала. Локально исполнимые проверки зелёные; блокировки runtime
  integration/browser явно записаны. Подтверждённая club match метрика удовлетворяет критерию source/deduplication;
  membership/active-club/fill dashboard остаётся отдельным production analytics gate, как зафиксировано в матрице.

## 2026-09-12 — турниры, этап 01-requirements

- Активный промпт: `llm/10-tournaments/01-requirements.md`. Изменения ограничены продуктовыми требованиями,
  доменной/архитектурной границей, privacy/retention и аналитикой. TypeSpec/AsyncAPI, OpenAPI, Prisma, migrations,
  backend, worker и клиенты не менялись и не выдаются за реализованные.
- Определены 15 пользовательских историй и 20 сценариев «Дано/Когда/Тогда»: draft/publication, registration,
  individual/fixed-team/partner entry, FIFO waitlist, ручной внешний payment status, check-in, withdrawal,
  replacement/no-show, seeding/start/pause/completion/cancel, roles, result/correction, club attribution и recovery.
- Lifecycle разделяет состояние агрегата и явный registration gate. После seeding strategy snapshot, eligible
  entrants, seeds и публичные tie-break lots неизменяемы; role/lifecycle/payment/result/correction/recovery
  mutations versioned, idempotent и аудируются. Последний organizer не исчезает без атомарной передачи.
- Цена/валюта — только публичная информация об оплате вне платформы. PickleHub не создаёт checkout, invoice,
  acquiring link, wallet, escrow, refund или provider callback, не собирает реквизиты/evidence и не гарантирует
  расчёт. Ручной статус может быть условием check-in только по заранее опубликованной policy.
- Зафиксированы восемь strategy versions и допустимые размеры/play modes: individual doubles Americano; singles
  или fixed-team doubles для round robin, single/double elimination, pool play, Swiss, ladder и King of Court.
  Описаны circle/snake/bracket/pairing/movement algorithms, power-of-two guards, byes/walkovers, courts/batches,
  grand-final reset, scoring и последний публичный lot, исключающий нерешённую ничью.
- Double walkover передаёт empty slot в elimination graph; невозможность определить чемпиона требует pause/cancel,
  а не случайного победителя. Winner-changing correction разрешена до старта зависимости; поздняя попытка ставит
  турнир на паузу и допускает только аудированное `RESULT_STANDS` либо cancel, не переписывая сыгранную историю.
- Strategy engine задан как чистая детерминированная функция snapshot/seeds/lots/result revisions. PostgreSQL
  остаётся authoritative для uniqueness/dependencies/audit/outbox, Redis/BullMQ — только ускоритель. Recovery
  пересчитывает projection/checksum и fail-closed ставит турнир на паузу при невозможном графе, duplicate slot,
  unresolved tie или расхождении.
- Аналитика отделяет immutable tournament markers от consented events. Registration eligibility, fill/check-in,
  partner/waitlist conversion, start/completion, no-show/correction/pause определены без IDs, roster, pair graph,
  payment/price, score, seed/rating и точного времени/места. Tournament matches не увеличивают KPI подтверждённых
  обычных матчей.
- Privacy policy закрепляет tournament-scoped least privilege, минимальную public/organizer projection, explicit
  partner opt-in, запрет пользовательского JavaScript/DSL и предварительные retention limits. Правовое основание,
  РФ-residency, legal hold, backup expiry и физическая очистка остаются production gates, а не заявленным
  соответствием.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/architecture.md`, `llm/_docs/security-privacy.md`, `llm/_docs/analytics-plan.md` и этот журнал.

### Проверки этапа tournaments 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/domain-model.md llm/_docs/architecture.md
llm/_docs/analytics-plan.md llm/_docs/security-privacy.md` — успешно; после уточнения double walkover, court,
  Americano/double-elimination/pool algorithms requirements повторно отформатирован.
- `npm run format:check` и `npm run docs:check` — успешно до полного прогона: 125 Markdown-файлов, 0 ошибок.
- Первый `npm run verify` дошёл через workspace/TypeSpec/Redocly, 151 REST operations/51 messages, 96/96 policy
  tests, compatibility/generated/typecheck и OpenAPI mock, затем ожидаемо обнаружил неотформатированную после
  последней правки таблицу requirements. Выполнен Prettier; проверки не ослаблялись.
- Повторный `npm run verify` успешен полностью: восемь workspaces/один root lockfile; TypeSpec и Redocly; 151 REST
  operations/51 messages; 96/96 contract/data/privacy/verification tests; compatibility, generated drift,
  contract typecheck и OpenAPI mock; format/docs; lint, strict typecheck, tests и production builds. Backend —
  32/32 suites и 165/165 tests, web — 9/42, TMA — 7/25, API client — 1/6; остальные четыре package suites также
  зелёные. Сохраняются прежние неблокирующие bundle warnings: web около 590 kB, TMA около 602 kB, MapLibre 924 kB,
  а окружение задаёт небезопасный `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `npm ls --depth=0` и `git diff --check` успешны: unmet/extraneous dependencies и whitespace errors отсутствуют.
  Критерии текущего этапа выполнены на уровне требований. Точные wire enum/limits, SQL guards, event payloads и
  golden strategy fixtures принадлежат следующему промпту `llm/10-tournaments/02-contract-data.md`; к нему не
  переходили.

## 2026-09-12 — турниры, этап 02-contract-data

- Активный промпт: `llm/10-tournaments/02-contract-data.md`. Добавлен TypeSpec-контракт из 22 tournament routes:
  публичный поиск/card/plan, draft update/publication, registration и scoped entrants, check-in/withdrawal,
  информационная внешняя payment mark, seed/start, start/complete round, score/walkover/correction,
  pause/resume/completion/cancel. Все ответы `no-store`; приватные reads требуют bearer, а мутации дополнительно
  требуют Origin/CSRF, UUIDv4 idempotency и expected aggregate/resource revisions. Hard delete отсутствует.
- Общие wire models покрывают `Tournament`, `Entrant`, `EntrantMember`, partner intent, `Stage`, `Round`,
  `TournamentMatch`, `CourtAssignment`, `Standing`, `FormatDefinition` и `PaymentMark`. Восемь встроенных форматов
  используют один discriminated preset union и semantic strategy version. `TournamentFormatStrategyInput/Output`
  и data-policy фиксируют чистоту, детерминизм, stable keys, dependency/slot/terminal/tie invariants и atomic
  persistence boundary. `CUSTOM_DSL` присутствует в enum, но API/SQL всегда отклоняют активацию.
- Добавлена versioned JSON Schema `contracts/schemas/tournament-presets.v1.schema.json` с восемью закрытыми `$defs`.
  Registry `format_definitions` хранит immutable format/strategy/schema version, `$id`, JSON Schema и hash;
  изменяемая конфигурация находится только в tournament snapshot. SQL сверяет snapshot с registry, format/play-mode
  и size/round/pool/court guardrails. Golden fixtures покрывают round robin с пятью entrants и bye, elimination
  bracket 8 для шести entrants с автопроходами seeds 1/2 и равенство, разрешённое последним публичным lot.
- Prisma и additive migration получили один aggregate family, scoped roles и ровно одного organizer, отдельный
  opt-in partner intent, FIFO/seed/lot uniqueness, immutable snapshot, shared stage/round/match graph, composite
  aggregate-scope FK, unique source outcomes, court batches, append-only result revisions/payment history/audit,
  reciprocal authoritative result guard, late winner-change rejection, unique standing ranks и единственный
  append-only completion marker. Root `version + projectionRevision + projectionChecksum` и generation keys
  обеспечивают replay/recovery без зависимости от BullMQ lease.
- AsyncAPI получил internal transactional-outbox channel `tournament.events.v1` и пять сообщений. Payload содержит
  только opaque tournament/entrant/tournament-match references, aggregate/resource/projection versions и закрытые
  format/state/outcome. Policy test запрещает roster/member/user, payment/price, score/winner, seed/rating,
  club/venue, schedule, public text, actor и reason; consumer обязан перечитать авторизованную projection и
  дедуплицировать `messageId`/revision.
- Обновлены contract allowlists, generated root/API-client TypeScript, representative Prism smoke, contract README
  и `llm/_docs/tournaments-data-policy.md` с migration/index/recovery/privacy решениями. Новые policy/data tests
  довели общий набор до 103 tests. Backend use cases, strategy algorithms, worker и UI не создавались; это объём
  следующего prompt.

### Проверки этапа tournaments 02-contract-data

- `npm run contracts:generate` — успешно; OpenAPI и оба generated TypeScript artifacts обновлены только из
  TypeSpec/AsyncAPI. `npm run contracts:lint` — успешно: TypeSpec, Redocly, allowlists/privacy, 173 REST operations,
  56 messages и 103/103 contract/data tests. `npm run contracts:breaking`, `npm run contracts:generated:check` и
  `npm run contracts:typecheck` — успешно; compatibility с `HEAD`, byte-reproducibility и strict generated
  typecheck подтверждены.
- `npm run contracts:mock:check` после добавления tournament search и валидных currency/checksum examples —
  успешно: representative tournament response имеет корректную форму и `no-store`. Два промежуточных повтора и
  финальный `npm run verify` один раз получили sandbox `listen EPERM 127.0.0.1`; немедленный отдельный retry mock
  после итоговых изменений успешен. Проверка не ослаблялась.
- Один полный `npm run verify` до финального уточнения registry успешно прошёл все восемь workspaces; после
  уточнения повторно успешно выполнены contract compile/lint/breaking/generated/typecheck, затем отдельно
  `format:check`, `docs:check`, lint, strict typecheck, tests и production builds. Backend regression — 32/32 suites
  и 165/165 tests; API client — 1/6, web — 9/42, TMA — 7/25. PWA manifest/service worker и отсутствие TMA dev mock
  подтверждены. Сохраняются прежние неблокирующие bundle warnings около 590/602 kB и MapLibre 924 kB, а окружение
  задаёт небезопасный `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `npx prisma validate --schema backend/prisma/schema.prisma` и предварительный `prisma format` не получили schema
  engine из-за restricted network: `ENOTFOUND claude-fwd.raiffeisen.ru`. PostgreSQL runtime migration/constraint
  tests также недоступны: `psql`/`pg_isready` отсутствуют, Docker daemon socket запрещён (`operation not permitted`).
  Поэтому применение DDL и runtime-успех deferred triggers должны быть подтверждены в PostgreSQL CI и здесь не
  заявляются. Статические migration policy tests успешны.
- `npm ls --depth=0`, `git diff --check`, `format:check` и `docs:check` успешны; unmet/extraneous dependencies,
  whitespace и Markdown errors отсутствуют. Локально исполнимые критерии prompt выполнены. Следующий prompt —
  `llm/10-tournaments/03-backend.md`; к нему не переходили.

## 2026-09-12 — турниры, этап 03-backend

- Активный промпт: `llm/10-tournaments/03-backend.md`. Добавлен backend-модуль `tournaments` с закрытым registry
  восьми встроенных стратегий версии `1.0.0`; неизвестная версия и `CUSTOM_DSL` fail closed. Стратегии не читают
  clock, БД, Redis, сеть, environment или профиль и получают только preset, ordered seed/public lot и append-only
  result revisions. Stable strategy keys и canonical JSON/SHA-256 дают byte-deterministic projection checksum.
- Реализованы Americano circle partners, odd/double-leg round robin, recursive seeded single elimination с bye,
  winners/losers graph и conditional reset double elimination, snake pools с delayed playoff, Swiss matching с
  поиском полного matching без rematch и детерминированным fallback, bounded ladder challenges и simultaneous
  King of Court movement. Court rank/batch вычисляются детерминированно; dependent dynamic formats останавливаются
  на первой незавершённой волне.
- Общая проверка projection запрещает duplicate entrant в одной волне, duplicate match key, cycle/unknown source,
  result неизвестной встречи и winner вне resolved slots. Standings завершаются уникальным публичным lot; scoring
  profiles запрещают draw, проверяют completed series, win-by-two и cap 15. Инициализированная случайность
  материализуется до strategy через SHA-256 seed/entrant/collision counter и воспроизводит те же уникальные lots.
- `TournamentOrchestrator` реализует versioned registration/FIFO promotion, check-in/withdrawal, seed, start
  tournament/round/match, court assignment, score, correction, recovery, pause/resume, completion и cancellation.
  Winner-changing correction до старта зависимости перестраивает projection; после зависимого старта revision не
  добавляется, tournament становится `PAUSED`. Completion требует resolved champion, terminal required matches,
  уникальные ranks и единственный checksum marker.
- `TournamentIdempotencyService` выполняет application callback в Prisma `SERIALIZABLE` transaction, блокирует
  actor, scope-ит receipt по actor/method/path/key, шифрует replay response и bounded повторяет `P2034`.
  `TournamentTransactionPort` фиксирует обязательную root-lock/atomic persistence boundary для worker; duplicate
  operation ID возвращает committed state без второго audit/round/result. Модуль подключён к application и worker
  composition roots; Redis lease не является источником истины.
- Добавлены `tournament-strategies.spec.ts` и `tournament-orchestrator.spec.ts`: golden odd round robin/bracket seed,
  Americano partner uniqueness, double-elimination graph/reset, Swiss no-rematch, pool gate, ladder/court
  permutation, score validation, полные симуляции всех восьми форматов, FIFO/replay/rollback, seeded lots/recovery
  и late correction pause. Решения и runtime boundaries записаны в `llm/_docs/tournaments-backend.md`.

### Проверки этапа tournaments 03-backend

- Targeted `npm run lint --workspace @picklehub/backend`, `npm run typecheck --workspace @picklehub/backend`,
  `npm test --workspace @picklehub/backend -- --runInBand backend/test/unit/tournament-orchestrator.spec.ts
backend/test/unit/tournament-strategies.spec.ts` и `npm run build --workspace @picklehub/backend` — успешно;
  tournament suite 2/2 файлов и 36/36 tests, включая 16 min/max boundary cases.
- Полный backend regression `npm test --workspace @picklehub/backend -- --runInBand` — успешно: 34/34 suites и
  201/201 tests. Финальный `npm run verify` — успешно: восемь workspaces/один lockfile, TypeSpec/Redocly, 173 REST
  operations/56 messages, 103/103 contract/data/privacy tests, compatibility/generated drift/typecheck, OpenAPI
  mock, format/docs, lint, strict typecheck, tests и production builds. Web — 9/42, TMA — 7/25, API client — 1/6;
  прежние bundle warnings около 590/602 kB и MapLibre 924 kB остаются неблокирующими.
- `npx prisma generate --no-engine --schema backend/prisma/schema.prisma` не выполнился: restricted network не
  разрешил получить schema-engine checksum (`ENOTFOUND claude-fwd.raiffeisen.ru`). PostgreSQL socket/daemon в
  окружении также отсутствует, поэтому runtime применение миграции, deferred triggers и реальная конкурентная
  интеграция должны пройти в PostgreSQL CI и здесь не заявляются успешными.
- `npm ls --depth=0`, `git diff --check`, `format:check` и `docs:check` успешны; unmet/extraneous dependencies,
  whitespace и Markdown errors отсутствуют. Следующий промпт — `llm/10-tournaments/04-tma-web.md`; к нему не
  переходили.

## 2026-09-12 — турниры, этап 04-tma-web

- Активный промпт: `llm/10-tournaments/04-tma-web.md`. В web/PWA и TMA добавлены публичные маршруты поиска и
  карточки турнира, отдельные platform UI и навигация. Поиск фильтрует название/формат; карточка показывает
  lifecycle, локальное время в IANA timezone, вместимость, версию правил и информационную цену с явным указанием,
  что расчёт проходит вне PickleHub.
- Мастер создаёт только восемь allowlisted preset версии `1.0.0`; `CUSTOM_DSL` отсутствует. Для каждого формата
  показаны только его параметры, а client guard повторно блокирует несовместимые capacity/round/pool/playoff/court
  сочетания до HTTP. Предпросмотр объясняет scoring, отсутствие ничьих, публичный tie-break lot, внешнюю оплату и
  то, что корты не бронируются сервисом.
- Участник может зарегистрироваться один, готовой парой либо с явным opt-in на поиск партнёра, увидеть собственную
  FIFO-очередь, check-in и ручной payment state, отметить прибытие или сняться. Offline отключает мутации без
  optimistic success; публичные read-only данные остаются видимыми.
- Organizer-панель покрывает публикацию, переставляемый порядок посева, старт турнира/раунда, завершение раунда,
  ручной внешний payment mark, score, walkover, versioned correction, pause, recovery-resume, completion и cancel.
  Все команды используют generated DTO, CSRF/idempotency client boundary и expected aggregate/resource/result
  revisions. Version/revision conflict, позднее исправление и projection mismatch показываются отдельно с явной
  загрузкой свежего состояния.
- Общая проекция восьми форматов отображается доступными ordered lists и standings table; bracket имеет отдельную
  текстовую альтернативу. Court rank/batch видны без обещания бронирования. TMA использует собственную вертикальную
  компоновку, горизонтальный scroll только внутри таблицы и 360 px browser assertion на отсутствие page overflow.
- Handwritten API client получил типизированные методы всех tournament routes поверх generated OpenAPI types;
  generated artifacts не редактировались. Добавлены 3 web и 2 TMA component scenarios, а также 2 production-build
  browser scenarios для публичной сетки, текстовой альтернативы, таблицы и узкого TMA viewport. Изменённые файлы:
  `frontend/packages/api-client/src/index.ts`, web/TMA `app.tsx`, `styles.css`, новые `tournaments-ui.tsx` и их
  component tests, `test/e2e/tournaments.spec.ts` и этот журнал.

### Проверки этапа tournaments 04-tma-web

- Targeted lint и strict typecheck для `@picklehub/api-client`, `@picklehub/web`, `@picklehub/tg` — успешно.
  `npm test --workspace @picklehub/web -- --run src/tournaments-ui.test.tsx` — 3/3; аналогичная TMA-команда — 2/2.
  Полная client regression успешна: API client 1/1 suite и 6/6 tests, web 10/10 и 45/45, TMA 8/8 и 27/27.
- Targeted production builds API client, web/PWA и TMA успешны; PWA manifest/service worker присутствуют, TMA
  development Telegram mock исключён. Неблокирующие bundle warnings выросли до web 622 kB и TMA 630 kB;
  MapLibre chunk остаётся 924 kB.
- `npm run verify` — успешно полностью: восемь workspaces/один lockfile; TypeSpec/Redocly; 173 REST operations и
  56 messages; 103/103 contract/data/privacy tests; breaking/generated drift/contract typecheck; OpenAPI mock;
  format/docs; lint; strict typecheck; tests и production builds. Backend regression — 34/34 suites и 201/201
  tests. Окружение по-прежнему задаёт небезопасный `NODE_TLS_REJECT_UNAUTHORIZED=0`; это существующее внешнее
  предупреждение.
- `npm run test:e2e:typecheck` и `npm run test:e2e:build` — успешно. `npx playwright test
test/e2e/tournaments.spec.ts` обнаружил оба web/TMA сценария, но локальный Chrome завершился с `SIGABRT` до
  первого test step, cleanup получил `kill EPERM`. Поэтому реальные browser/360 px assertions должны пройти в
  Playwright CI и локально успешными не заявляются; соответствующие component DOM assertions зелёные.
- `git diff --check` успешен. Локально исполнимые критерии промпта выполнены; следующий промпт —
  `llm/10-tournaments/05-verification.md`, к нему не переходили.

## 2026-09-12 — турниры, этап 05-verification

- Активный промпт: `llm/10-tournaments/05-verification.md`. Добавлен
  `backend/test/unit/tournament-verification.spec.ts`: восемь прямых resumable simulations и восемь полных
  application command flows `REGISTER → SEED → START → SCORE → COMPLETE`, odd round-robin property matrix 3..15,
  walkover/double-walkover standings, repeatable initialized lots, отсутствие потери/дубликата entrant и maximum
  plans всех форматов с консервативным CPU budget 2 секунды на вызов.
- Расширен `tournament-orchestrator.spec.ts`: конкурентные score submissions сходятся к одному result/version,
  checkpoint failure перед commit не сохраняет state/audit/receipt, а retry и повтор operation ID создают один
  entrant и один audit. Существующий withdrawal/FIFO scenario связывает replacement до seeding, а late
  winner-changing correction сохраняет прежний result и переводит tournament в `PAUSED`.
- Полный command flow обнаружил regression для single elimination на шесть entrants: automatic bye был terminal,
  но `TournamentOrchestrator.resolveSlot` искал победителя только в result revision. Исправление использует
  сохранённый `automaticWinnerEntrantId`; отдельный assertion также не позволяет завершить турнир до terminal
  optional bronze.
- Добавлен `contracts/scripts/tournaments-verification-policy.test.mjs` и включён в `contracts:lint`. Пять policy
  tests проверяют Bearer/Origin/CSRF/UUIDv4 idempotency на всех 18 mutations, tournament-scoped roles и ровно одного
  organizer, `SERIALIZABLE` encrypted receipt replay, append-only recovery/generation guards и отсутствие
  исполняемого `CUSTOM_DSL`, `eval`, `Function` или `node:vm`.
- Матрица rule-to-test, модель корректности, performance boundary и остаточные gates записаны в
  `llm/_docs/tournaments-verification.md`. Проверка не объявляет статический контракт настоящим runtime API:
  tournament controller/application service routes в backend отсутствуют, поэтому HTTP authorization/idempotency,
  PostgreSQL transaction integration, roster/member replacement и полный browser organizer/participant E2E для
  восьми форматов остаются блокировкой приёмки. К `11-gamification` не переходили.

### Проверки этапа tournaments 05-verification

- `node --test contracts/scripts/tournaments-verification-policy.test.mjs` — успешно, 5/5. Targeted
  `npm test --workspace @picklehub/backend -- --runInBand backend/test/unit/tournament-orchestrator.spec.ts
backend/test/unit/tournament-strategies.spec.ts backend/test/unit/tournament-verification.spec.ts` — успешно,
  3/3 suites и 71/71 tests после исправления automatic bye.
- `npm run format:check`, `npm run docs:check`, backend lint/typecheck/build и `npm run contracts:lint` — успешно;
  TypeSpec/Redocly и 108/108 contract/data/privacy/verification tests зелёные. Один промежуточный format check и
  один lint корректно обнаружили новый Markdown/лишнюю nullable-проверку; форматирование и тип были исправлены без
  ослабления правил.
- `npm run verify` — успешно полностью: восемь workspaces/один lockfile; 173 REST operations/56 messages;
  108/108 contract tests; compatibility/generated drift/contract typecheck/OpenAPI mock; format/docs; lint; strict
  typecheck; tests и production builds. Backend — 35/35 suites и 236/236 tests, web — 10/45, TMA — 8/27,
  API client — 1/6. Сохраняются известные bundle warnings около 622/631 kB и MapLibre 924 kB, а окружение задаёт
  небезопасный `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `npm run test:e2e:typecheck` и `npm run test:e2e:build` — успешно. `npx playwright test
test/e2e/tournaments.spec.ts` обнаружил 2 tests, но оба не начали первый step: локальный Chrome завершился с
  `SIGABRT`, cleanup получил `kill EPERM`. Browser success не заявляется.
- Прямой PostgreSQL probe через `pg` завершился `EPERM: connect EPERM 127.0.0.1:5432`; runtime migration,
  constraints, конкурентные transactions и encrypted receipt replay локально не исполнены. `npm ls --depth=0` и
  `git diff --check` успешны.
- Статические, unit, property/simulation и сборочные проверки доступны и зелёные, но критерий полного HTTP/database
  end-to-end не выполнен из-за отсутствующих tournament routes и недоступного PostgreSQL. Этап зафиксирован как
  заблокированный, следующий prompt запускать нельзя.

## 2026-09-12 — геймификация, этап 01-requirements

- Активный промпт: `llm/11-gamification/01-requirements.md`, запущенный по прямому запросу владельца несмотря на
  записанную в tournaments verification блокировку перехода. Этот документационный этап не устраняет и не выдаёт
  за устранённую блокировку tournament HTTP/database/browser acceptance. Изменения ограничены требованиями,
  доменной/архитектурной границей, privacy/retention и аналитикой; TypeSpec/AsyncAPI, OpenAPI, Prisma, migrations,
  backend, worker и клиенты не менялись.
- Определены 10 пользовательских историй и 15 сценариев «Дано/Когда/Тогда». `GLOBAL_V1` содержит только три
  source-backed награды: фактическое участие в подтверждённой игре — 100 XP, организация подтверждённого обычного
  матча — 40 XP, допустимый структурированный отзыв — 15 XP; у каждой не более 3 событий/сутки и 10/неделю.
- Каждый award привязан к committed owning-domain event и ключу scope/user/source/rule version. Replay не создаёт
  вторую запись, превышение cap terminal `CAPPED`, а invalidation/withdrawal и восстановление создают ограниченную
  append-only reversal/reinstatement chain. Спорный факт остаётся `PENDING`; client analytics не является source.
- Явно запрещены XP за победу, место/счёт, login/streak, неподтверждённый результат, создание/вступление/сообщение,
  жалобу, позитивность отзыва, платёж, покупку или рекламу. XP не меняет DUPR, win/loss, games played, посев,
  sporting/trust score либо доступ и не покупается/передаётся/тратится.
- Заданы пять глобальных уровней и достижения только за net-valid игры, организацию и отзывы. Reversal объяснимо
  отзывает порог, а reinstatement не повторяет celebration. Публичный achievement opt-in; streak loss, countdown,
  shame notification, наказание за перерыв и платное восстановление отсутствуют.
- Клуб выбирает только три allowlisted templates: off либо coefficient `0.5..2.0` с шагом `0.1`, округлением вниз
  и неизменным event cap. Version/effectiveFrom не действуют назад; 1–20 декоративных уровней имеют возрастающие
  thresholds и безопасные названия 1–30 символов. Формулы, ручной/negative XP, JavaScript и DSL запрещены.
- Выход/исключение/block замораживает club progress и убирает строку; повторное вступление продолжает тот же ledger
  без backfill/duplicate и требует новый seasonal opt-in. Archive/restore не создаёт backlog, deletion не меняет
  global/other-club XP и скрывает club projections с ограниченным integrity/appeal retention.
- Сезоны одного scope — непересекающиеся UTC-интервалы 28–366 суток с immutable snapshot. Leaderboard opt-in
  отдельный для scope/season и выключен по умолчанию; opt-out немедленно скрывает строку без потери XP. Равный net
  XP даёт общий competition rank; block показывает «Скрытый игрок», restriction скрывает строку без публикации
  причины, viewer-aware cache не может быть общим CDN snapshot.
- Антифрод ограничен серверными частотными/связевыми признаками без текста и точной географии. Автоматика может
  только удержать `PENDING`; санкция/reversal требует moderator policy/reason/evidence/audit и appeal. Недоступность
  XP/fraud не блокирует игру, отзыв, membership или opt-out; восстановление идёт из domain event/outbox.
- Аналитика сравнивает 28-day retained confirmed players с теми же cohort/window для complaints, no-show,
  held/reversed XP, confirmed manipulation, repeat-pair/group concentration и opt-out. Рост XP/views/rank не
  является успехом; guardrail degradation или малая/незрелая выборка дают harmful/inconclusive результат.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/architecture.md`, `llm/_docs/security-privacy.md`, `llm/_docs/analytics-plan.md` и этот журнал.

### Проверки этапа gamification 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/domain-model.md llm/_docs/architecture.md
llm/_docs/security-privacy.md llm/_docs/analytics-plan.md` — успешно; пять документов отформатированы.
- `npm run format:check` — успешно, включая 10 TypeSpec files; `npm run docs:check` — успешно, 128 Markdown-файлов,
  0 ошибок; `git diff --check` — успешно до записи журнала.
- `npm run verify` — успешно полностью: восемь workspaces/один root lockfile; TypeSpec/Redocly; 173 REST
  operations/56 messages; 108/108 contract/data/privacy/verification policy tests; compatibility, generated drift,
  contract typecheck и OpenAPI mock; format/docs; lint, strict typecheck, unit tests и production builds. Backend —
  35/35 suites и 236/236 tests, web — 10/45, TMA — 8/27, API client — 1/6; остальные shared suites зелёные.
- `npm ls --depth=0` — успешно, unmet/extraneous dependencies отсутствуют. Сохраняются прежние неблокирующие build
  warnings: web около 622 kB, TMA около 631 kB, MapLibre 924 kB; окружение задаёт небезопасный
  `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Критерии активного этапа выполнены на уровне требований. Точные wire enum/limits, SQL ledger constraints,
  consent/event payloads и anti-fraud policy tests принадлежат `llm/11-gamification/02-contract-data.md`; к нему не
  переходили. Ранее записанная tournament verification блокировка остаётся отдельным незакрытым риском.

## 2026-09-12 — геймификация, этап 02-contract-data

- Активный промпт: `llm/11-gamification/02-contract-data.md`. Добавлен TypeSpec-контракт из восьми операций:
  собственный global/club progress, achievements, сезонный leaderboard, отдельный opt-in/opt-out и versioned
  platform/club definition views. Все операции требуют bearer, ответы — `private, no-store`; две мутации требуют
  Origin, CSRF, UUIDv4 idempotency key и expected revision/version. Admin definitions помечены purpose-bound
  capability; club configuration принимает только три allowlisted source template, coefficient `0.5..2.0` и 1–20
  уровней.
- OpenAPI и оба TypeScript API artifacts перегенерированы только из TypeSpec. После этапа опубликована поверхность
  из 181 REST operation; generated client вручную не редактировался.
- Prisma и migration добавляют immutable `XpRuleDefinition`, append-only `XpLedgerEntry`, отдельные `XpBalance`,
  `LevelDefinition`, `AchievementDefinition/Award`, `LeaderboardSeason/Consent/Entry`, processed-event dedupe и
  encrypted 24-hour mutation receipts. Global scope и каждый club scope защищены отдельными partial unique keys.
- `GLOBAL_V1` зафиксирован как `1.0.0`: play 100, ordinary-match organization 40 и eligible structured review 15
  XP, для каждого 3 события/UTC day и 10/UTC week. Advisory transaction lock сериализует cap; rule snapshot и
  source occurred time исключают перенос retry в новое окно. `CAPPED` имеет ноль XP и остаётся terminal.
- История ledger/rules/levels/awards/consents защищена от update/delete. Reversal допустим только для posted award,
  reinstatement — для reversal; owner/scope/rule/amount сохраняются и partial unique indexes ограничивают каждую
  компенсацию одной записью. Processed receipt уникален по message ID и owning event/revision.
- Сезоны одного scope — полуоткрытые непересекающиеся интервалы 28–366 суток через GiST exclusion. Consent revisions
  contiguous; любая новая revision атомарно удаляет старую projection, closed season отклоняет новый opt-in, а
  leaderboard row имеет composite FK/trigger на current explicit consent. Deferred trigger проверяет competition
  rank `1, 2, 2, 4` исключительно по seasonal net XP.
- AsyncAPI получил четыре внутренних `gamification.events.v1` message и теперь содержит 60 messages. Payload несёт
  только opaque ledger/award/consent/season record, revision и closed outcome; user/club/source IDs, activity,
  score/winner, XP/rank, identity и fraud evidence запрещены policy test. Это outbox, не client WebSocket channel.
- Добавлены contract/data policy tests, общий allowlist и Prism representative progress check. Архитектура хранения,
  privacy/read/cache границы и residual production gates описаны в `llm/_docs/gamification-data-policy.md` и
  `contracts/README.md`. Backend handlers/workers и UI не реализовывались, поскольку принадлежат следующим
  промптам.
- Изменённые source files: `contracts/rest/gamification.tsp`, `contracts/rest/main.tsp`, `asyncapi.yaml`,
  `backend/prisma/schema.prisma`, migration `20260913090000_gamification_contract_data`, contract/data policy
  scripts, `contracts/README.md`, `package.json` и этот журнал. Generated: `openapi.yaml`,
  `contracts/generated/{openapi,asyncapi}.ts`, `frontend/packages/api-client/src/generated/openapi.ts`.

### Проверки этапа gamification 02-contract-data

- `npm run contracts:typespec:check` — успешно; 11 TypeSpec files компилируются.
- `npm run contracts:generate` — успешно; OpenAPI и TypeScript artifacts обновлены детерминированно.
- `npm run contracts:lint` — успешно: Redocly без ошибок, policy report 181 REST operations/60 messages, 114/114
  contract/data/privacy/verification policy tests зелёные.
- `npm run contracts:check` — compile/lint, compatibility against `HEAD`, generated drift и strict generated
  typecheck успешно; финальный `contracts:mock:check` не запустил Prism, потому что sandbox запретил локальный
  `listen 127.0.0.1` с `EPERM`. Это ограничение среды, не успешный mock result.
- `npm run format:check`, `npm run docs:check`, `git diff --check`, `npm run workspace:check`,
  `npm ls --depth=0` — успешно; 129 Markdown files, 0 ошибок, восемь workspaces/один root lockfile, unmet/extraneous
  dependencies отсутствуют.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — успешно для всех восьми workspaces. Backend
  unit: 35/35 suites и 236/236 tests; web 10/45, TMA 8/27, API client 1/6 и остальные shared suites зелёные. Build
  сохраняет прежние warnings о web/TMA/MapLibre chunks около 622/631/924 kB.
- `npm run test:integration` — неуспешно из-за запрета sandbox на подключения к PostgreSQL/Redis (`EPERM` для
  `127.0.0.1`, включая Redis 6379); существующие backend integration suites не смогли подготовить fixtures. Docker
  socket также недоступен. Новая migration поэтому не применялась к реальному PostgreSQL в этом окружении.
- `npx prisma validate --schema backend/prisma/schema.prisma` — не выполнен: отсутствующий local schema-engine
  Prisma попытался скачать с `binaries.prisma.sh`, но restricted DNS вернул `ENOTFOUND`. Статический schema/data
  policy, backend strict typecheck и build зелёные, однако это не выдаётся за engine/database validation.
- Приёмка контракта выполнена: уникальный source/revision предотвращает повторную effective award в каждом scope,
  global/club partitions независимы, а projection без current explicit opt-in отвергается и удаляется. Остаточный
  verification risk — применение migration/constraint concurrency к PostgreSQL и Prism mock в среде с разрешённым
  loopback. Ранее записанная tournament verification блокировка этим этапом не устранена.

## 2026-09-13 — геймификация, этап 03-backend

- Активный промпт: `llm/11-gamification/03-backend.md`. Добавлен NestJS `GamificationModule` с восемью ранее
  определёнными REST operations: private global/club progress, собственные achievements, consent-aware leaderboard,
  immutable definition catalogue и versioned club configuration. Player routes требуют завершённого onboarding;
  мутации используют browser integrity, rate limit, UUIDv4 idempotency receipt и serializable transaction. Platform
  catalogue использует новую фиксированную capability `GAMIFICATION_DEFINITION_READ`, доступную только superadmin.
- `GamificationEventWorkerService` получает match/review/club references из отдельной BullMQ queue. Consumer под
  advisory transaction lock дедуплицирует message и source revision, отклоняет late stale delivery и перечитывает
  authoritative confirmed marker, PLAYED participants, review head и membership interval. Подтверждённая игра даёт
  одинаковый XP независимо от winner/score; structured review учитывается один раз на author/match независимо от
  rating, tags и optional text. Архивация клуба и завершение membership не создают backlog.
- Движок выбирает immutable rule по source occurred time, округляет club coefficient вниз и оставляет over-cap award
  terminal `CAPPED`. Отмена и восстановление используют append-only reversal/reinstatement. Mutable balance,
  achievement state и season leaderboard полностью воспроизводятся из ledger; pure tests фиксируют одинаковый
  checksum для любого delivery order, shared competition rank и поведение duplicate/stale revisions.
- Club configuration допускает только три allowlisted sources, коэффициент `0.5..2.0`, неизменные caps/base XP и
  1–20 строго возрастающих уровней. NFC/text policy запрещает staff impersonation, азартные, денежные и призовые
  названия. Авторизация привязана к owner/admin данного клуба; global и другой club scope не передаются в mutation.
- Season service сохраняет immutable rule/level snapshot и audit, а worker раз в минуту выполняет monotonic rollover
  и полную consent-aware projection. Opt-out удаляет row в той же транзакции; rebuild исключает deleted/restricted,
  club-blocked и inactive members. Viewer read скрывает взаимно заблокированную строку без identity/avatar, сохраняя
  rank. Добавлен операторский `gamification:rebuild`, который не начисляет XP и не читает analytics.
- Последующая migration `20260913120000_gamification_backend` исправляет award key: `source_kind` теперь позволяет
  одному организатору получить независимые PLAY и ORGANIZE awards за один match, не смешивая scope. Та же migration
  публикует immutable global/club achievement catalogues. Прямого update/delete ledger backend не содержит.
- Для authoritative review source добавлен privacy-minimized `review.events.v1` / `review.eligibility.changed.v1` в
  AsyncAPI: только opaque review ID и revision. Generated AsyncAPI artifact обновлён из source; policy allowlist и
  отдельные backend static policy tests обновлены. REST contract не менялся: 181 operation.
- Основные изменённые файлы: `backend/src/gamification/*`, `backend/src/{app,worker}.module.ts`, outbox queue,
  trust/safety review producer, administration capability, backend scripts, новая migration, AsyncAPI source/artifact,
  gamification backend policy/unit tests, `llm/_docs/gamification-data-policy.md` и этот журнал.
- Финальная ревизия согласовала runtime с историческими правилами: cap query теперь использует точные полуоткрытые
  UTC day/week windows без зависимости итогового net XP от хронологии доставки; recurring-материализация исключена
  из organizer XP; архивный клуб не получает поздний review award; membership freeze и leaderboard removal стали
  одной транзакцией; активный level set выбирается по `effectiveFrom`, а не лексикографическому semver.

### Проверки этапа gamification 03-backend

- `npm run contracts:generate` — успешно; OpenAPI не дрейфовал, AsyncAPI TypeScript artifact получил новый review
  event. `npm run contracts:lint` — успешно: TypeSpec/Redocly/policy report 181 REST operations/61 messages и 117/117
  contract/data/privacy/backend policy tests зелёные.
- `npm run contracts:check` — успешно полностью: lint, compatibility against `HEAD`, generated drift, strict
  generated typecheck и OpenAPI mock с representative gamification example прошли.
- `npm run lint --workspace @picklehub/backend`, `npm run typecheck --workspace @picklehub/backend`,
  `npm run build --workspace @picklehub/backend` — успешно.
- `npm test --workspace @picklehub/backend -- --runInBand` — успешно: 36/36 suites, 242/242 tests; новый domain suite
  покрывает deterministic rebuild, compensation, caps/holds, duplicate/stale order, competition rank и club bounds.
- `npm run test:integration --workspace @picklehub/backend` — неуспешно и затем остановлено: sandbox запрещает
  подключения к Redis/PostgreSQL на `127.0.0.1` (`EPERM`). Первый запуск также увидел временный `--no-engine` Prisma
  Client, созданный для type generation без сети; client после этого штатно перегенерирован в adapter-compatible
  режиме через локальный generator. Migration, trigger concurrency и end-to-end worker delivery поэтому не выдаются
  за проверенные на реальной БД.
- Остаточный gate текущего этапа: применить обе gamification migrations к PostgreSQL, запустить concurrent duplicate /
  out-of-order / cap / reversal / opt-out / rebuild integration fixtures с Redis и сравнить sequential/rebuild
  checksum. Ранее записанная tournament verification блокировка остаётся отдельным риском; к
  `11-gamification/04-tma-web.md` не переходили.

## 2026-09-13 — геймификация, этап 04-tma-web

- Активный промпт: `llm/11-gamification/04-tma-web.md`. В web/PWA и TMA добавлены отдельные platform UI и маршруты
  личного и клубного прогресса. Экран показывает текущий/следующий уровень, семантический HTML progress с числовой
  альтернативой, lifetime XP, frozen state, причины и UTC-лимиты трёх разрешённых источников, историю достижений и
  состояния пустых данных/загрузки/ошибки. Текст явно отделяет XP активности от спортивной статистики и DUPR и не
  называет XP рейтингом мастерства.
- Обнаружен контрактный пропуск завершённого этапа 02: `XpLedgerEntry` существовал, но self-only операция истории
  отсутствовала, поэтому фактическое объяснение начисления и отмены было невозможно. Минимально добавлен
  `GET /gamification/xp-history` с bearer, `private, no-store`, cursor pagination и только ledger текущего user;
  source IDs остаются opaque, содержание матча/отзыва и другие участники не выдаются. TypeSpec остаётся источником,
  OpenAPI и оба TypeScript artifact перегенерированы. Backend отдаёт стабильный append-only порядок и compensation
  link; unit test проверяет owner filter, reversal и форму страницы.
- История в обоих клиентах различает `POSTED`, `PENDING`, `CAPPED`, `AWARD`, `REVERSAL` и `REINSTATEMENT`, показывает
  причину, время исходного события и версию правила. Отмена представлена отдельной строкой с исходной записью,
  сохранённой в истории; capped событие не изображается как начисление. Достижение отдельно показывает earned,
  revoked и reinstated, без связи со спортивным результатом.
- Сезонная таблица показывает интервал, lifecycle и версию правил, shared competition rank, seasonal XP и
  privacy-placeholder без identity для заблокированной строки. До отдельной мутации отображается явный opt-out;
  consent привязан к одному сезону, может быть отозван, offline не создаёт optimistic success, а closed season не
  предлагает новый opt-in. Объяснено, что отзыв согласия удаляет строку, но сохраняет XP.
- Настройки клуба используют только три server-provided шаблона: администратор может включить источник и выбрать
  коэффициент `0.5..2.0` с шагом `0.1`, но не изменить base XP или caps. Редактор 1–20 уровней проверяет порядок,
  непустые названия до 30 символов, строго растущие thresholds и future effective time. Preview показывает
  следующий immutable version, XP на событие и неизменные caps; revision conflict требует загрузить свежую версию.
  Мутации отключены offline. Конфетти, реклама и полноэкранные overlay в surface отсутствуют; существующий
  `prefers-reduced-motion` отключает transitions.
- Основные изменённые файлы: `frontend/{web,tg}/src/{app,clubs-ui,gamification-ui,styles}.tsx/css`, platform tests,
  typed methods `frontend/packages/api-client/src/index.ts`, TypeSpec/generated OpenAPI, gamification controller /
  service и unit test, contract allowlist, `llm/_docs/gamification-data-policy.md` и этот журнал.

### Проверки этапа gamification 04-tma-web

- Targeted lint/typecheck/test/build для `@picklehub/api-client`, `@picklehub/web`, `@picklehub/tg` и backend —
  успешно. Web: 11/11 suites и 48/48 tests; TMA: 9/9 и 30/30; API client: 1/1 и 6/6; backend после нового history
  test: 37/37 и 243/243. Новые UI suites по 3/3 проверяют accessible progress, разделение DUPR/statistics,
  фактический reversal, explicit consent, blocked placeholder, allowlisted coefficients, preview и offline mutation.
- `npm run contracts:generate`, `npm run contracts:lint`, `npm run contracts:generated:check` и
  `npm run contracts:typecheck` — успешно: 182 REST operations/61 messages, 117/117 policy/data/backend tests,
  Redocly, reproducible generated types и strict contract typecheck зелёные.
- Финальный `npm run verify` — успешно полностью: workspace/lockfile, TypeSpec, Redocly, 117 contract tests,
  compatibility с `HEAD`, generated drift/typecheck, OpenAPI mock, format/docs, lint, strict typecheck, tests и
  production builds всех восьми workspaces. PWA manifest/service worker и отсутствие TMA development mock
  подтверждены. Сохраняются неблокирующие bundle warnings: web около 642 kB, TMA около 651 kB, MapLibre 924 kB;
  окружение по-прежнему задаёт небезопасный `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Два первых targeted запуска Vitest были ошибочно переданы с Jest-флагом `--runInBand`, затем с путём от корня
  вместо workspace; они завершились до тестов (`Unknown option` / `No test files found`). Команды исправлены на
  `npm test --workspace @picklehub/{web,tg} -- src/gamification-ui.test.tsx`, обе suites прошли 3/3. Первый Prettier
  вызов включал неподдерживаемый `.tsp` parser и остановился до генерации; TypeSpec затем проверен штатными
  `contracts:*` и полным verify. Проверки не ослаблялись.
- Runtime PostgreSQL/Redis интеграция этого read-only endpoint не запускалась: среда ранее подтверждённо запрещает
  loopback к этим сервисам. Новая migration не нужна; owner predicate и response mapping покрыты unit test, contract
  privacy — policy suite. Ранее записанные runtime gates gamification backend/tournaments остаются без изменений.
  Следующий промпт — `llm/11-gamification/05-verification.md`; к нему не переходили.

## 2026-09-13 — геймификация, этап 05-verification

- Активный промпт: `llm/11-gamification/05-verification.md`. Добавлена verification-модель ledger с permutation
  tests для duplicate/late/out-of-order revisions, независимой signed-суммой отображаемого XP, append-only
  reversal/reinstatement, UTC caps, смены rule version, global/club isolation, leave/rejoin и закрытого allowlist.
- Новый contract/runtime policy связывает unit-модель с SQL и исполняемым кодом: processed-event uniqueness,
  serializable/advisory locks, immutable ledger/rules/consent, compensation guards, source-time caps, membership
  interval, exact club authorization, explicit current consent, shared competition rank, restriction/block privacy и
  отсутствие guest/complaint/payment/victory/score sources.
- Добавлен production-build Playwright-сценарий для web и TMA. Он проверяет semantic progress, отделение от DUPR и
  спортивной статистики, объяснённую отмену, explicit per-season consent, скрытую identity при block, отсутствие
  горизонтального переполнения на 360 px и computed reduced motion.
- Модель корректности, abuse matrix, traceability rule-to-test и остаточные runtime-gates записаны в
  `llm/_docs/gamification-verification.md`. Product code, TypeSpec, OpenAPI, Prisma schema/migrations и generated
  clients не менялись. Новый policy test включён в обязательный `contracts:lint`.

### Проверки этапа gamification 05-verification

- `npm test --workspace @picklehub/backend -- --runInBand backend/test/unit/gamification-domain.spec.ts
backend/test/unit/gamification-verification.spec.ts` — успешно, 2/2 suites и 13/13 tests. После добавления отдельной
  проверки checksum targeted `gamification-verification.spec.ts` — успешно, 7/7. Один промежуточный targeted запуск
  корректно обнаружил неподдерживаемый Jest matcher `toHaveSize`; заменён на проверку `Set.size`, правила не
  ослаблялись.
- `node --test contracts/scripts/gamification-verification-policy.test.mjs` — успешно, 6/6. Первый запуск обнаружил,
  что generated OpenAPI задаёт `private, no-store` через единственное значение `enum`, а не `example`; assertion
  исправлен на точную generated форму. `npm run contracts:lint` — успешно, 182 REST operations/61 messages и
  123/123 policy/data/backend/verification tests.
- Targeted web/TMA `gamification-ui.test.tsx` — успешно по 3/3; backend lint/typecheck, E2E strict typecheck,
  format/docs и `git diff --check` — успешно. `npm run test:e2e:build` — успешно для production web/TMA с прежними
  warnings о chunks около 642/651/924 kB.
- Один полный `npm run verify` — успешно: восемь workspaces/один lockfile, TypeSpec/Redocly, 123 contract tests,
  compatibility/generated drift/typecheck/OpenAPI mock, format/docs, lint, strict typecheck, tests и production
  builds. Backend — 38/38 suites и 250/250 tests; web — 11/48, TMA — 9/30, API client — 1/6. После усиления одного
  checksum assertion повторный verify дошёл до `contracts:mock:check`, но sandbox запретил `listen 127.0.0.1` с
  `EPERM`; предшествующие 123 tests и generated checks снова были зелёными. Окружение также сохраняет небезопасный
  `NODE_TLS_REJECT_UNAUTHORIZED=0`. Отдельный повтор `contracts:mock:check`, а затем финальный полный `npm run
verify` после checksum-изменения прошли успешно с теми же итогами 123/123 и 38/250.
- `npx playwright test test/e2e/gamification.spec.ts` обнаружил два tests, однако оба не начали первый step:
  локальный Chrome завершился с `SIGABRT`, cleanup получил `kill EPERM`. Browser runtime success не заявляется;
  production builds и `npm run test:e2e:typecheck` зелёные.
- `npm run test:integration --workspace @picklehub/backend` — неуспешно: sandbox запретил PostgreSQL/Redis loopback,
  включая `connect EPERM 127.0.0.1:6379`; suites не смогли подготовить fixtures. Поэтому применение gamification
  migrations, advisory-lock concurrency, BullMQ redelivery и реальное сравнение sequential/rebuild projection не
  выдаются за проверенные.
- Доступные статические, unit, component, contract и build evidence подтверждают отсутствие второго начисления и
  скрытого winner bonus в проверяемой модели, а суммы прослеживаются до ledger. Полная приёмка остаётся
  заблокированной database/queue и browser runtime gates; к следующему prompt переходить нельзя. `npm ls
--depth=0` и финальный `git diff --check` успешны, unmet/extraneous dependencies отсутствуют.

## 2026-09-13 — новости и контент, этап 01-requirements

- Активный промпт: `llm/12-content-news/01-requirements.md`, запущенный по прямому запросу владельца несмотря на
  записанные в gamification verification database/queue/browser runtime gates. Этот документационный этап не
  устраняет и не выдаёт их за устранённые. TypeSpec/AsyncAPI, OpenAPI, Prisma, migrations, backend, worker и клиенты
  не менялись; к `12-content-news/02-contract-data.md` не переходили.
- Определены 10 пользовательских историй и 14 сценариев «Дано/Когда/Тогда». Публичны только committed revisions в
  `PUBLISHED`; candidate, draft, preview, unpublished, archive, origin evidence и история редакций закрыты от
  reader API, поиска, sitemap и общих кешей. Публичных комментариев, пользовательских публикаций, реакций,
  персонализированной поведенческой ленты и автопубликации нет.
- Source registry закрыт по умолчанию и хранит отдельные права на fetch/storage/excerpt/transformation/publication/
  media/cache, evidence, terms version, attribution, territory/language, срок и review. Включение/отзыв выполняет
  `SUPERADMIN` с узкой capability, re-auth и аудитом; технически доступный RSS/API не считается разрешением. Ни один
  реальный источник этим этапом не одобрен.
- Без явной документированной лицензии полный внешний текст, HTML, paywalled content и media не извлекаются и не
  хранятся. Разрешены только allowlisted metadata и короткая выдержка. Каждый производный материал сохраняет один
  или несколько immutable origin snapshots с source, авторством/издателем, canonical URL, датами, rights policy и
  видом переработки; оригинальные материалы явно отделены.
- Ingestion создаёт только private candidate. Дедупликация по canonical URL, provider ID и fingerprint разрешённых
  полей лишь группирует/помечает кандидатов: она не удаляет provenance, не объединяет origins и не меняет статью.
  Timeout/malformed/`404/410` используют checkpoint/backoff, не создают пустую запись и не снимают материал
  автоматически. Pause/revoke прекращает fetch; takedown и отзыв прав ведут к ручному быстрому unpublish.
- Рабочий процесс задан как `DRAFT → IN_REVIEW → APPROVED → SCHEDULED/PUBLISHED → UNPUBLISHED → ARCHIVED` с
  immutable revisions, staff-bound preview и versioned checklist. Schedule исполняет только уже одобренную точную
  revision и идемпотентен. Self-review малой команды явно маркируется; `EDITOR` ведёт routine CMS, `SUPERADMIN`
  имеет source governance/emergency unpublish без редактирования, `MODERATOR` только маршрутизирует нарушение, а
  `ADS_MANAGER` CMS-доступа не получает.
- Существенное исправление создаёт новую revision и публичную correction note; смысл статьи нельзя незаметно
  заменить под прежним URL. Takedown закрывает reader/search/sitemap/cache и оставляет нейтральное состояние без
  запрещённого тела. Hard delete истории из CMS отсутствует; удаление по праву очищает body/media из primary и
  производных хранилищ, сохраняя минимальный невосстановимый restricted receipt. Точные retention и РФ-residency
  остаются production legal/security gates.
- Reader experience включает стабильную ленту, одну редакционную категорию, нормализованные теги, локализованный
  published-only поиск, self-only идемпотентные закладки и canonical share/deep link без recipient/identity/tracking.
  Снятая статья не раскрывает title/body через bookmark. Атрибуция производного материала видима и содержит
  источник, автора при наличии, исходный заголовок/ссылку и license notice; недоступность source её не стирает.
- SEO публикует canonical/OG/`Article` JSON-LD только из подтверждённых публичных полей, `hreflang` только для
  реально опубликованных проверенных переводов и sitemap только для indexable `PUBLISHED`. Preview/search/bookmark/
  admin/unpublished получают `noindex`. Перевод — отдельная проверенная revision; автоперевод не публикуется.
- Behavioral analytics использует общий consent и только locale/surface/origin/method и крупные buckets. Body,
  excerpt/title, URL/slug/query, IDs, bookmark graph, author/rights evidence, recipient/contact, точное время и
  device/ad IDs запрещены. Operational metrics измеряют adapter/editorial/scheduler/cache outcomes без контента и
  staff ranking; missing attribution, full-text violation, stale source review и draft/cache leak имеют target zero.
- Изменённые файлы: `llm/_docs/product-requirements.md`, `llm/_docs/domain-model.md`,
  `llm/_docs/architecture.md`, `llm/_docs/security-privacy.md`, `llm/_docs/analytics-plan.md` и этот журнал.

### Проверки этапа content-news 01-requirements

- `npx prettier --write llm/_docs/product-requirements.md llm/_docs/domain-model.md llm/_docs/architecture.md
llm/_docs/security-privacy.md llm/_docs/analytics-plan.md` — успешно; изменённые документы отформатированы.
- `npm run docs:check` — успешно, 130 Markdown-файлов и 0 ошибок; `npm run format:check` — успешно, включая 11
  TypeSpec-файлов; `git diff --check` — успешно до записи журнала.
- `npm run verify` — успешно полностью: восемь workspaces/один root lockfile; TypeSpec/Redocly; 182 REST
  operations/61 messages; 123/123 contract/data/backend/verification policy tests; compatibility с `HEAD`, generated
  drift/typecheck и OpenAPI mock; format/docs; lint и strict typecheck; unit/component tests и production builds.
  Backend — 38/38 suites и 250/250 tests, web — 11/48, TMA — 9/30, API client — 1/6; shared package suites зелёные.
- `npm ls --depth=0` — успешно, unmet/extraneous dependencies отсутствуют. Сохраняются прежние неблокирующие build
  warnings о chunks web около 642 kB, TMA около 651 kB и MapLibre 924 kB; окружение задаёт небезопасный
  `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Критерии текущего этапа выполнены на уровне требований: candidate не может публиковаться автоматически, полный
  внешний текст запрещён без явной документированной лицензии, а каждый производный материал обязан иметь
  immutable origin. Реальные source permissions и licenses не проверялись и не заявлены. Точные DTO/state enum,
  SQL constraints, sanitizer/adapter protocol, event allowlist и TTL принадлежат `12-content-news/02-contract-data.md`.
  Ранее записанные runtime-gates геймификации остаются отдельным незакрытым риском.

## 2026-09-13 — новости и контент, этап 02-contract-data

- Активный промпт: `llm/12-content-news/02-contract-data.md`, запущенный по прямому запросу владельца несмотря на
  ранее записанные database/queue/browser runtime-gates геймификации. К backend/UI следующим этапам не переходили;
  реальные источники, RSS/API adapters, sanitizer renderer, scheduler и CMS runtime не реализовывались.
- REST: добавлен TypeSpec source `contracts/rest/content.tsp` с 23 content operations: published-only feed/article,
  POST-body search, self-only bookmark list/add/remove и `/admin/content` для source registry/pause/governance,
  candidate review, article/revision history, staff preview, checklist approval/schedule/publish и emergency
  unpublish. Reader DTO явно содержат SEO, attribution и HTTPS media links; search, bookmark, preview и admin ответы
  имеют `private, no-store`, public feed/article — bounded public cache. Все admin mutations требуют bearer,
  browser integrity, UUIDv4 idempotency и fixed capability/role marker; редактор может fail-closed pause, но только
  superadmin с re-auth может enable/revoke или emergency-unpublish.
- Формат текста: `SAFE_RICH_TEXT_V1` — закрытый JSON AST только из paragraph/heading/list/quote, text,
  `STRONG`/`EMPHASIS`/`CODE` и HTTPS links. HTML/script/style/embed/event attributes отсутствуют в wire model;
  PostgreSQL повторно проверяет exact keys/types, глубину структуры, длины, общий размер и URL scheme.
- Данные: Prisma и migration добавляют `ContentSource` с append-only policy/evidence, `IngestCandidate` и входные
  revisions, `Article`, immutable `ArticleRevision`/`ArticleOrigin`, category/tag/media, canonical slug registry,
  append-only publication decisions, published/search projection, unique `(user_id, article_id)` bookmark и
  encrypted 24-hour operation receipts. Candidate dedupe использует URL hash/provider ID/fingerprint без удаления
  provenance; source hash уникален внутри candidate revision history.
- SQL guards закрепляют source/article state machines, current approved rights и full-text/media license evidence,
  reciprocity source-policy-origin, exact revision pointers, checklist, derived-origin requirement и атомарность
  `PUBLISHED`/public projection. `REVOKED` source нельзя commit вместе с зависимой public projection. Никакой source
  не seed-ится в `ENABLED`.
- AsyncAPI: добавлены только `content.article.published.v1` и `content.article.unpublished.v1`. Они несут opaque
  article/revision IDs, aggregate version и closed outcome; title/body/excerpt/slug/URL, author/source evidence,
  staff/user identity и bookmark graph запрещены policy allowlist. OpenAPI/AsyncAPI TypeScript и api-client types
  перегенерированы из source.
- Полные access, retention, dedupe, publication, sanitizer, media, SEO/i18n и event решения записаны в
  `llm/_docs/content-news-data-policy.md`; contract README и общий admin capability registry синхронизированы.

### Проверки этапа content-news 02-contract-data

- `npm run contracts:generate` — успешно; OpenAPI, оба contract TypeScript artifacts и api-client copy
  детерминированно обновлены.
- `npm run contracts:lint` — успешно: TypeSpec compile, Redocly, общий policy report 205 REST operations/63
  messages и 131/131 contract/data/backend/verification policy tests зелёные. Новые content policy tests отдельно
  проверяют 23 operations, published/private access, safe AST, rights/license gates, immutable provenance,
  publication pointer, bookmark/source-hash/slug uniqueness и event allowlist.
- `npm run contracts:breaking`, `npm run contracts:generated:check`, `npm run contracts:typecheck` — успешно;
  compatibility с `HEAD`, generated drift и strict TypeScript отсутствуют.
- Первый полный `npm run verify` дошёл до Prism и корректно обнаружил, что автосгенерированный content example не
  удовлетворял HTTPS/media/hash patterns. В TypeSpec добавлены валидные synthetic examples; следующий локальный
  запуск один раз получил sandbox `listen EPERM`, затем отдельный `npm run contracts:mock:check` и финальный полный
  `npm run verify` успешно проверили health, все прежние области, content feed и self-only bookmarks.
- Финальный `npm run verify` — успешно полностью: восемь workspaces/один lockfile, contracts lint/compatibility/
  drift/typecheck/mock, format/docs, lint, strict typecheck, tests и production builds. Backend — 38/38 suites и
  250/250 tests; web — 11/48, TMA — 9/30, API client — 1/6, остальные shared suites зелёные. Остались прежние
  неблокирующие bundle warnings около 642/651/924 kB и внешняя небезопасная настройка
  `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `npx prisma format --schema backend/prisma/schema.prisma` и `npx prisma validate --schema
backend/prisma/schema.prisma` не выполнены: отсутствующий schema engine попытался обратиться к
  `binaries.prisma.sh`, restricted DNS вернул `ENOTFOUND`. `docker ps` также заблокирован sandbox на Docker socket
  с `operation not permitted`, поэтому migration не применялась к PostgreSQL и SQL triggers не выдаются за runtime-
  проверенные. Prisma shape, SQL и acceptance invariants покрыты статическими policy tests; engine validation,
  clean migration apply, concurrent publication/schedule/bookmark/source-revoke fixtures и search/cache purge
  остаются обязательным gate следующей доступной CI/database среды.
- После записи журнала `npm run format:check`, `npm run docs:check`, `npm ls --depth=0` и `git diff --check` —
  успешно; 131 Markdown-файл без ошибок, unmet/extraneous dependencies и whitespace errors отсутствуют.
- Контрактная приёмка выполнена: исполняемый текст не представлен в DTO и отвергается SQL allowlist, bookmark
  идемпотентен уникальным composite key, а public API/projection допускают только exact committed `PUBLISHED`
  revision. К `12-content-news/03-backend.md` не переходили.
