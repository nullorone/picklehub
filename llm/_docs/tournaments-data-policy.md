# Контракты и данные турниров

Документ фиксирует результат `llm/10-tournaments/02-contract-data.md`. Он определяет wire/storage-контракт и
границу стратегии, но не объявляет реализованными backend use cases, генераторы форматов или клиентские экраны.

## Единый агрегат и API

Все восемь встроенных форматов сериализуются через `Tournament`, `Entrant`, `EntrantMember`, `Stage`, `Round`,
`TournamentMatch`, `CourtAssignment`, `Standing`, `FormatDefinition` и `PaymentMark`. Отдельных таблиц и DTO для
Americano, Swiss, ladder или playoff нет. Отличается только закрытая `TournamentPresetConfiguration`, её точная
semantic version и детерминированный граф общей формы.

Публичны поиск, карточка и plan опубликованного турнира. Scoped entrant list и все мутации требуют bearer;
браузерные мутации также требуют Origin, CSRF, UUIDv4 idempotency key и ожидаемую версию агрегата/ресурса. Hard
delete отсутствует: terminal cancel сохраняет результаты и аудит. Регистрация, check-in/withdrawal, ручная отметка
внешней оплаты, seeding/start, start/complete round, score/walkover/correction, pause/resume/completion/cancel имеют
отдельные операции. Цена — только неотрицательное `priceMinor + ISO 4217 currency`; API не принимает реквизиты,
provider transaction, evidence, checkout, invoice или callback.

`CUSTOM_DSL` зарезервирован в enum для будущей совместимости, но создание всегда возвращает
`CUSTOM_DSL_DISABLED`. В БД соответствующий `FormatDefinition` может существовать только неактивным и trigger
запрещает использовать его в `Tournament`. Ни JavaScript, ни expression/template evaluator в конфигурации нет.

## Версии preset

Редактируемый JSON Schema — `contracts/schemas/tournament-presets.v1.schema.json`, `$id` и `schemaVersion=1.0.0`.
В нём восемь закрытых (`additionalProperties: false`) `$defs`. TypeSpec отражает те же варианты как discriminated
union. `format_definitions` хранит `formatCode + strategyVersion + schemaVersion`, `$id`, JSON Schema и её SHA-256;
строка immutable. Конфигурация конкретного турнира находится только в snapshot. Изменение самой схемы или
алгоритма выпускает новую semantic version, а не переписывает старую.

При создании турнира сохраняются definition reference, snapshot и hash. После публикации snapshot, capacity и
venue reference неизменяемы; после seeding также фиксируются entrants, seed, уникальный публичный `tieBreakLot` и
plan checksum. Guardrails форматов проверяются схемой и БД: Americano кратен четырём, double elimination — степень
двойки, King of Court — чётный, остальные размеры и параметры ограничены требованиями. Межформатные ограничения,
которые зависят сразу от нескольких JSON-полей (pool playoff size, Swiss `rounds <= N-1`, `Americano rounds <=
N-1`), backend обязан повторно валидировать до publish/seed; authoritative acceptance принадлежит транзакции.

## `TournamentFormatStrategy`

Стратегия идентифицируется точной парой `formatCode + strategyVersion` и является чистой allowlisted функцией:

```text
generate(input: TournamentFormatStrategyInput) -> TournamentFormatStrategyOutput
```

Вход содержит только immutable `FormatDefinition`, ordered entrants с seed/lot, authoritative terminal result
revisions и ожидаемую `projectionRevision`. Выход содержит общий plan (`Stage[]`, `Round[]`, `TournamentMatch[]`,
`Standing[]`), список обязательных terminal match IDs, возможного champion и canonical SHA-256 projection.

Инварианты интерфейса:

- одинаковый canonical input и точная strategy version дают byte-identical canonical output/checksum;
- стратегия не читает clock, random, Redis, profile, club role, network или environment; randomness материализована
  во входных lots до вызова;
- каждый stage/round/match имеет стабильный strategy key; entrant не занимает два slot одной исполняемой волны;
- source slot ссылается на один `WINNER`/`LOSER`; один source outcome не заполняет два downstream slot;
- следующий зависимый round не готов до terminal источников; bye/walkover/double walkover являются явными
  terminal outcomes, draw не существует;
