# PickleHub backend

Модульный монолит NestJS запускается в двух ролях из одной кодовой базы:

- API: `npm run dev --workspace @picklehub/backend`;
- outbox worker: `APP_ROLE=worker npm run dev:worker --workspace @picklehub/backend`.

## Локальный запуск

1. Скопируйте `backend/.env.example` в локальный `.env` или экспортируйте указанные переменные.
2. Запустите PostgreSQL/PostGIS и Redis: `docker compose up -d postgres redis`.
3. Примените миграции: `npm run prisma:migrate --workspace @picklehub/backend`.
4. Запустите API и проверьте `GET http://localhost:3000/v1/health/live` и `/v1/health/ready`.

`live` проверяет только процесс. `ready` с коротким timeout проверяет PostgreSQL/PostGIS и Redis и во время
остановки становится отрицательным. Публичный ответ намеренно не раскрывает адреса и версии зависимостей.

## Границы

`health`, `outbox`, `integrations` и `audit` — отдельные технические модули. Общие config, database, Redis,
request context, logging, errors и lifecycle находятся в `common`. Контроллеры работают через сервисы и не
обращаются к Prisma напрямую. Продуктовых модулей и событий на этом этапе нет.

Outbox-запись создаётся прикладным сценарием через `OutboxService` и переданный `Prisma.TransactionClient` — так
она попадает в ту же транзакцию, что и будущее доменное изменение. Worker конкурентно забирает записи через
`FOR UPDATE SKIP LOCKED`, публикует минимальную ссылку в BullMQ и использует `eventId` как `jobId` для
дедупликации. Ошибки получают bounded retry с jitter; исчерпанные записи переходят в карантин.

## Проверки

```sh
npm run lint --workspace @picklehub/backend
npm run typecheck --workspace @picklehub/backend
npm test --workspace @picklehub/backend
npm run test:integration --workspace @picklehub/backend
npm run build --workspace @picklehub/backend
```
