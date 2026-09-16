# Эксплуатационные контракты и данные PickleHub

Документ фиксирует контрактный и data-plane результат этапа
`16-production-readiness/02-contract-data.md`. Он не подтверждает готовность production-инфраструктуры, успешный
restore, юридическое согласование, нагрузочную способность или назначение владельцев. До получения такого evidence
публичный запуск остаётся `NO-GO`.

## 1. Health, readiness и metrics

Все HTTP-маршруты находятся под общей major-версией `/v1`. Существующие `GET /health/live` и
`GET /health/ready` сохраняют operation ID и wire shape для соседних релизов:

- liveness проверяет только способность процесса продолжать работу и не обращается к зависимостям;
- readiness учитывает graceful shutdown и обязательные PostgreSQL/PostGIS и Redis, но возвращает только `ok` или
  `not_ready`; имена, адреса, latency, версии, release SHA и ошибки зависимостей наружу не выдаются;
- отрицательная readiness возвращает `503` и bounded `Retry-After`; probe не является пользовательским SLI;
- probes ограничиваются perimeter/infrastructure rate limit, а частый вызов не должен создавать self-DoS.

Новый `GET /operations/metrics` выдаёт OpenMetrics 1.0 и независимо версионирует allowlist заголовком
`X-Metrics-Schema-Version: 1`. Он доступен только из private monitoring network по отдельному
`X-Operations-Key`, имеет `no-store` и нейтральный `401`. Ключ не является пользовательским bearer, не даёт доступ
к REST/admin API и никогда не передаётся frontend. Runtime и perimeter реализуются следующим backend/operations
этапом; один OpenAPI-контракт не закрывает этот gate.

Разрешённые labels: сценарий из закрытого списка, `WEB|TMA|MOBILE`, bounded outcome, status class, worker и
bucket. Запрещены user/match/club/event/object ID, IP, точное время пользователя, координаты, URL, provider body,
exception message и произвольный текст. Exemplars выключены, пока trace allowlist и РФ-размещение не доказаны.
Версия `1` должна включать counters/histograms пяти SLI, outbox/queue lag, privacy-task lag/failures, reconciliation,
resource saturation и redaction violations; имена и buckets утверждаются до runtime-публикации.

## 2. Совместимость REST, событий и клиентов

Совместимость проверяется от merge-base через `contracts:breaking`; committed OpenAPI и TypeScript создаются только
генератором, а reproducible drift проверяется отдельно. Политика соседних релизов:

| Producer          | Consumer             | Обязательная совместимость во время rollout                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| backend `N`       | web/TMA/mobile `N-1` | Старые операции, required response fields и enum остаются понятны клиенту; новая возможность feature-detected |
| backend `N-1`     | web/TMA `N`          | Новый frontend не вызывает новый маршрут до server capability/rollout gate; mutation не имеет silent fallback |
| worker `N`        | API/outbox `N-1`     | Worker принимает старую schema version и дедуплицирует message ID                                             |
| worker `N-1`      | API/outbox `N`       | Producer не публикует новую major schema до обновления всех consumers                                         |
| migration job `N` | application `N-1`    | Только expand; старые columns/constraints остаются рабочими                                                   |
| application `N`   | schema `N-1`         | Запрещено, если код читает новую форму; readiness/rollout не начинается до successful migration smoke         |

Аддитивные optional поля, новые операции и новые event types допустимы внутри major. Новое required request field,
сужение диапазона, удаление enum/response/path, переименование operation/message ID и изменение семантики требуют
новой REST major либо `.v2` события. Старая версия работает минимум один полный mobile forced-upgrade window и
пока telemetry подтверждает отсутствие поддерживаемых consumers. Дата объявления, owner, last-seen и removal
release записываются в release evidence; отсутствие наблюдений не заменяет срок.

Метрики версионируются отдельно: breaking rename или label meaning выпускается как schema `2`, обе схемы доступны
одновременно не менее одного полного alert evaluation window, dashboards/alerts переключаются до удаления `1`.
Health shape не используется для build discovery, feature negotiation или debug.

## 3. Стратегия миграций

Production job один, сериализован deployment lock и имеет отдельную роль. До каждой миграции фиксируются размер
таблиц/indexes, replica lag, свободное место, ожидаемое время, `lock_timeout`, `statement_timeout`, kill/continue
decision и проверенный backup/PITR point. `prisma migrate deploy` не запускается API replica. После выполнения
проверяются schema drift, constraints, базовые `C0`, outbox high-water mark и reconciliation.

