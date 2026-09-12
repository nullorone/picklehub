# Контракты PickleHub

[`rest/main.tsp`](rest/main.tsp) и импортируемые им feature-файлы — редактируемый источник REST-контракта, из
которого генерируется корневой
[`openapi.yaml`](../openapi.yaml). [`asyncapi.yaml`](../asyncapi.yaml) остаётся источником истины для WebSocket и
событий. Product endpoints и business events добавляются только prompt’ом owning feature.

## Команды

```bash
npm run contracts:lint
npm run contracts:compile
npm run contracts:breaking
npm run contracts:generate
npm run contracts:generated:check
npm run contracts:typecheck
npm run contracts:mock:check
npm run contracts:check
```

- `contracts:compile` генерирует только `openapi.yaml` из TypeSpec; `contracts:generate` также обновляет TypeScript.
- `contracts:lint` проверяет TypeSpec без записи artifacts, валидирует OpenAPI и AsyncAPI официальными
  parser/linter и применяет PickleHub policy: `/v1`, разрешённые owning-feature paths, уникальные
  operation/message IDs, версионированные envelopes, UTC timestamps, `no-store`, browser CSRF/cookie и безопасный
  payload внутренних identity/venue/match/communication/profile/club/tournament/gamification events, admin capability registry и
  notification jobs.
  Статические data-policy тесты
  дополнительно удерживают
  обязательные migration constraints, GiST-стратегию, provenance, постоянные merge aliases, вместимость/FIFO и
  единственный эффективный результат; они не заменяют применение SQL к PostgreSQL и конкурентные integration tests.
- `contracts:breaking` сравнивает working tree с `CONTRACT_BASE_REF` либо `HEAD`. При первом добавлении контрактов
  baseline отсутствует и проверяется встроенный compatibility self-test. В pull request CI передаёт merge-base
  целевой ветки через `CONTRACT_BASE_REF`.
- `contracts:generate` детерминированно пересоздаёт `openapi.yaml` и TypeScript в `contracts/generated/`.
  Generated files хранятся в Git и вручную не редактируются.
- `contracts:generated:check` компилирует TypeSpec и генерирует типы во временный каталог, затем сравнивает bytes с
  committed output.
- `contracts:typecheck` проверяет сгенерированные TypeScript-типы в strict mode.
- `contracts:mock` запускает локальный Prism на `127.0.0.1:4010`; он предназначен только для разработки и не
  является backend или production fallback.
- `contracts:mock:check` запускает mock на свободном localhost port, запрашивает representative endpoints health,
  identity, venues, matches, communications, profiles, trust/safety, administration, clubs, tournaments и
  gamification,
  проверяет status,
  JSON shape и
  `no-store`, включая private progress геймификации.
  AsyncAPI examples проверяются
  parser/linter в `contracts:lint`.

Prism сопоставляет OpenAPI Path Item без относительного `servers.url`, поэтому локальные mock URL —
`/health/live`, `/auth/context`, `/venues` и другие paths без `/v1`. Реальные API URL включают версию `/v1`; клиенты получают
её из server/base URL configuration. Mock harness не переписывает source contract ради ограничения Prism.

AsyncAPI generator передаёт Modelina каждую message payload schema отдельно и помещает вспомогательные типы в
namespace сообщения: так одинаковые внутренние имена разных envelopes не сталкиваются. Prism transitive packages
закреплены через root `overrides` на последних проверенных версиях с поддержкой Node.js 22; снятие overrides требует
проверки `engines` всего Prism tree.

## Правила изменения

1. Сначала обновить requirement/ADR, затем TypeSpec/AsyncAPI source contract, generated output и только потом
   реализацию.
2. Запустить lint, compatibility check, code generation drift check и mock smoke test.
3. Для намеренно несовместимого изменения выпустить новую major URL/message schema version и сохранить старую до
   объявленного срока миграции; отключать checker или обновлять baseline ради зелёного CI нельзя.
