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
