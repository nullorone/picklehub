# PickleHub backend

Модульный монолит NestJS запускается в двух ролях из одной кодовой базы:

- API: `npm run dev --workspace @picklehub/backend`;
- outbox worker: `APP_ROLE=worker npm run dev:worker --workspace @picklehub/backend`.

## Локальный запуск

1. Скопируйте `backend/.env.example` в локальный `.env` или экспортируйте указанные переменные.
2. Запустите PostgreSQL/PostGIS и Redis: `docker compose up -d postgres redis`.
3. Примените миграции: `npm run prisma:migrate --workspace @picklehub/backend`.
4. Запустите API и проверьте `GET http://localhost:3000/v1/health/live` и `/v1/health/ready`.

Для проверки контейнерной поставки используйте `npm run compose:smoke` из корня. Команда создаёт отдельный
Compose project, применяет `prisma migrate deploy` к чистой базе, проверяет API, worker и клиентские оболочки,
посылает API и worker сигнал остановки и затем удаляет только свои контейнеры и volumes.

`live` проверяет только процесс. `ready` с коротким timeout проверяет PostgreSQL/PostGIS и Redis и во время
остановки становится отрицательным. Публичный ответ намеренно не раскрывает адреса и версии зависимостей.

## Границы

`identity` реализует browser-вход через проверенные Telegram init data и одноразовые email-ссылки, серверные
access/refresh-сессии, связывание способов входа, согласия и первичную настройку. Raw credentials не сохраняются:
для поиска используются HMAC, а восстанавливаемые provider subject и idempotency-ответы шифруются AES-256-GCM.
Email доставляется через порт `EmailProvider` и HTTPS adapter с пятисекундным budget; локально без endpoint он не
отправляет письма, а production-конфигурация требует одобренный endpoint и token. Adapter явно просит отключить
click tracking и переписывание URL; соответствие этим флагам проверяется при одобрении конкретного провайдера.

Browser-клиент сначала получает context cookie и CSRF token через `GET /v1/auth/context`, затем посылает точный
разрешённый `Origin`, cookie и `X-CSRF-Token` на каждой мутации. Access token живёт в памяти клиента пять минут;
refresh выдаётся только в Secure/HttpOnly cookie, ротируется и отзывает всё семейство при replay.

`health`, `outbox`, `integrations` и `audit` остаются отдельными техническими модулями. Общие config, database,
Redis, request context, logging, errors и lifecycle находятся в `common`. Контроллеры работают через сервисы и
не обращаются к Prisma напрямую.

`advertising` выбирает direct campaign только по allowlisted текущему контексту и coarse geography. PostgreSQL
сериализует hard budget и rolling frequency cap; Redis используется как консервативный короткий cache и для
token-scoped anti-fraud limits. Внешний adapter зарегистрирован только в disabled-варианте, а ошибка или отсутствие
рекламы всегда возвращает `NO_FILL` и не блокирует продукт. Полная модель допуска конкуренции и runtime gates описана
в `llm/_docs/advertising-backend.md`.

Outbox-запись создаётся прикладным сценарием через `OutboxService` и переданный `Prisma.TransactionClient` — так
она попадает в ту же транзакцию, что и будущее доменное изменение. Worker конкурентно забирает записи через
`FOR UPDATE SKIP LOCKED`, публикует минимальную ссылку в BullMQ и использует `eventId` как `jobId` для
дедупликации. Ошибки получают bounded retry с jitter; исчерпанные записи переходят в карантин.

`venues` читает публичный каталог через индексируемые PostGIS-предикаты, хранит append-only provenance и
квалифицирует match-only кандидата только через внутренний порт события подтверждённого матча. Жалоба
`PRIVATE_RESIDENCE` атомарно переводит запись в `PRIVACY_REVIEW`; Redis-инвалидация после commit не является
границей доступа. Геокодер хранит предложения только в памяти до десяти минут, а сохранение выбранного результата
требует capability `storageAllowed` для каждого поля.

OSM seed запускается только оператором и только после заполнения полного набора одобренных provider settings.
Scope — JSON с `south`, `west`, `north`, `east`, `locality`, `timeZone`. Пробный запуск ничего не меняет:

```sh
npm run venues:import --workspace @picklehub/backend -- --scope \
  '{"south":55.5,"west":37.3,"north":56,"east":38,"locality":"Москва","timeZone":"Europe/Moscow"}' --dry-run
```

