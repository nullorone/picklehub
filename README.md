# PickleHub

PickleHub — это создаваемая через промпты спецификация продукта для платформы pickleball. Первый production-срез
ориентирован на Telegram Mini App и web/PWA и помогает игрокам находить, собирать, проводить и подтверждать
реальные матчи.

Репозиторий намеренно реализуется AI-агентами поэтапно. Начните с
[`llm/00-project-overview.md`](llm/00-project-overview.md), затем выполняйте по одному промпту в порядке,
указанном в [`llm/README.md`](llm/README.md). Каталоги приложений создаются только промптами каркаса платформы.

## Целевая архитектура

- `backend/`: модульный монолит NestJS, PostgreSQL/PostGIS, Redis/BullMQ и транзакционный outbox.
- `frontend/web/`: web-приложение React, устанавливаемое PWA и защищённые административные маршруты.
- `frontend/tg/`: Telegram Mini App.
- `frontend/mobile/`: клиент React Native/Expo, реализуемый после стабилизации основного API.
- `frontend/packages/`: сгенерированный API-клиент и общие пакеты предметной области, валидации, i18n и аналитики.
- `llm/`: продуктовый контекст, записи решений и исполняемые промпты фич.

Каталоги приложений создаются только соответствующими промптами. Backend-каркас уже создан этапом
`llm/01-platform-foundation/03-backend.md`; frontend-каркасы — этапом `04-tma-web.md`. Не создавайте последующую
фичу раньше её промпта.

## Правила работы

1. Перед выполнением промпта прочитайте обзор проекта и `00-overview.md` текущей фичи.
2. Завершайте фичу вертикально: требования, контракты и данные, backend, TMA/web, проверка.
3. После создания каркаса считайте TypeSpec в `contracts/rest/` редактируемым источником REST-контракта, корневой
   `openapi.yaml` — его сгенерированным wire artifact, а `asyncapi.yaml` — источником событийного контракта.
4. Записывайте значимые решения в `llm/_docs/adr/`, а фактические подтверждения выполнения —
   в `llm/_docs/ai-development-log.md`.
5. Не заявляйте о проверках, развёртываниях, правовом соответствии, лицензиях на данные или внешних интеграциях
   без подтверждений.

## Проверки документации промптов

```bash
npm install
npm run format:check
npm run docs:check
```

## Backend-каркас

Инструкции локального запуска API, worker, PostgreSQL/PostGIS и Redis находятся в
[`backend/README.md`](backend/README.md). Основные проверки доступны из корня:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

## Базовые контракты

[`contracts/rest/main.tsp`](contracts/rest/main.tsp) является редактируемым источником REST API и генерирует
корневой [`openapi.yaml`](openapi.yaml). [`asyncapi.yaml`](asyncapi.yaml) остаётся источником WebSocket и событий.
Инструменты, правила генерации и локальные mock-проверки описаны в
[`contracts/README.md`](contracts/README.md).

```bash
npm run contracts:check
```

## Frontend-каркасы

Инструкции запуска и границы каркасов находятся в [`frontend/web/README.md`](frontend/web/README.md) и
[`frontend/tg/README.md`](frontend/tg/README.md). Общие framework-neutral пакеты описаны в
[`frontend/packages/README.md`](frontend/packages/README.md).

## Полная проверка основы

Локальные правила workspace-графа и все проверки без инфраструктуры запускаются одной командой:

```bash
npm run verify
```

Полный профиль Compose собирает migration job, API, worker, web/PWA и TMA поверх чистых PostgreSQL/PostGIS и
Redis. Smoke использует отдельное имя проекта и всегда удаляет созданные контейнеры и volumes:

```bash
npm run compose:smoke
```

Обычный `docker compose up -d postgres redis` по-прежнему запускает только локальные зависимости. Ручной запуск
всего foundation-профиля и эксплуатационные ограничения описаны в
[`llm/_docs/operations.md`](llm/_docs/operations.md).
