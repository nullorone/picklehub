# Усиление backend и эксплуатационные инструкции PickleHub

Документ фиксирует результат `16-production-readiness/03-backend.md`. Это реализованный локально reference и
набор проверяемых процедур, но не свидетельство production-развёртывания, российского размещения, успешного
восстановления или provider/legal approval. Публичный запуск остаётся `NO-GO` до закрытия gates из требований и
контрактного аудита миграций.

## 1. Контейнеры и выпуск

Backend собирается многоэтапно. Build stage содержит инструменты разработки, а финальные `runtime` и `migration`
получают только `npm ci --omit=dev`, сгенерированный Prisma client, `dist`, Prisma schema/migrations, OpenSSL и
`tini`. Оба запускаются как `node`, а не root; секреты и `.env` в образ не копируются. Prisma CLI переведён в
runtime dependency только для отдельной release-команды миграции.

Локальный [`docker-compose.yml`](../../docker-compose.yml) имеет CPU, memory и PID limits. API/worker read-only,
имеют только bounded `/tmp`, `no-new-privileges`, 15-секундный stop grace и `tini`. Readiness ждёт завершения
одноразового migration job. Worker при остановке прекращает новые poll и ждёт текущий dispatch/job; BullMQ workers
закрываются до Redis. Outbox остаётся в PostgreSQL до успешной идемпотентной публикации, поэтому перезапуск не
превращает committed event в потерянный факт.

[`deploy/compose.production.yml`](../../deploy/compose.production.yml) — provider-neutral reference для уже
выбранных managed PostgreSQL/PostGIS и Redis, а не команда на создание production. Он требует immutable image
digests и все credentials через environment injection, публикует порты только на loopback для внешнего TLS/private
perimeter и не содержит PostgreSQL/Redis с пользовательскими данными. Перед запуском обязательны:

1. закрытие пяти `BLOCKED` migration paths из contract-data документа;
2. подтверждённые РФ-регионы primary, replica, backup, logs, monitoring и object storage;
3. TLS verification, encryption at rest, PITR ≤5 минут и отдельная проверяемая daily copy;
4. provider quotas, DPA/terms, роли, rotation и break-glass evidence;
5. production-like upgrade/restore drill и подписи release owner/DBA/security/legal.

`deploy/.env.production.example` содержит только нерабочие placeholders. `RU_DATA_RESIDENCY_CONFIRMED=true` —
осознанный approval gate, а не автоматическая проверка географии. Без него, отдельного metrics key или production
identity/communication/safety/game secrets приложение fail-closed при старте.

Релиз выполняется в порядке: backup/PITR marker → preflight/lock timing → `migrate` как один job → migration smoke →
API canary → worker → web/TMA. Миграция не запускается из API replica. При несовместимой DDL или нарушении
инварианта rollout останавливается и применяется утверждённый forward-fix; blind down migration запрещена.

## 2. HTTP, lifecycle и зависимости

- JSON/form body ограничен 256 KiB, form parameters — 100, WebSocket gateway — 16 KiB. Perimeter обязан иметь
  меньшие route-specific limits для upload-free API и отдельный connection/concurrency limit.
- Process-local rate limit по адресу защищает от случайного self-DoS: 300 HTTP/min и 120 probes/min. Это второй
  слой; общий лимит, trusted proxy parsing, bot/abuse policy и distributed enforcement принадлежат perimeter.
- Readiness зависит только от shutdown state, PostgreSQL/PostGIS и Redis, имеет timeout и не раскрывает topology;
  liveness не обращается к зависимостям. При начале shutdown readiness становится `503`, новые задачи перестают
  планироваться, active work drain-ится в пределах container grace.
- Email, Telegram notifications, geocoder и Overpass имеют bounded timeout и process-local circuit breaker: после
  пяти ошибок он открывается на 30 секунд и допускает только одну half-open пробу. Outbox/BullMQ retries используют
  exponential backoff; terminal failures остаются в PostgreSQL quarantine или BullMQ failed set.