Импорт ограничивает частоту запросов, повторяет временный сбой не более трёх раз, сохраняет checkpoint каждые 50
элементов и дедуплицирует по external source ID и по нормализованным имени/адресу в радиусе 100 метров. Он не
обращается к tile server и не удаляет каталог при ошибке или исчезновении upstream-записи.

`matches` реализует опубликованный REST-контракт разовых матчей: черновик и публикацию, публичный PostGIS-поиск,
рекомендации, AUTO/APPROVAL-вступление, FIFO-очередь, отмену, начало и версионированный результат. Все мутации
используют ожидаемую версию, 24-часовую зашифрованную идемпотентность и блокировку корня агрегата в PostgreSQL.
Worker истекает предложения очереди и продвигает следующего подходящего игрока одной транзакцией. Подтверждение
создаёт immutable metric marker и outbox event; отдельная очередь статистики дедуплицирует доставку по event ID.

Предельные сроки задаются `MATCH_*` переменными из `.env.example`. Изменение значений для уже опубликованной
policy требует нового `MATCH_POLICY_VERSION`; существующие матчи сохраняют опубликованную версию правил.

`communications` сохраняет сообщение и минимальное outbox-событие одной транзакцией. PostgreSQL sequence задаёт
порядок, а REST cursor закрывает пропуски после недоступности at-least-once WebSocket. Внешние доставки остаются в
PostgreSQL при сбое Redis, имеют ограниченное число попыток и переходят в наблюдаемый `FAILED`; это не означает
гарантированную доставку или exactly-once у Telegram/email.

Перед ручным повтором оператор проверяет `status = 'FAILED'`, `last_error_code`, число попыток, срок хранения,
текущее согласие и привязку identity. Повтор сохраняет provider idempotency key и не применим к истёкшим или уже
принятым доставкам:

```sh
npm run notifications:retry-delivery --workspace @picklehub/backend -- \
    --delivery-id 00000000-0000-4000-8000-000000000000
```

Команда не печатает recipient, notification route или идентификатор доставки. Ответ провайдера мог быть потерян
после фактической отправки, поэтому повтор при timeout всё равно допускает внешний дубль; inbox-дедупликация от
этого не зависит.

`profiles` отделяет изменяемый профиль от generation-scoped статистики. Consumer перечитывает authoritative
матч при каждой доставке, поэтому duplicate и out-of-order события не складывают счётчики. Полное перестроение
возобновляет незавершённое shadow generation, сверяет count/checksum и атомарно переключает его после catch-up:

```sh
npm run profiles:rebuild-statistics --workspace @picklehub/backend
```

DUPR проверяется только локально по `PROFILE_DUPR_*`: backend не загружает страницу и не импортирует рейтинг.
Пустая allowlist выключает запись ссылки, а переход отдельно включается только явным `PROFILE_DUPR_OUTBOUND_ENABLED`.
Аватар использует приватный server-generated object key; до настройки media gateway upload закрыт.

`trust-safety` принимает закрытые отзывы, no-show и категоризированные обращения, хранит свободный текст только
как AES-256-GCM ciphertext с record-bound AAD и возвращает игроку минимальную квитанцию. Case repository выдаёт
evidence только назначенному moderator без conflict marker; player endpoints не сериализуют case, assignment,
встречные ответы или детали решения. `SAFETY_ENCRYPTION_KEY` отделён от ключей identity/communications, а
`SAFETY_POLICY_VERSION` сохраняется с каждым новым сигналом. Реальные safety-данные запрещены до legal,
residency и staffing approvals, перечисленных в `llm/_docs/trust-safety-data-policy.md`.

Активный block применяется в обе стороны к профилям, поиску матчей, join/request/waitlist и promotion. Общий уже
состоявшийся матч и его системные факты сохраняются; снятие блока не восстанавливает истёкшие заявки. Решение
`NO_SHOW_CONFIRMED` создаёт один idempotent effect, который projection worker применяет к статистике и умеет
отменить или восстановить при полном rebuild.

## Проверки

```sh
npm run lint --workspace @picklehub/backend
npm run typecheck --workspace @picklehub/backend
npm test --workspace @picklehub/backend
npm run test:integration --workspace @picklehub/backend
npm run build --workspace @picklehub/backend
```
