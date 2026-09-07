# Эксплуатация основы платформы

Документ описывает только foundation-компоненты. Он не подтверждает production-развёртывание, выбор внешних
провайдеров, локализацию персональных данных или готовность будущих продуктовых функций.

## Требования

- Node.js `22.19.0` или совместимая версия `>=22 <23`, npm `10.9.3` и единственный root `package-lock.json`;
- Docker Engine с Compose v2 для инфраструктурных и контейнерных проверок;
- доступ к закреплённым образам Docker Hub и npm registry с корректной TLS-проверкой.

Секреты, реальные персональные данные и production DSN не должны попадать в Compose, CI variables, команды,
логи или этот документ. Значения в `docker-compose.yml` предназначены только для изолированной локальной среды.

## Локальные проверки

После `npm ci --ignore-scripts` выполните:

```bash
npm run verify
npm run compose:smoke
```

`verify` проверяет workspace-граф и lockfile, TypeSpec/OpenAPI/AsyncAPI, generated drift, форматирование,
документацию, lint, типы, unit tests и production builds. Контрактный mock поднимает только локальный Prism и не
заменяет backend или внешний provider.

`compose:smoke` создаёт проект `picklehub-foundation-smoke-*`, собирает все текущие images, запускает чистые
PostgreSQL/PostGIS и Redis, применяет `prisma migrate deploy`, ожидает readiness API, проверяет web/PWA и TMA,
посылает SIGTERM API и worker и требует запись безопасного lifecycle event. Cleanup через trap удаляет только
контейнеры, network и volumes этого временного проекта. Порты `3000`, `5432`, `6379`, `8080` и `8081` должны быть
свободны.

Для длительной локальной разработки зависимости запускаются без application profile:

```bash
docker compose up -d postgres redis
docker compose stop postgres redis
```

Весь профиль можно поднять вручную командой `docker compose --profile foundation up --build --wait`. В отличие от
smoke-команды такой запуск не удаляет volumes автоматически; оператор отвечает за их жизненный цикл.

## CI и прослеживаемость

Workflow `.github/workflows/foundation.yml` разделяет проверки так, чтобы сбой не маскировался другим job:

| Требование этапа                                   | Автоматическое подтверждение                             |
| -------------------------------------------------- | -------------------------------------------------------- |
| Чистая установка и lockfile                        | `npm ci --ignore-scripts`, `npm run workspace:check`     |
| Уязвимости runtime-зависимостей                    | `npm audit --omit=dev --audit-level=high`                |
| TypeSpec, OpenAPI, AsyncAPI и generated drift      | `npm run contracts:check` внутри `npm run verify`        |
| Форматирование, docs, lint и типы                  | соответствующие root tasks внутри `npm run verify`       |
| Unit tests и production builds                     | `npm test`, `npm run build` внутри `npm run verify`      |
| Чистые PostGIS/Redis, миграции и integration tests | job `integration`                                        |
| Images, readiness, оболочки и graceful shutdown    | job `compose`, `npm run compose:smoke`                   |
| Offline PWA и отсутствие Telegram mock             | build-check workspace `@picklehub/web` и `@picklehub/tg` |
| Запрет backend imports в общих пакетах             | `npm run workspace:check`                                |

Production rollout, backup/restore, startup probe, TLS termination, secret manager, observability provider,
retention и data-residency review остаются gates этапа production readiness. Отсутствующие интеграции не
подменяются успешными заглушками: foundation readiness проверяет только PostgreSQL/PostGIS и Redis.

## Диагностика

- `docker compose --profile foundation config --quiet` проверяет структуру Compose без запуска.
- `docker compose --profile foundation ps` показывает состояние migration job, healthcheck и процессов.
- `docker compose --profile foundation logs api worker` содержит только allowlist lifecycle logs; payload,
  credentials, email, точные координаты и query string логировать запрещено.
- Ошибка получения base image или npm package из-за TLS считается сбоем окружения. Отключать TLS verification или
  подменять закреплённый image для получения зелёной проверки запрещено.
