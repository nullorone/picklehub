# Матрица проверки чата и уведомлений

Матрица относится к `llm/05-chat-notifications/05-verification.md`. «Автоматизировано» означает наличие проверки
в обычных командах репозитория. «Подтверждено» ставится только после фактического зелёного запуска соответствующей
среды: компиляция integration или Playwright-сценария не заменяет PostgreSQL, Redis или браузер.

| Риск или гарантия                                                                         | Уровень                     | Автоматизированное подтверждение                                           | Статус 2026-09-10          |
| ----------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| Origin, одноразовый ticket, аутентификация и авторизация подписки                         | Unit + contract             | `communication-gateway.spec.ts`, communication contract policy             | Подтверждено               |
| Cursor reconnect закрывает gap, большой gap требует REST resync                           | Unit + PostgreSQL           | gateway unit; `communications-verification.integration-spec.ts`            | Unit зелёный; БД ждёт CI   |
| Параллельная отправка имеет один порядок без пропусков                                    | PostgreSQL                  | migration и verification integration suites                                | Ожидает запуск             |
| Один client idempotency key создаёт одно сообщение и один outbox event                    | PostgreSQL                  | verification integration suite                                             | Ожидает запуск             |
| Snapshot, backward page и forward catch-up не повторяют и не теряют сообщения             | PostgreSQL                  | verification integration suite                                             | Ожидает запуск             |
| Сообщение и минимальный outbox атомарны                                                   | PostgreSQL                  | rollback/replay test в verification suite                                  | Ожидает запуск             |
| Сбой Redis оставляет due delivery в PostgreSQL, восстановление публикует её               | Unit + PostgreSQL/Redis     | `notification-delivery-recovery.spec.ts`; verification integration suite   | Unit зелёный; ждёт CI      |
| Timeout получает bounded retry; предел становится наблюдаемым `FAILED`                    | Unit + PostgreSQL           | recovery unit и verification integration suites                            | Unit зелёный; БД ждёт CI   |
| Повтор BullMQ job после terminal state не вызывает provider снова                         | Unit + PostgreSQL           | recovery unit и verification integration suites                            | Unit зелёный; БД ждёт CI   |
| `FAILED` можно безопасно вернуть в `PENDING`, сохранив provider idempotency key           | Unit + PostgreSQL + runbook | `retryFailed`, CLI и обе recovery suites                                   | Unit/CLI; БД ждёт CI       |
| Повтор доменного event не создаёт system message/inbox delivery дважды                    | PostgreSQL                  | `communications-backend.integration-spec.ts`, migration unique constraints | Ожидает запуск             |
| После выхода нельзя писать или видеть новые sequence                                      | PostgreSQL                  | backend и verification integration suites                                  | Ожидает запуск             |
| Block скрывает текст и unread; report привязан к revision и зашифрован                    | PostgreSQL                  | verification integration suite                                             | Ожидает запуск             |
| Chat text отсутствует в generic outbox, BullMQ job, provider preview, console и analytics | Static + unit + PostgreSQL  | runtime policy, provider/crypto unit, canary integration                   | Static/unit; БД ждёт CI    |
| Chat, system event, inbox, preferences и offline draft одинаковы в web/TMA                | Component + Playwright      | обе `communications-ui.test.tsx`; `communications.spec.ts`                 | Component; browser ждёт CI |
| Live region доступен; offline draft не выглядит доставленным                              | Component + Playwright      | обе UI suites и production browser scenario                                | Component; browser ждёт CI |

## Наблюдаемые гарантии и ограничения

- Источник истины — зафиксированные PostgreSQL message, notification, delivery и outbox rows. Redis и WebSocket
  могут временно быть недоступны; восстановление выполняется cursor catch-up или повторной публикацией.
- Внутренняя доставка и BullMQ работают не менее одного раза. Unique event receipt, system source event, logical
  notification, channel delivery и client idempotency scopes подавляют повторный видимый результат.
- Telegram и email не гарантируют доставку человеку. Timeout после принятия запроса провайдером неоднозначен и
  может дать внешний дубль даже при стабильном idempotency key; exactly-once не обещается.
- `ACCEPTED` означает только успешный ответ provider boundary, `DELIVERED` — только доступный transport receipt,
  а прочтение фиксируется отдельно в inbox. Резервный provider не включён и не считается проверенным.
- `FAILED` остаётся наблюдаемым с безопасным error code и числом попыток. Операторский повтор разрешён только до
  `expires_at`; `QUARANTINED`, `ACCEPTED`, `DELIVERED` и `SUPPRESSED` команда не меняет.

## Обязательные запуски

На чистых PostgreSQL 16/PostGIS 3.4 и Redis 7.4 после `prisma migrate deploy`:

```sh
npm exec --workspace @picklehub/backend -- jest --config jest.integration.config.cjs --runInBand \
    test/integration/communications-migration.integration-spec.ts \
    test/integration/communications-backend.integration-spec.ts \
    test/integration/communications-verification.integration-spec.ts
```

В окружении с установленным Playwright Chromium:

```sh
npm run test:e2e:build
npx playwright test test/e2e/communications.spec.ts --workers=1
```

При проверке отказа должны быть сохранены wall-clock duration и итоговые assertions: committed message/outbox
не потеряны, 54 sequence образуют непрерывный диапазон без повторов, replay event/client key не увеличил число
видимых записей, Redis failure оставил `PENDING`, provider timeout достиг `FAILED`, ручной retry завершился одним
`ACCEPTED`, а повтор job не вызвал provider ещё раз.

## Фактический запуск 2026-09-10

- `npm run verify` успешно прошёл workspace/lockfile, TypeSpec/Redocly, 74 REST operations и 37 AsyncAPI messages,
  50 contract/data/runtime policy tests, compatibility/generated drift, Prism mock, format/docs, lint/typecheck,
  unit/component tests и production builds всех восьми workspaces. Backend: 21 suite/53 tests; web: 5/19; TMA:
  4/14.
- `npm run test:e2e:typecheck` и `npm run test:e2e:build` успешны. Web и TMA production bundles собраны; сохранены
  известные предупреждения о MapLibre chunk 924 кБ и основном TMA bundle 533 кБ.
- Три communication integration suites завершились за 3,62 с до assertions: sandbox запретил подключения к
  PostgreSQL и Redis. Прогон также выявил и позволил исправить shutdown Redis во время незавершённого подключения;
  сами database/recovery assertions в этой среде не считаются пройденными.
- Playwright обнаружил оба новых production-сценария, но каждый Chrome process завершился `SIGABRT` при launch за
  1 мс; sandbox также запретил kill с `EPERM`. Browser assertions не считаются выполненными.

До зелёных PostgreSQL/Redis и Playwright запусков критерий об отсутствии потерь в проверенных интервалах не
объявляется полностью подтверждённым.