- standings всегда заканчиваются lot или конструктивно уникальной ladder/court position;
- стратегия не пишет БД и не публикует событие. Application layer блокирует root, сверяет expected versions и
  checksum, затем одним commit сохраняет plan/audit/outbox/receipt.

`contracts/fixtures/tournament-strategy-examples.v1.json` — golden wire fixtures контрактного уровня: круговой
турнир с пятью entrants и одним bye в каждом раунде, single elimination на шесть entrants с bracket 8 и
автопроходами seeds 1/2, а также полное равенство до последнего публичного lot. Это не замена algorithm unit tests,
которые добавляет backend prompt.

## Конкурентность и восстановление

Root `tournaments` содержит `version`, `projectionRevision` и `projectionChecksum`. Registration/promotion,
seeding, round generation, result/correction и recovery должны начинаться с `SELECT ... FOR UPDATE` root и
expected-version compare. Уникальности `(stage, sequence, generation)`, `(tournament, strategyKey)`, `(round,
sequence)` и `(sourceMatch, sourceOutcome)` делают повтор generation безопасным независимо от BullMQ lease.

Результаты append-only с уникальной `(match, revision)`; `authoritativeResultId` и `resultRevision` связаны deferred
reciprocal guard. Corrections создают новую строку. Если downstream уже стартовал, смена winner отвергается, а
application layer переводит tournament в `PAUSED`; сыгранная зависимость не переписывается. Completion marker имеет
PK tournament ID, checksum/revision и append-only trigger. Final standing rank уникален внутри revision.

Recovery перечитывает snapshot, seeds/lots и authoritative results, запускает точную strategy version и сравнивает
canonical checksum. Duplicate slot, невозможная зависимость, unresolved tie, отсутствующая версия стратегии или
checksum mismatch fail closed в `PAUSED`. Resume требует устранённой причины, повторной сверки, expected version,
idempotency и audit; Redis/BullMQ не является источником истины.

## Индексы и план миграции

Все горячие индексы начинаются с `tournament_id` либо родительского `stage_id/round_id`: public search —
`(state, starts_at, id)`, roster/FIFO — `(tournament_id, state, ...)`, execution — `(tournament_id, state,
round_id)`, standings — `(tournament_id, revision, rank)`, audit — `(tournament_id, created_at, id)`. Поэтому
стоимость проведения зависит от одного bounded tournament (maximum 128 entrants), а не от всей платформы. UUID
остаются opaque; cursor использует стабильный sort и snapshot.

Миграция additive: сначала enum/definition/root, затем entrants, graph/results/standings, receipts/audit/marker,
после чего constraints и triggers. Для существующих строк backfill не нужен, потому что tournament storage раньше
не существовал. Production rollout обязан выполнить `prisma migrate deploy`, PostgreSQL constraint/integration
tests, rehearsal rollback приложения (DDL не откатывается удалением данных) и backup/restore check до включения
route. Новый strategy version сначала регистрируется неактивным, проверяется golden fixtures, затем активируется для
новых drafts; старый runtime сохраняется, пока существуют его snapshots.

## События и приватность

`tournament.events.v1` — internal transactional outbox, at-least-once. `messageId` дедуплицирует доставку;
aggregate/resource/projection revisions подавляют старый replay. Пять сообщений несут только opaque tournament /
entrant / tournament-match references, format или закрытое состояние/outcome. В них нет roster/pair graph,
user/club/venue ID, payment/price, score/winner, seed/rating, расписания/координат, названия/описания, actor или
reason. Consumer перечитывает минимальную projection через авторизованный port.

Операционные receipts хранят encrypted response 24 часа и scoped unique key actor+method+canonical path+key.
Result, audit и completion history append-only. Retention и account-deletion правила остаются такими, как в
`security-privacy.md`; production legal basis, РФ-residency, legal hold, backup expiry и физическая очистка всё ещё
являются обязательными gates, а не подтверждённым соответствием.