Expand/migrate/contract занимает минимум три совместимых релиза:

1. `expand`: nullable column/table/type и dual-read capability без удаления старого;
2. `migrate`: resumable bounded batches с durable cursor, метриками progress/error и pause;
3. `contract`: только после telemetry об отсутствии старых writers/readers, backup и явного go/no-go.

`CREATE INDEX` на заполненной большой таблице выполняется `CONCURRENTLY` отдельным non-transactional runbook;
constraint сначала создаётся `NOT VALID`, затем валидируется отдельно. Column rewrite, enum replacement, table
rewrite, `DROP`, `SET NOT NULL` и немедленная проверка FK/CHECK не входят в обычный rollout. SQL применённой
миграции не редактируется. Data rollback выполняется forward-fix; restore разрешён лишь при подтверждённой потере/
порче и останавливает writes на весь affected aggregate.

### Аудит существующей цепочки

`EMPTY` означает только clean install без пользовательских строк. `EXPAND` допускается на заполненной базе после
preflight. `BLOCKED` запрещает production rollout до отдельного replacement/runbook и человеческого approval.
Оценка времени до измерения table/index size не считается доказанной.

| Миграция                                            | Фаза      | Lock/runtime                                                             | Recovery и backup gate                                        |
| --------------------------------------------------- | --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `20260904090000_platform_foundation`                | `EMPTY`   | PostGIS требует проверенную privileged role; DDL только на пустой schema | Снести одноразовую среду; restore point до chain              |
| `20260908090000_identity_onboarding`                | `EMPTY`   | 14 таблиц, FK/CHECK/triggers/indexes; populated schema недопустима       | Forward-fix; clean backup/restore до chain                    |
| `20260910090000_venues_contract_data`               | `EMPTY`   | GiST/GIN, PostGIS functions и FK; измерить disk/extension                | Forward-fix; clean restore и geo smoke                        |
| `20260910120000_venues_backend`                     | `EXPAND`  | Новые import tables, короткий metadata lock; writer после smoke          | Forward-fix либо drop только до writer; schema backup         |
| `20260910150000_matches_contract_data`              | `EMPTY`   | FK к venues и deferred capacity triggers; clean install                  | Forward-fix; restore и race smoke состава                     |
| `20260910180000_matches_backend`                    | `EXPAND`  | Новая statistics table/index; uniqueness preflight                       | Выключить worker и forward-fix; backup match facts            |
| `20260911100000_chat_notifications_contract_data`   | `EMPTY`   | Sequence/notification tables; clean install                              | Forward-fix; restore sequence/catch-up smoke                  |
| `20260911130000_chat_notifications_backend`         | `EXPAND`  | Additive delivery recovery, worker после schema smoke                    | Отключить worker, forward-fix; outbox high-water backup       |
| `20260911160000_profiles_contract_data`             | `EMPTY`   | FK к match/users; populated требует `NOT VALID`/concurrent index         | Forward-fix; restore и projection rebuild smoke               |
| `20260911190000_profiles_backend`                   | `EXPAND`  | Nullable/default-free generation state; bounded backfill                 | Вернуть reader, forward-fix; backup source contributions      |
| `20260911220000_trust_safety_contract_data`         | `EMPTY`   | Restricted FK/triggers; encryption/legal gate отдельно                   | Forward-fix; encrypted backup/access restore check            |
| `20260911230000_admin_backoffice_contract_data`     | `BLOCKED` | Populated audit alter и blocking unique index; duplicate preflight       | Replacement migration; PITR и immutable audit check           |
| `20260912120000_clubs_contract_data`                | `EMPTY`   | Большой FK graph; clean install                                          | Forward-fix; restore и deferred-owner race smoke              |
| `20260912170000_tournaments_contract_data`          | `EMPTY`   | Aggregate graph и strategy seeds; checksum/golden smoke                  | Forward-fix; backup aggregate и deterministic regenerate      |
| `20260913090000_gamification_contract_data`         | `EMPTY`   | Ledger/season constraints/seeds; clean install                           | Forward compensation/fix; ledger backup/reconciliation        |
| `20260913120000_gamification_backend`               | `BLOCKED` | `DROP INDEX` и blocking rebuild оставляют окно без защиты                | Concurrent replacement then drop; PITR и duplicate proof      |
| `20260913160000_content_news_contract_data`         | `EMPTY`   | GIN/JSON functions/cyclic pointers; clean install                        | Forward-fix; restore source/revision/projection consistency   |
| `20260915120000_advertising_contract_data`          | `EMPTY`   | Budget/frequency triggers; external ads остаются off                     | Forward-fix; counter/event reconciliation from backup         |
| `20260915150000_advertising_backend_guards`         | `BLOCKED` | Drop/recreate triggers и validated CHECK; window/preflight               | Forward replacement; PITR и budget invariant smoke            |
| `20260916090000_mobile_parity_contract_data`        | `BLOCKED` | Drop/re-add checks, enum values и push columns; split releases           | Forward replacement; backup sessions/devices, revoke on doubt |
| `20260916130000_mini_game_contract_data`            | `BLOCKED` | Enum rewrite блокирует три таблицы и может переписать их                 | Additive enum replacement; PITR и XP ledger reconciliation    |
| `20260916160000_mini_game_backend`                  | `EXPAND`  | Immutable seeds; exact overlap/checksum preflight                        | Новая version/reversal вместо правки; backup seeds            |
| `20260916190000_production_readiness_contract_data` | `EXPAND`  | Новые control-plane tables/types; writers после smoke                    | Отключить workers, forward-fix; backup control receipts       |