4. Не редактировать `contracts/generated/` и не копировать transport DTO вручную. Prisma schema и database column
   names не экспортируются через контракт.
5. Examples используют только вымышленные UUID, время и тексты без реальных персональных данных или credentials.

## Макеты

Prism отвечает строго по OpenAPI examples/schemas. Mock не подтверждает бизнес-правило, авторизацию, сохранение,
идемпотентность или доступность провайдера. TMA/web development явно показывают mock mode; production build не
имеет mock URL или silent fallback. Внутренние identity, venue, match и communication events проверяются по
AsyncAPI schema и не
выставляются как WebSocket subscription; contract mock не имитирует их фактическую доставку через outbox.

## Доверие и безопасность

[`rest/trust-safety.tsp`](rest/trust-safety.tsp) описывает private review revisions, no-show и другие safety reports,
caller-only receipt/status, response/appeal, собственный список блокировок и пороговый публичный review aggregate.
Все мутации требуют bearer, browser CSRF и UUIDv4 `Idempotency-Key`; read models имеют `no-store`. Чужая квитанция
неотличима от отсутствующей, а case, reporter/subject, source, evidence другой стороны, assignee и sanction detail
никогда не входят в receipt DTO. Собственный detail может вернуть только собственный ещё хранимый текст.

Миграция разделяет `Review`, immutable signal, case, append-only response/decision, appeal и idempotent reversible
effect. Business uniqueness дополняет encrypted 24-hour replay; один no-show effect защищён partial unique index.
Restricted text хранится отдельно как authenticated ciphertext с key/AAD version, а review aggregate перестраивается
из текущих eligible contributions и публикуется только после пяти независимых источников. Retention, account
deletion, cryptoshredding и адресный legal hold описаны в
[`trust-safety-data-policy.md`](../llm/_docs/trust-safety-data-policy.md).

`trust-safety.events.v1` несёт ровно один opaque aggregate ID и broad category. Reporter, subject, source/revision,
reason, state, rating, text, evidence, attachment, block direction, outcome и decision detail запрещены; consumer
перечитывает минимальные данные через авторизованный port и дедуплицирует message ID.

## Клубы

[`rest/clubs.tsp`](rest/clubs.tsp) описывает публичный поиск/карточку, scoped membership governance, адресные
приглашения, необязательные venue links, клубные матчи и bounded recurring rules. Hard delete клуба отсутствует;
мутации idempotent и optimistic-versioned. Migration защищает ровно одного active owner deferred constraint,
terminal intents, hashed invite capability и уникальную календарную позицию серии.

Правило повторения хранит local wall time, IANA timezone, tzdata version и явные DST gap/overlap policy. Occurrence
фиксирует выбранный UTC instant либо skip marker, а reciprocal source связывает её ровно с одним самостоятельным
match. `club.events.v1` всегда несёт `clubId`, но не identity участника, token, клубный текст, координаты, roster,
reason или точное расписание. Полные решения — в
[`clubs-data-policy.md`](../llm/_docs/clubs-data-policy.md).

## Турниры

[`rest/tournaments.tsp`](rest/tournaments.tsp) задаёт единые DTO и операции поиска, lifecycle, registration,
check-in, seeding, раундов, результата/correction, standings и cancel для всех восьми встроенных форматов.
`CUSTOM_DSL` зарезервирован, но не активируется. Versioned JSON Schema preset находится в
[`schemas/tournament-presets.v1.schema.json`](schemas/tournament-presets.v1.schema.json), а contract-level golden
примеры нечётного round robin, elimination byes и разрешённой lot ничьей — в
[`fixtures/tournament-strategy-examples.v1.json`](fixtures/tournament-strategy-examples.v1.json).

Миграция хранит общий aggregate graph, version/checksum, уникальные FIFO/seed/lot/source slots, append-only result
revisions/audit и единственный completion marker. `tournament.events.v1` переносит только opaque references,
версии и закрытые outcomes, без roster, оплаты, счёта, winner, seed/rating, расписания или причин. Полное решение —
в [`tournaments-data-policy.md`](../llm/_docs/tournaments-data-policy.md).