- Restart-scoped аварийные переключатели выключают `content`, `advertising`, `mini-game`, outbound notifications и
  venue providers. Они не удаляют данные и не помечают deferred delivery успешной. Изменение требует incident ID,
  второго проверяющего, audit конфигурации и rolling restart.

Resource isolation остаётся одним модульным монолитом: API и worker — разные процессы/лимиты; content ingestion
имеет concurrency 1, outbox bounded batch, provider calls не используют DB pool как очередь. До пилота pool limits,
connection budgets и 2× sustained/4× burst должны быть измерены на выбранных managed plans.

## 3. Logs, traces, errors и metrics

Pino пишет JSON с service/role/environment, request/correlation/trace ID и allowlisted событиями. W3C trace ID
принимается только в строгом `traceparent` либо генерируется; spans, URL/body и exemplars наружу не экспортируются.
Exception filter пишет тип ошибки, но не message/stack/request body. Существующий recursive redactor скрывает auth,
cookies, Telegram init data, email, magic links, chat/safety text, coordinates, scores, proofs, capabilities и ad
identifiers. Подключение внешнего tracing/error-reporting exporter запрещено до РФ-размещения, retention/access
review и canary-теста redaction; до этого структурированный error event — канонический безопасный report.

`GET /v1/operations/metrics` реализует контракт OpenMetrics 1.0 schema `1`. Он использует отдельный constant-time
checked `X-Operations-Key`, `no-store` и должен быть доступен только private monitoring network. Endpoint публикует
bounded scenario/outcome/status labels, latency histogram, memory, outbox state/age, privacy tasks,
reconciliation и telemetry allowlist violations. Ни ID, URL, IP, provider text, coordinates, object key, arbitrary
exception message, ни exemplar не попадают в payload. PostgreSQL недоступность делает scrape `503`, но не меняет
product readiness.

Dashboard: [`ops/grafana/picklehub-overview.json`](../../ops/grafana/picklehub-overview.json). Alerts:
[`ops/prometheus/alerts.yml`](../../ops/prometheus/alerts.yml). Они покрывают provisional C0/C1 burn, outbox lag/
quarantine, privacy/reconciliation failure, memory и label violation. Queue wait/failed, provider outcome/circuit,
DB pool/disk/replica lag и object inventory требуют provider/exporter integration; отсутствие этих series оставляет
monitoring gate открытым. Alert routing, inhibition и тестовая page-доставка также не подтверждены.

## 4. Backup, restore и migration drill

Managed PITR и encrypted provider backup являются основным production механизмом. Скрипт
[`scripts/operations/backup-postgres.sh`](../../scripts/operations/backup-postgres.sh) создаёт permission-restricted
logical copy с checksum для учебного восстановления; он не заменяет PITR и не должен выгружать production PII на
неутверждённый host. Backup directory, filesystem encryption, РФ-размещение и доступ выбирает оператор явно.

`scripts/operations/restore-drill.sh /absolute/backup.dump` проверяет checksum, поднимает уникальный одноразовый
Compose project с tmpfs PostgreSQL/Redis, восстанавливает dump, запускает текущую migration chain, проверяет PostGIS
и outbox, затем всегда уничтожает drill volumes. Перед признанием drill успешным оператор вручную фиксирует:

- start/end, backup/PITR timestamp и фактические RTO/RPO;
- schema ledger/constraints, deletion suppressions и outbox high-water mark;
- reconciliation PostgreSQL↔Redis/objects/projections/outbox без unresolved zero-budget findings;
- synthetic auth/search/join/chat/completion без реальных персональных данных;
- object missing quarantine/orphan delay, session revoke и доказательство отсутствия credentials в отчёте.