Для строк `BLOCKED` утверждённого production runbook сейчас нет. Разрешённое решение до первого production —
создать replacement migrations, доказать upgrade на production-like copy и получить подписи release owner и DBA.
Если любая из них уже применена к реальной заполненной базе, менять файл запрещено: создаётся forward migration,
а rollout остаётся остановленным. Destructive rollback вслепую запрещён.

## 4. Privacy, retention и export control plane

Миграция создаёт минимальный control plane без payload в очередях:

- `privacy_requests` хранит opaque receipt, subject FK, kind, policy, deadline и состояние. Export capability
  хранится только как ciphertext с key version, коротким expiry и one-time consumed timestamp; erasure не имеет
  artifact;
- `data_lifecycle_tasks` разбивает запрос/retention/reconciliation по закрытому sink и data bucket. Уникальность
  делает повтор идемпотентным, lease позволяет безопасно вернуть abandoned task;
- `deletion_suppressions` — append-only keyed marker без raw email/Telegram ID; он применяется раньше открытия
  restored DB, retries и provider imports;
- `data_legal_holds` адресует только hash конкретной записи, имеет reason, owner, review и expiry. Он не блокирует
  весь аккаунт;
- `storage_object_records` хранит HMAC key и encrypted locator, owner reference, retention и terminal deletion;
- `reconciliation_runs/findings` хранят high-water mark, counts, hash reference и bounded repair code, но не raw
  key, payload или identity.

Export требует fresh re-auth не старше пяти минут. Worker читает consistent PostgreSQL snapshot, применяет
field-level allowlist и ownership/access rules, не включает safety evidence другого лица, provider secret,
credential, audit другого субъекта и internal fraud data. Archive шифруется новым data key, object TTL bounded,
download одноразовый; лог содержит только receipt/outcome. `READY` означает созданный и проверенный artifact, а не
выполненную доставку.

Erasure сначала повышает auth epoch, отзывает sessions/capabilities, скрывает public projections и создаёт
suppression. Затем задачи очищают PostgreSQL owned/derived rows, Redis/cache, queue/DLQ, search, objects, analytics,
providers и отмечают backup horizon. `COMPLETED` разрешён только после успеха всех обязательных online sinks и
reconciliation; backup физически истекает отдельно. Legal hold переводит только конкретную task в `BLOCKED` и
создаёт alert. Failure остаётся видимым и не выдаётся пользователю за завершение.

Retention jobs используют тот же task protocol, выбирают строки по indexed expiry и удаляют bounded batches с
pause между транзакциями. Raw operational telemetry хранится по утверждённому schedule; агрегаты не должны
позволять re-identification. До legal approval предлагаемые сроки остаются конфигурацией `disabled`, не default.

## 5. Reconciliation и восстановление

PostgreSQL — источник authoritative domain state и outbox. Redis, BullMQ state, search/read projections и object
inventory восстанавливаются так:

1. restore PostgreSQL/PITR в изолированное окружение и не принимать traffic;
2. применить deletion suppression и проверить schema/migration ledger;
3. определить outbox high-water mark, вернуть expired claims и дедуплицированно replay consumers;
4. очистить versioned Redis namespaces целевой среды либо построить новый namespace; глобальные `FLUSH*` запрещены;
5. rebuild projections в shadow generation и атомарно переключить только после count/hash/access checks;
6. сравнить `storage_object_records` с versioned provider inventory на одном high-water mark: missing блокирует
   affected media, orphan quarantined до retention delay, автоматическая публикация запрещена;