## Геймификация

[`rest/gamification.tsp`](rest/gamification.tsp) разделяет собственный global progress, progress каждого клуба,
достижения, сезонный leaderboard с отдельным opt-in и allowlisted configuration views платформы/клуба. Мутации
consent и club configuration требуют bearer, browser integrity и idempotency; все ответы private/no-store.

Миграция хранит immutable rule/level/season snapshots, append-only XP compensation chains, отдельные scope
balances, achievement awards, consent revisions, consent-gated leaderboard rows и processed-event receipts.
Partial/exclusion indexes и triggers защищают source replay, UTC caps, компенсацию, непересекающиеся сезоны,
current opt-in и competition rank. `gamification.events.v1` передаёт только opaque projection references без
identity, source activity, XP/rank или anti-fraud detail. Полное решение — в
[`gamification-data-policy.md`](../llm/_docs/gamification-data-policy.md).

## Административная панель

[`rest/administration.tsp`](rest/administration.tsp) публикует отдельную `/v1/admin`-поверхность для fixed role
grants, exact user lookup, routing/decision safety cases, user restrictions, venue moderation, audit search и
exact-case break-glass. Каждая операция имеет машинно-проверяемые `x-admin-capability` и `x-admin-roles`; их
соответствие deny-by-default registry проверяет `administration-policy.mjs`. Restricted resource использует единый
404, а безопасно раскрываемое отсутствие capability/assignment/conflict/break-glass — явный 403.

Cursor-списки имеют default 25/maximum 100 и actor/capability/purpose/filter/snapshot binding; audit search ограничен
31 UTC сутками. Lookup принимает exact key только в POST body. CSV/JSON export, bulk/print, download и signed URL
routes отсутствуют и запрещены policy-test. Миграция добавляет fixed grants, отдельные hashed admin sessions,
зашифрованный 30-минутный break-glass, versioned restrictions и encrypted 24-hour operation receipts. Существующий
`audit_entries` только дополняется operation/policy полями и остаётся append-only. Полные storage/retention правила —
в [`admin-backoffice-data-policy.md`](../llm/_docs/admin-backoffice-data-policy.md).

## Профиль и статистика

[`rest/profiles.tsp`](rest/profiles.tsp) разделяет self-only `PlayerProfile`, минимальный
`PublicPlayerProfile` и перестраиваемые `PlayerStatistics`. Владелец читает и optimistic-versioned изменяет профиль
и `PUBLIC`/`PRIVATE`, листает историю opaque cursor и получает подробные integer totals. Публичные endpoints
принимают анонимный запрос или bearer: для вошедшего viewer отсутствующий, закрытый, удаляемый и двусторонне
заблокированный профиль всегда даёт один `PROFILE_NOT_AVAILABLE`. Публичные DTO не содержат timezone, версии,
consent, block/report данных; attendance/reliability до пяти окончательных commitments не раскрывают даже размер
выборки.

DUPR PUT выполняет только локальную проверку HTTPS и утверждённой host/path policy, хранит ссылку зашифрованной и
никогда не делает fetch/scraping, проверку владения или импорт рейтинга. Avatar upload — пятиминутный подписанный
PUT ровно в `profiles/{userId}/avatars/{assetId}/original`, связанный с media type, длиной до 5 MiB и SHA-256.
Object key генерирует сервер; объект остаётся закрытым до decode/re-encode, проверки и активации.

Миграция хранит один ревизуемый contribution на `(generation, match, player)`, три integer aggregate slice и
отдельные reliability contributions. Receipt плюс монотонная eligibility revision защищают replay и изменение
порядка. Rebuild строит shadow generation, проверяет count/SHA-256 и только затем атомарно делает его единственным
`ACTIVE`; `ALL` deferred constraint равен сумме `SINGLES` и `DOUBLES`. `profile.events.v1` переносит только opaque
source/generation references и закрытые состояния, без имени, уровня, DUPR, аватара, счёта, totals и evidence.