Provider-native PITR rehearsal использует тот же порядок в отдельном account/project и не направляет traffic.
Проверка должна быть до приглашённого пилота, ежеквартально и перед рискованной миграцией. Наличие backup без
успешного restore не закрывает gate.

## 5. Incident runbooks

Общий порядок: назначить incident commander и severity, заморозить rollout, сохранить UTC timeline/request IDs и
metrics snapshots без restricted data, выбрать безопасную деградацию, затем проверить recovery и 48-часовой
burn-rate. Никогда не выполнять global Redis `FLUSH*`, массовый replay, ручное редактирование ledger/outbox или
восстановление поверх работающей production БД.

### C0: authentication, join or match completion

1. Остановить rollout; при нарушении инварианта объявить минимум `SEV-1` и закрыть затронутую mutation на perimeter.
2. Разделить 4xx stale authorization, 5xx, DB contention и provider failure по bounded metrics/request IDs.
3. Для email включить честную деградацию Telegram либо наоборот; нельзя обходить proof или выдавать успешный join.
4. При DB corruption остановить writes affected aggregate, восстановить в isolated environment и сверить audit,
   roster/result/statistics/outbox до traffic. После исправления выполнить race/idempotency smoke.

### C1: search or chat

1. Сохранить C0 capacity: выключить content/ads/game и ограничить expensive reads.
2. При geocoder/maps отказе оставить каталог/list и запретить ложные live suggestions. При WebSocket отказе вернуть
   polling/catch-up по durable sequence; push receipt не считать chat delivery.
3. Проверить backlog, authorization при reconnect и gap-free sequence до снятия деградации.

### Outbox or queue backlog

1. Остановить соответствующего consumer, снять outbox high-water mark, Redis/DB health и oldest age.
2. Исправить dependency/schema/poison cause. Один PostgreSQL quarantine повторяется только командой
   `npm run start:outbox:retry --workspace @picklehub/backend -- <event-uuid>` после проверки payload schema и
   idempotency consumer. Exit `2` означает, что event не был в quarantine.
3. Один BullMQ failed job повторяется
   `npm run start:queues:retry-failed --workspace @picklehub/backend -- <queue-key> <job-id>`. Массовый replay
   запрещён; batch расширяется только отдельным reviewed runbook с rate cap.
4. Сверить domain source, outbox state, consumer receipt/projection и queue counts. Redis loss восстанавливается
   replay из PostgreSQL/outbox; committed event не синтезируется из telemetry.

### Privacy or reconciliation failure

Не переводить request в `COMPLETED`. Определить sink/bucket по bounded code, применить deletion suppression до
открытия restored DB, оставить legal-hold task `BLOCKED` и page legal owner. Missing object скрывается, orphan
карантинируется до retention delay. Raw locator/identity не переносится в ticket или metrics.

### Resource saturation

Остановить C2 и ingestion, затем проверить RSS/heap, DB connections, queue lag, replica lag и disk forecast.
Restart допустим только как containment: до него committed outbox остаётся в PostgreSQL, а после требуется
high-water reconciliation. Увеличение limit без capacity evidence не является устранением причины.

### Telemetry or redaction

Остановить exporter/scrape exposure, отозвать operations credential, определить затронутый storage/access и
классифицировать privacy incident. Запрещено копировать leaked value в incident chat. После удаления по retention
policy добавить canary regression и выполнить credential rotation.

## 6. Проверяемые и внешние gates

Локально проверяются TypeScript tests, metrics allowlist, circuit states, redaction, health/shutdown, Compose config,
image user/dependency inventory, migration/restore scripts syntax, JSON/YAML parse и contract compatibility. Реальный
container restart, Redis/provider outage, PostgreSQL PITR, object reconciliation, alert delivery, production-like
migration timing и РФ-регионы требуют доступов и инфраструктуры и поэтому не должны отмечаться успешными этим
этапом. Их evidence с фактическими временами и владельцами добавляется перед `16-production-readiness/05`.
