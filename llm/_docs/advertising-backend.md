# Backend рекламы

Документ фиксирует реализацию этапа [`13-advertising/03-backend.md`](../13-advertising/03-backend.md). Он не
подтверждает правовое основание показа, регистрацию рекламы, договор с рекламодателем, проверку ОРД/ЕРИР или
разрешение внешнего провайдера. Реальный provider/SDK не выбран, а production delivery остаётся закрыт до этих
проверок и клиентского этапа.

## Выдача и измерение

`AdvertisingModule` реализует опубликованные client и `/admin/advertising` маршруты. Каждая browser mutation
проверяет Origin/CSRF, UUIDv4 idempotency key и возвращает `private, no-store`. Idempotency scope хранится как HMAC,
request fingerprint — как HMAC, response — как AES-256-GCM ciphertext. Raw delivery/click/cap token не записывается:
в PostgreSQL находятся только purpose-separated HMAC.

Выбор использует только закрытый `AdDecisionContext`. Сначала проверяются critical state и placement, затем active
UTC schedule, exact approved revision, placement/creative format и `TargetRule`. Подходящие кампании сортируются по
`HOUSE_EMERGENCY → GUARANTEED_DIRECT → STANDARD_DIRECT`, затем по immutable snapshot hash и campaign UUID. Поэтому
одинаковый inventory/context даёт стабильный порядок без user history, координат, IP, URL или advertising/device ID.

Issuance резервирует максимальную стоимость под row lock кампании. CPM резервирует округлённую вверх стоимость
одного viewable impression (`ceil(rateMinor / 1000)`), CPC — стоимость одного valid click, fixed sponsorship — ноль.
Viewable impression требует 50% и одну foreground-секунду; click требует trusted activation и exact normalized
HTTPS host из approved redirect allowlist. Отдельные unique delivery facts и зашифрованная operation receipt делают
повторы идемпотентными. Outbox содержит только opaque inventory/event IDs и время committed fact.

## Частота, конкуренция и допустимый консерватизм

PostgreSQL — источник истины. Decision блокирует campaign и `DeliveryCounter`, перечитывает rolling 24h/7d facts и
проверяет пятиминутный refresh. Trigger повторяет эти проверки при вставке viewable event, сериализует counter и
защищает hard budget. Параллельные issuance до первого viewable события допустимы только в пределах уже
зарезервированного бюджета: они не считаются impressions, а viewable events сверх 3/24h, 10/7d или approved lower cap
БД отвергает. Это документированный допуск, не разрешение показать больше измеренных impressions.

Redis хранит только пятиминутный ускоряющий cache по HMAC opaque counter ID и token-scoped anti-fraud rate limits.
Cache miss/сбой не ослабляет SQL trigger. Запись кеша выполняется до завершения owning transaction, поэтому редкий
rollback может дать только консервативный `NO_FILL` максимум на пять минут; перерасход или превышение cap невозможны.
Если Redis недоступен для measurement anti-fraud policy, measurement закрывается с `AD_POLICY_UNAVAILABLE`; основной
контент и direct decision продолжают работать через PostgreSQL.

## Модерация и внешний fallback

Campaign/creative/target snapshots append-only. Новая revision снимает active approval. `APPROVE` разрешён только
другому `ADS_MANAGER`; migration допускает у revision единственное изменение `reviewedBy + approvedAt`, не меняя
snapshot. Pause немедленно исключает кампанию из selection, resume сохраняет исходный schedule и остаток бюджета.
Placement, campaign lifecycle, creative destination, provider governance и отчёты пишут минимальный audit.

`DisabledAdvertisingProvider` — единственная зарегистрированная реализация. Placement fallback не вызывает её без
enabled current policy, четырёх approved reviews, неистёкшего срока и отдельного provider consent. Текущий admin API
может append-only зафиксировать только disabled policy; попытка enable возвращает `LEGAL_EVIDENCE_REQUIRED`, так как
wire contract не переносит сами review evidence. Любой provider exception/неподдержанный response становится
`NO_FILL`; основное API не падает.

## Агрегаты и обслуживание

Worker раз в минуту активирует scheduled кампании, завершает истёкшие, отмечает exhausted, освобождает просроченные
нефинализированные reservations и сверяет последние 30 суток `AdReportDaily` с raw delivery events. Затем удаляет
истёкшие raw events, cap counters и encrypted operation receipts. Release имеет отдельный SQL guard: он разрешён
только после token expiry, один раз и только для exact issuance. Report подавляет cohort с `served < 20` и не имеет
raw/user export.

`ADVERTISING_ASSET_BASE_URL` указывает только на first-party gateway статических проверенных assets. HTML, script,
iframe, pixel, autoplay и remote embed не имеют backend-представления.

## Runtime gates

- применить обе advertising migrations к чистому и обновляемому PostgreSQL 16/PostGIS;
- выполнить integration suite с реальными PostgreSQL и Redis, включая concurrent hard-budget race и rolling cap;
- проверить clock boundaries, scheduler recovery, backup-cycle deletion и наблюдаемость provider/anti-fraud отказов;
- до production закрыть legal/residency/маркировку/ОРД/ЕРИР и только затем создать реальные placement/campaign;
- внешний adapter остаётся disabled до отдельного versioned implementation и evidence по актуальным условиям.