## Площадки

[`rest/venues.tsp`](rest/venues.tsp) разделяет публичные запросы карты, радиуса и текста. Radius ограничен 50 км,
bbox — 100×100 км, координаты принимаются как WGS84 longitude/latitude с точностью не более шести десятичных
знаков. Курсоры живут 15 минут и связаны с режимом, фильтрами и снимком каталога. Геокодерные подсказки transient;
его стабильная ошибка — `GEOCODER_TEMPORARILY_UNAVAILABLE` с `Retry-After`.

Создание match-only кандидата, исправления и структурированной жалобы требует bearer, browser CSRF и UUIDv4
`Idempotency-Key`; закрытый safe-response шифруется в БД на 24 часа. Административных маршрутов здесь нет — они
принадлежат функции `08`. Внутренние события публикуются как совместимые с общей версионностью
`venue.candidate.created.v1`, `venue.verified.v1` и `venue.merged.v1`; адреса, координаты и личности авторов в них
не входят.

## Матчи

[`rest/matches.tsp`](rest/matches.tsp) владеет публичным поиском, аутентифицированными рекомендациями, черновиком,
публикацией, capability read, составом/заявками/FIFO-очередью и предложением/подтверждением/спором результата. Все
мутации требуют bearer, browser CSRF, UUIDv4 `Idempotency-Key`; существующий агрегат также проверяет
`expectedVersion`. Capability `UNLISTED` не участвует в `/matches` и `/matches/recommendations`, выдаётся raw только
организатору, а хранится как keyed hash.

Миграция сериализует меняющие состав операции блокировкой корня `matches`, а constraint triggers независимо от
application precheck защищают вместимость команды, одно активное участие/заявку/очередь, FIFO offer и согласованную
пару match/result. `game_scores` принимает завершённые партии от 11 очков с разницей минимум два, поэтому корректны
игры до 11, 15, 21 и deuce; deferred series guard проверяет `BEST_OF_1/3/5`. Уникальный immutable marker
`CONFIRMED_MATCH` — единственный storage-факт основной метрики. События `match.*.v1` не содержат token, состава,
счёта, текста, уровня или географии.

## Чат и уведомления

[`rest/communications.tsp`](rest/communications.tsp) описывает авторизованный снимок чата, backward history и
forward catch-up через opaque cursor, REST fallback для отправки, edit/delete/tombstone, foreground read marker,
структурированную жалобу, блокировку, in-app inbox, настройки и привязку opaque web/TMA installation. Все маршруты
требуют bearer; мутации дополнительно требуют browser CSRF и UUIDv4 `Idempotency-Key`. Ответы всегда `no-store`.
Invitation capability, pending request, waitlist и guest не дают доступа к чату.

AsyncAPI разделяет client streams `/v1/ws`, внутренний transactional outbox `communication.events.v1` и BullMQ
queue `notification-delivery-v1`. Client stream доставляется at least once и упорядочен PostgreSQL `sequence`;
разрыв не продвигает cursor и требует REST catch-up либо `RESYNC_REQUIRED`. Outbox содержит только opaque message/
conversation/source references, а delivery job — только `deliveryId`: текст, revision/evidence, route, contact,
preview и provider payload загружаются исключительно владельцем данных после повторной авторизации/claim.

Миграция атомарно назначает `(conversation_id, sequence)`, хранит append-only revisions/tombstones и неизменяемую
30-дневную boundary бывшего участника. Уникальности `(recipient_id, source_event_id, type)` и
`(notification_id, channel)` независимо дедуплицируют logical inbox item и channel delivery; retries/failover
сохраняют один delivery/idempotency key. `IN_APP` нельзя отключить, внешние каналы ограничены Telegram/email и не
дают гарантии human read или exactly-once доставки.
