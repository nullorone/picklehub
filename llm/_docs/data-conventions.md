# Контракты и правила представления данных

## Версии и совместимость

- REST публикуется относительно `/v1`; WebSocket использует `/v1/ws`. Версия URL меняется только для
  несовместимого набора API, а совместимые расширения сохраняют текущую версию.
- OpenAPI и AsyncAPI изменяются раньше реализации. Удаление endpoint, operation/message, response, поля или enum
  value; переименование; сужение типа/формата/ограничения; добавление обязательного входа считаются потенциально
  несовместимыми и блокируются automated diff.
- Новое необязательное поле и новый endpoint совместимы. Клиенты игнорируют неизвестные поля только там, где это
  разрешено схемой; сервер не полагается на неизвестные client fields.
- Имена OpenAPI operations и AsyncAPI messages глобально уникальны и стабильны. Event/message type имеет
  dot-separated past-tense или protocol action и суффикс схемы `.vN`.

## REST

- `contracts/rest/main.tsp` — редактируемый источник REST wire contract; `openapi.yaml` детерминированно генерируется
  из него. Базовый server URL `/v1`; health endpoints доступны как `/v1/health/live` и `/v1/health/ready`.
- JSON использует `camelCase`, UTF-8 и `application/json`. Неизвестные поля request object отклоняются, если схема
  явно не говорит обратного. Внутренние Prisma-типы, database names и stack traces наружу не передаются.
- Ошибка использует `ErrorEnvelope`: стабильный uppercase `code`, безопасный локализованный `message`,
  необязательные безопасные field details и `requestId`. HTTP status остаётся основной категорией результата.
- `X-Request-ID` относится к одному запросу; `X-Correlation-ID` объединяет цепочку. Backend принимает только UUID,
  иначе создаёт новое значение, и возвращает оба заголовка. Значения не кодируют пользователя или payload.
- `Accept-Language` согласуется по BCP 47 с поддерживаемыми локалями. `ru-RU` — fallback; фактическая локаль
  возвращается в `Content-Language`. Machine codes, enum и identifiers не переводятся.

## Курсорная пагинация

- List endpoint использует `cursor` и `limit`, а ответ — `pageInfo.nextCursor` и `pageInfo.hasMore`. Offset наружу
  не публикуется.
- Cursor — непрозрачная, integrity-protected, URL-safe строка с версией, стабильным sort tuple и необходимым filter
  fingerprint. Клиент не создаёт и не анализирует cursor.
- Сортировка полностью детерминирована и заканчивается уникальным tie-breaker ID. Feature contract фиксирует
  sort order и поведение при изменении данных между страницами.
- Cursor ограничен областью субъекта/фильтров, имеет bounded lifetime и не содержит открытых персональных данных.
  Невалидный, истёкший или применённый к другим фильтрам cursor возвращает `INVALID_CURSOR`, не первую страницу.

## Идемпотентность

- Повторяемая мутация объявляет обязательный `Idempotency-Key` UUID. Область ключа — authenticated subject, HTTP
  method и canonical path; одна область не переиспользуется для другой операции.
- В одной транзакции хранятся key, canonical request fingerprint, состояние и итоговый status/body. Повтор с тем
  же fingerprint возвращает сохранённый результат и `Idempotency-Replayed: true`; другой fingerprint получает
  `409 IDEMPOTENCY_KEY_REUSED`.
- Одновременные запросы сериализуются database constraint/lock. Незавершённый владелец не создаёт второй эффект.
  Базовый срок записи — не менее 24 часов; feature увеличивает его, если реальный retry window дольше.
- В fingerprint не входят correlation/request IDs и volatile headers. Credentials и raw sensitive payload не
  сохраняются как часть idempotency metadata.

## UUID и PostgreSQL

- Все внешние и первичные идентификаторы имеют PostgreSQL type `uuid` и wire format lowercase canonical UUID.
  Последовательные database IDs, Prisma compound IDs и provider IDs наружу не выдаются.
- Server-generated entity/audit/outbox IDs используют UUIDv7 для index locality; client idempotency keys,
  request/correlation IDs и security tokens используют случайный UUIDv4 либо более сильную непрозрачную строку,
  когда её отдельно задаёт контракт. Идентификатор генерируется один раз владельцем записи.
- Provider ID хранится отдельным scoped field с uniqueness по provider и не заменяет внутренний UUID.
- Foreign keys имеют явное `ON DELETE` согласно жизненному циклу. Cascade запрещён для audit, ledger, outbox и
  иных записей, которые должны пережить soft deletion субъекта.

## Временные метки