7. запустить `POSTGRESQL_REDIS`, `POSTGRESQL_OBJECT_STORAGE`, `POSTGRESQL_PROJECTIONS` и `POSTGRESQL_OUTBOX`,
   устранить findings и лишь затем включить readiness;
8. smoke пяти критических сценариев синтетическими аккаунтами и записать фактические RTO/RPO.

Reconciliation не удаляет unknown object немедленно, не восстанавливает behavioral analytics задним числом и не
синтезирует domain events без authoritative source. Mismatch нулевого инварианта — `SEV-1` или выше.

## 6. Матрица окружений

| Свойство          | `local`                | `test`                      | `staging`                                 | `production`                                              |
| ----------------- | ---------------------- | --------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Данные            | Только synthetic       | Ephemeral synthetic         | Synthetic/irreversibly anonymized         | Реальные только после legal gate                          |
| Топология         | Compose PostGIS/Redis  | Изолирована на CI job       | Та же mandatory topology/version family   | РФ, approved managed services, redundancy evidence        |
| Namespace/account | Developer scoped       | Job scoped                  | Отдельный project/account                 | Отдельный least-privilege account                         |
| Objects/backups   | Disposable bucket      | Ephemeral emulator/bucket   | Отдельный encrypted bucket, restore drill | Versioning, inventory, encrypted PITR/backup в РФ         |
| Providers         | Fake/disabled          | Deterministic fake          | Sandbox только после review               | Только approved adapter/account; optional off by default  |
| Metrics           | Local scrape без PII   | Assertions/redaction canary | Private monitoring, baseline              | Private monitoring, audited access/retention              |
| Secrets           | Local untracked values | CI ephemeral                | Secret manager, staging-only keys         | Secret manager/HSM-backed where available; no shared keys |
| Access            | localhost              | CI identity                 | Named team access                         | JIT/least privilege, MFA, break-glass и audit             |

Staging не содержит копию production PII. Cross-environment DB URL, Redis credential/namespace, bucket, provider
account, encryption/signing key или monitoring key является startup/release failure.

## 7. Владение и ротация секретов

Реестр хранит только name/purpose/owner/custodian/environments/version/created/next-rotation/last-tested и evidence
reference — никогда value. До назначения людей роли ниже являются незакрытым gate.

| Класс                                  | Владелец роли                            | Ротация и overlap                                                                                        |
| -------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Identity HMAC/encryption, Telegram bot | Security + identity owner                | 90 суток; decrypt/verify `current+previous`, новые записи только current; bot revoke по provider runbook |
| Communication/safety/mini-game crypto  | Security + module owner                  | 90 суток и немедленно при incident; versioned ciphertext/key ID, bounded re-encryption                   |
| DB/Redis/object credentials            | Infrastructure owner                     | 60 суток; создать new principal, проверить probes/jobs, revoke old после max connection/lease TTL        |
| Provider/API credentials               | Integration owner + legal gate owner     | ≤90 суток или provider limit; canary, switch, revoke; no unapproved fallback                             |
| Operations metrics key                 | SRE owner                                | 30 суток; два active versions максимум один scrape interval, neutral failed-auth metric                  |
| Backup encryption/recovery key         | Security, независимый recovery custodian | Annual cryptographic rotation, quarterly access test; escrow/access отдельно от backups                  |
| Session/signing keys                   | Security + identity owner                | Versioned key ring, overlap не короче max token TTL; emergency revoke повышает auth epoch                |

Автоматическая доставка секретов должна поддерживать version pin, atomic rollout, redacted config diff и rollback
к предыдущей версии без возврата отозванного ключа. Rotation считается успешной только после canary, health,
consumer/backlog check и проверки, что old version больше не используется. Значения запрещены в Git, image,
frontend env, logs, traces, audit, metrics labels, queue и support export.

## 8. Открытые gates

- Metrics endpoint, privacy workers, export artifact delivery, reconciliation и secret rotation runtime ещё не
  реализованы; это объём следующих этапов.
- Ни одна `BLOCKED` migration не имеет фактического approval или production-like timing evidence.
- Clean apply, upgrade с предыдущей schema, lock/race, backup/restore и object/Redis outage требуют реальных
  PostgreSQL/PostGIS/Redis/object services.
- Legal retention, export/deletion deadline, РФ-размещение, processors и provider contracts не утверждены.
- Generated compatibility и static policy tests доказывают форму, но не фактическую доступность или безопасность.