- Instant хранится в PostgreSQL `timestamptz(3)`, нормализуется к UTC и сериализуется RFC 3339 с `Z` и не более
  миллисекунд. Naive timestamp и numeric Unix time в публичном контракте запрещены.
- `created_at` назначает база; `updated_at` меняется в той же транзакции с содержательным update. Business event
  имеет `occurred_at`, а техническая обработка — отдельные `published_at`/`processed_at`; их нельзя подменять.
- Локальная дата/время расписания хранится отдельно от IANA timezone. DST разрешается по явно сохранённой политике
  owning feature; timezone сервера или устройства не становится неявным источником истины.
- Сравнение срока жизни использует server/database clock. Тесты применяют управляемые часы, а не sleep.

## Мягкое удаление

- Soft deletion применяется только когда retention, восстановление или ссылки истории этого требуют; оно не
  добавляется каждой таблице автоматически. Поле `deleted_at timestamptz(3)` означает недоступность записи в
  обычных queries, а не завершённое физическое удаление персональных данных.
- Все repository reads по умолчанию исключают `deleted_at IS NOT NULL`; привилегированный просмотр — отдельный
  auditable use case. Уникальность активных значений задаётся partial unique index с `WHERE deleted_at IS NULL`.
- Delete/anonymize use case атомарно отзывает доступ, создаёт audit/outbox и планирует очистку производных данных.
  Восстановление — явная авторизованная операция. Identifier удалённой записи не переиспользуется.
- Hard deletion выполняется retention job после legal/retention gate и учитывает foreign keys, backups, search,
  cache и provider copies. `deleted_at` не используется как способ бессрочно хранить ненужные данные.

## Аудит в PostgreSQL

- Platform-owned `audit_entries` — append-only. Минимальные поля: UUIDv7 ID, actor type/ID, action, target type/ID,
  outcome, reason code, safe changed-field summary, request/correlation IDs, source и `created_at`.
- Критическое изменение и обязательная audit entry фиксируются одной транзакцией либо через тот же transactional
  outbox. Неудача обязательного аудита не превращается в успешную неаудированную операцию.
- Runtime role имеет только `INSERT`/ограниченное `SELECT`; `UPDATE`, `DELETE` и cascade для audit запрещены.
  Содержимое не дублирует email, credentials, chat/report text, coordinates и полные before/after objects.
- Audit schema, indexes, partition/retention и права создаются migration files и проверяются integration tests.

## Владение PostGIS

- Platform infrastructure владеет extension и migrations; модуль `venues` владеет разрешённой географией
  площадок. Другие модули ссылаются на `venue_id` и не копируют координаты без собственного утверждённого
  retention/use case.
- Координата площадки хранится как `geography(Point, 4326)`; порядок ввода — longitude, latitude. Constraints
  проверяют геометрию, SRID и допустимый диапазон, а spatial index создаётся миграцией.
- Расстояние вычисляет PostGIS в метрах с документированным оператором/index strategy. Клиентский расчёт не
  определяет eligibility или дедупликацию.
- Точные координаты и search origin считаются restricted personal data там, где описывают пользователя. Они не
  попадают в логи, analytics или Redis key и имеют отдельный retention policy.

## Владение Redis и BullMQ

- Redis — platform infrastructure и не источник истины. Каждый модуль использует port, владеет значением и
  документирует purpose, schema version, maximum TTL, cardinality и поведение при miss/eviction.
- Ключи имеют форму `<environment>:<module>:<purpose>:v<schema>:<opaque-key>`. Raw email, Telegram ID, credential,
  coordinate, chat text и иной sensitive value в ключе/значении запрещены; при необходимости применяется keyed
  hash с отдельным ротируемым секретом.
- Каждый application cache/rate-limit/session-ticket key имеет TTL. Permanent keys и `KEYS` в production
  запрещены. Инвалидация происходит после database commit; cache miss всегда восстанавливается из источника истины.
- BullMQ queues имеют versioned kebab-case names, bounded attempts/backoff, timeout, concurrency и quarantine.
  Job содержит event/message ID и минимальные непрозрачные ссылки, а не полный sensitive aggregate.
- Среды используют разные Redis instances или credentials и обязательный namespace. `FLUSHDB`/`FLUSHALL` и
  межмодульное чтение ключей запрещены production runtime role.

## Инструменты и review

Команды, generated-file policy, mock rules и процесс compatibility review описаны в
[`contracts/README.md`](../../contracts/README.md). Общие security-требования находятся в
[`security-privacy.md`](security-privacy.md), а направления зависимостей — в [`architecture.md`](architecture.md).
