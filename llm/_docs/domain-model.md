# Базовая доменная модель

Исходные агрегаты и вспомогательные записи:

- Идентификация: `User`, `Identity`, `Session`, `MagicLink`, `Consent`.
- Профиль: `PlayerProfile`, `SkillSelfAssessment`, `ExternalProfileLink`, `PlayerPreference`.
- Площадка: `Venue`, `VenueSource`, `VenueCandidate`, `VenueRevision`, `VenueModerationDecision`.
- Матч: `Match`, `MatchTeam`, `MatchParticipant`, `JoinRequest`, `WaitlistEntry`, `MatchResult`, `GameScore`,
  `ResultConfirmation`.
- Коммуникация: `Conversation`, `Message`, `Notification`, `NotificationPreference`, `OutboxEvent`.
- Безопасность: `Review`, `NoShowReport`, `Report`, `Block`, `ModerationCase`, `AuditEntry`.
- Клуб: `Club`, `ClubMembership`, `ClubVenue`, `RecurringMatchRule`.
- Турнир: `Tournament`, `Entrant`, `Stage`, `Round`, `TournamentMatch`, `Standing`, `FormatDefinition`.
- Прогресс: `XpLedgerEntry`, `LevelDefinition`, `Achievement`, `LeaderboardSeason`.
- Контент и реклама: `Article`, `ContentSource`, `Bookmark`, `Campaign`, `Creative`, `Placement`, `AdDeliveryEvent`.

Точные поля, перечисления, индексы, сроки хранения и владение определяются соответствующим промптом
`02-contract-data.md`. Запись в несколько агрегатов требует явной границы прикладной транзакции и события outbox.
Общие правила UUID, времени, мягкого удаления, аудита и владения хранилищами заданы в
[`data-conventions.md`](data-conventions.md).

## Identity и первичная настройка

Граница `identity` владеет следующими данными:

- `identity_users` — корень пользователя, статус `ACTIVE` / `DELETION_PENDING` / `DELETED`, `auth_epoch` для
  массового отзыва и серверные отметки времени;
- `identities` — не более одного способа каждого provider на пользователя и глобально уникальная пара provider +
  HMAC subject key; восстановимый Telegram subject или нормализованный email хранится только как ciphertext с
  версией ключа;
- `identity_sessions`, `refresh_credentials`, `access_credentials` — серверное семейство сессии, история
  ротированных refresh hashes и короткоживущие access hashes; raw credentials не сохраняются;
- `magic_links`, `telegram_proof_replays`, `identity_attempts` — одноразовые login/proof записи и операция,
  привязанная к пользователю и исходной сессии. Magic token хранится только как hash, Telegram init data не
  хранится, LINK требует независимые `CURRENT` и `TARGET` proofs;
- `consent_documents`, `consents` — неизменяемые версии документов и append-only история явных действий;
- `player_profile_drafts`, `onboarding_localities` — один версионируемый черновик на пользователя и локальный
  справочник предпочтительной географии без координат;
- `identity_idempotency_records` — fingerprint и зашифрованный safe response повторяемой неcredential-мутации на
  24 часа; unique scope включает пользователя, метод, canonical path и UUIDv4 key.

Уникальные индексы запрещают дубли provider subject, второго provider одного типа у пользователя, два текущих
refresh и две pending magic-ссылки одной области. Deferred constraint triggers сериализуются блокировкой
`identity_users` и не позволяют активному пользователю остаться без identity. CHECK constraints ограничивают
сроки credentials/proofs, допустимые переходы, обязательные поля завершённого черновика и отсутствие raw token в
модели. Дополнительные partial indexes, CHECK и triggers принадлежат SQL migration, даже если Prisma не умеет
выразить их полностью.

Смена identity, завершение онбординга, изменение согласия, отзыв сессий и запрос удаления атомарно создают
минимальное событие `identity.*.v1` в platform outbox. В payload разрешены только opaque UUID и ограниченные enum;
email, provider subject, init data, magic URL и credentials запрещены. Канал `identity.events.v1` внутренний и не
является WebSocket subscription API.

## Площадки

Граница `venues` владеет canonical каталогом независимо от `clubs` и `matches`:

- `venues` — опубликованный спортивный объект с публичным адресом, PostGIS-точкой, рабочим/verification статусом,
  версией и отметкой последней проверки; nullable `club_id` не является частью агрегата;
- `venue_sources` — append-only происхождение поля или версии: внешний provider/source ID и версия, import batch,
  наблюдение, лицензия/policy, разрешение хранения и атрибуция либо opaque автор пользовательского вклада;
- `venue_candidates` — непубличная точка, связанная с исходным матчем, и переход от match-only использования к
  очереди review только после подтверждённо состоявшегося матча;
- `venue_revisions` — предложенный snapshot изменений с base version и собственным происхождением, который не
  перезаписывает опубликованную версию до модерации;
- `venue_moderation_decisions`, `venue_reports` — append-only решения/reason codes и структурированные жалобы;
- `venue_merges` — неизменяемая цепочка previous ID → canonical ID. Слитый ID не переиспользуется и разрешается в
  survivor, а исправление создаёт новое решение вместо удаления истории.

Точный адрес и точка кандидата restricted до одобрения; у опубликованной разрешённой спортивной площадки они
public. Геокодерная подсказка не является доменным объектом. Она может стать source snapshot только после явного
выбора и при capability адаптера, разрешающей хранение конкретных полей. Удаление upstream source не удаляет
canonical venue автоматически: доступность оставшихся источников, право хранения и состояние review решаются
раздельно.

Кандидат квалифицируется событием подтверждённого матча идемпотентно. Одобрение, отклонение и слияние
сериализуются на кандидате; публикация/merge, audit и outbox входят в одну транзакцию. Proximity формирует набор
для review, но не является достаточным доказательством дубля. `matches` хранит `venue_id` либо ограниченную ссылку
на match-only candidate, а после merge разрешает alias; он не копирует координаты. Будущая `club_venues` является
необязательной связью many-to-many и не определяет существование ни клуба, ни площадки.

Создание кандидата, изменение verification state и слияние атомарно пишут версионированные события
`venue.candidate.created.v1`, `venue.verified.v1` и `venue.merged.v1` в отдельный внутренний канал
`venue.events.v1`. Payload содержит только opaque IDs и ограниченный verification enum; координаты, адреса,
источник, search origin и contributor/moderator ID запрещены.

## Матчи

Граница `matches` владеет разовым агрегатом и не владеет каталогом площадок, профилем или trust/safety:

- `matches` — корень с организатором, версией, policy version, форматом, видимостью, режимом вступления, временем,
  диапазоном уровня и ссылкой на venue/candidate; жизненный цикл включает `DRAFT`, `PUBLISHED`, `IN_PROGRESS`,
  `AWAITING_CONFIRMATION`, `DISPUTED` и терминальные `CANCELLED`, `COMPLETED`, `VOIDED`;
- `match_teams` — ровно `TEAM_A` и `TEAM_B` с ёмкостью из формата; заполненность вычисляется, а не хранится;
- `match_participants`, `match_guest_slots` — зарегистрированные и гостевые места конкретной команды; только
  участник имеет user ID, право подтверждения и будущую статистику;
- `join_requests` — одно активное намерение `APPROVAL` и неизменяемый терминальный исход;
- `waitlist_entries`, `waitlist_offers` — монотонная FIFO-позиция, выбор команды и ограниченный offer;
- `match_invites` — версия capability с keyed hash непредсказуемого token; raw token не сохраняется;
- `match_results`, `game_scores`, `result_confirmations`, `match_metric_markers` — версии предложения, партии,
  решение соперника и уникальный подтверждённый outcome/вклад в метрику.

Организатор — первый участник `TEAM_A`. Уникальность match + user среди активной заявки, очереди и участия и
граница мест команды защищаются SQL constraints/triggers и транзакцией. Освобождение места и promotion, решение
заявки, guest slot и join сериализуются по версии агрегата. FIFO sequence неизменяема; неподходящий кандидат
получает terminal skip до следующего. `AUTO` создаёт участие/очередь, `APPROVAL` — заявку, затем участие/очередь и
offer при вакансии.

Матч и результат меняются согласованной парой: `AWAITING_CONFIRMATION` соответствует `PROPOSED`, `COMPLETED` —
immutable `CONFIRMED`, `DISPUTED` — спору, `VOIDED` — отсутствию подтверждённой игры. Подтвердить может активный
зарегистрированный соперник организатора. Транзакция подтверждения записывает outcome, `PLAYED` участия,
уникальный metric marker, audit и outbox. Уникальность marker по match + metric type защищает HTTP/outbox/moderation
replay. Спор не создаёт marker и не передаётся статистике до решения moderator.

`matches` читает уровень через application port profiles и разрешает venue alias через port `venues`, не копируя
координаты. После подтверждения публикуется минимальное событие для идемпотентной qualification venue candidate.
Будущие communications/statistics/trust-safety реагируют на события, но не меняют таблицы matches. Payload содержит
opaque match ID, версию и закрытые enum/buckets; raw invite token, booking note, адрес/координаты, имена, уровень и
состав запрещены.

## Чат и уведомления

Граница `communications` владеет проекцией доступа к коммуникации, но не составом или lifecycle матча:

- `conversations` — один чат опубликованного матча, версия и последняя монотонная sequence;
- `conversation_memberships` — интервалы доступа зарегистрированного участника, `accessRevokedAt`, граница доступной
  sequence и монотонная `lastReadSequence`; pending/очередь/гость не являются членством;
- `chat_messages` — авторский plain text либо закрытый тип системной записи, серверное время и уникальная
  `(chatId, sequence)`; системный source event уникален;
- `chat_message_revisions` — append-only версии редактирования и tombstone; текущая проекция не уничтожает
  снимок версии, приложенный к жалобе;
- `communication_blocks` — направленное правило скрытия автора для пользователя без изменения match membership;
- `chat_message_reports` — opaque reporter/subject, reason enum и зашифрованный immutable evidence snapshot для
  будущей границы trust/safety;
- `notification_preferences` — категории/каналы, BCP 47 locale, IANA timezone, локальные quiet-hour boundaries и
  версия настроек;
- `notification_preference_channels` — закрытая матрица category/channel; `IN_APP` всегда включён, а внешние
  Telegram/email значения изначально выключены;
- `notifications` — один in-app item на recipient + source event + type, read state, route и grouping metadata;
- `notification_deliveries` — канал, idempotency key, schedule/attempts и transport outcome без утверждения о
  прочтении пользователем.
- `notification_devices` — opaque UUIDv4 установки web/TMA для синхронизации inbox; push token/channel в MVP нет.

Communications получает committed match events и идемпотентно обновляет access projection, создаёт системную
запись и fan-out. Проверка доступа перед каждым чтением/записью сверяет проекцию с authoritative application port
matches либо свежей версией события; revoke закрывает stream grant. Сбой consumer не меняет match, а reconciliation
устраняет lag. Сообщение и назначенная sequence создаются одной транзакцией; Redis/WebSocket не назначают порядок.

WebSocket event — производная от сохранённой записи. REST snapshot/catch-up остаётся источником истины; cursor
привязан к membership/access boundary. Read position меняется через `max`, поэтому повторы и конкурирующие вкладки
не уменьшают её. Provider attempt не меняет read position. Блокировка применяется в персональной read projection,
а не переписывает общий поток.

Доменный outbox матча и notification fan-out содержат только opaque source/match references и закрытые типы.
Безопасный route хранится в owning notification row, но не копируется в generic outbox или job. Текст сообщения,
revision/evidence, email, Telegram subject,
пригласительная ссылка, имена и причина жалобы запрещены. Для realtime текста используется авторизованная запись
communications и bounded fan-out, а не широковещательный доменный outbox. Конкретные provider credentials и
recipient address разрешаются identity port только внутри минимальной границы адаптера отправки.

## Профиль и статистика игрока

Граница `profiles` владеет завершённым представлением игрока и производными статистическими проекциями, но не
меняет authoritative матчи, moderation outcomes или identity credentials:

- `player_profiles` — один версионируемый профиль активного пользователя: отображаемое имя, locality reference,
  набор форматов, текущая самооценка и `PUBLIC` / `PRIVATE`; timezone остаётся закрытой настройкой;
- `external_profile_links` — нормализованная HTTPS-ссылка типа `DUPR`, состояние разрешения показа и версия
  provider policy; это не verified identity и не источник числового рейтинга;
- `player_statistic_contributions` — один текущий ревизуемый вклад на match + registered player с format,
  confirmedAt, outcome и командными game/point totals либо tombstone исключения;
- `player_statistic_aggregates` — rebuildable lifetime projection по player + `ALL` / `SINGLES` / `DOUBLES` с
  целыми numerators: played, wins, losses, games и points for/against; процент не является источником истины;
- `player_reliability_contributions` и aggregates — только подтверждённые организованные outcomes и окончательные
  trust/safety no-show decisions, по одному виду ответственности на match + player;
- `profile_projection_generations` и consumer receipts — generation/cutoff/checksum, состояние rebuild и
  идемпотентная обработка eligibility revisions без хранения пользовательских полей в очереди.

Онбординг атомарно создаёт исходный профиль из завершённого draft; после этого profiles становится владельцем
изменений отображаемых полей, а identity хранит только необходимую ссылку/проекцию для auth gate. Версия профиля
защищает конкурентное сохранение. Закрытие и удаление немедленно инвалидируют публичный cache; обязательная
минимальная проекция участника матча получается через авторизованный port и не превращается в копию всего профиля.
Будущие clubs/achievements подключаются отдельными проекциями после owning feature, а не nullable-заглушками.

Statistics принимает только монотонную eligibility revision authoritative источника. Допустимый вклад требует
`PLAYED`, согласованных `COMPLETED` / `CONFIRMED` и уникального marker; гость, proposal, superseded, disputed,
voided и cancelled outcome дают отсутствие/tombstone. Подтверждение только факта увеличивает played, но не
wins/losses/points. Scored doubles сохраняет командные очки каждому зарегистрированному участнику и явно не
моделирует их как личный вклад.

Применение выполняется как idempotent upsert/retract вклада и пересчёт затронутого агрегата в одной транзакции;
receipt одного event ID недостаточен для коррекции старого результата. Полное перестроение создаёт shadow
generation на snapshot cutoff, сверяет count/checksum, доигрывает более новые revisions и только затем атомарно
переключает активное поколение. Failure оставляет прежнее согласованное поколение. Reconciliation сравнивает
authoritative markers/revisions и contributions и не редактирует source aggregate.

Физический контракт хранит профиль отдельно от `player_profile_drafts`: завершённые drafts backfill-ятся в
`player_profiles`, а дальнейшие optimistic updates увеличивают `version` ровно на один. DUPR хранится в
`external_profile_links` как HMAC `url_key` и authenticated ciphertext с policy version; числового рейтинга и
verified-флага нет. Avatar object key имеет единственную форму
`profiles/{userId}/avatars/{assetId}/original`, связан с владельцем trigger-ом, а активным может стать только его
прошедший проверку asset. Подписанный URL не хранится.

`profile_projection_generations` имеет единственный partial-unique `ACTIVE`; переход `BUILDING → READY → ACTIVE`
проверяет число и SHA-256 канонически упорядоченных contributions. Предыдущее поколение становится
`SUPERSEDED`, failed/неполное остаётся недоступным. На generation + match + player хранится ровно одна
eligibility revision, а одинаковая revision не может изменить payload. Deferred constraint требует три строки
aggregate и равенство `ALL = SINGLES + DOUBLES`; `wins + losses <= played`. Organizer success/failure взаимно
исключаются на match, а `CONFIRMED_NO_SHOW` дедуплицируется отдельно. Event receipt не заменяет проверку source
revision.

Публичная проекция применяет profile visibility и двусторонний direct-access deny при блокировке. Она не содержит
email, Telegram subject, timezone, consent, точную географию, invite token, dispute/no-show evidence или reporter.
Raw DUPR URL, имя, точный счёт и пользовательские показатели запрещены в generic outbox, job, logs и analytics;
consumer получает opaque match/result/revision ID и дочитывает источник через внутренний авторизованный port.
REST-контракт использует snapshot-bound opaque cursor для истории. События `profile.changed.v1`,
`profile.statistics.source.changed.v1` и lifecycle rebuild несут только opaque source/profile/generation ID,
revision и закрытое состояние: consumer дочитывает authoritative данные после авторизации.

## Доверие и безопасность

Граница `trust-safety` владеет пользовательскими отзывами, сигналами, объединёнными moderation cases,
append-only ответами и апелляциями, решениями/эффектами и публичной агрегированной репутацией. Блокировки уже
физически принадлежат `communications`, но `trust-safety` определяет общую direct-interaction policy через
авторизованный port; перенос таблицы или дублирующая копия графа блокировок не требуются. Venue reports и match
result disputes остаются authoritative в своих границах, а единая trust/safety квитанция маршрутизирует их и
хранит только ссылку на source revision. Модуль не редактирует таблицы matches, venues, profiles или communications.

Концептуальные сущности следующего контрактного этапа:

- `Review` — одна эффективная author + subject + match запись с append-only revisions, eligibility policy version
  и закрытым текстом; публичная проекция содержит только reversible aggregate после порога;
- `SafetySignal` — immutable receipt конкретного reporter, category, subject/source reference и encrypted evidence;
  withdrawal является новым намерением, а не удалением истории;
- `ModerationCase` — закрытый контейнер одного или нескольких сигналов со state, priority, assignment и conflict
  marker; объединение не меняет уникальность исходных сигналов и не видно игроку;
- `CaseResponse` и `Appeal` — append-only позиции сторон; одна апелляция на decision назначается reviewer, отличному
  от автора решения;
- `ModerationDecision` — immutable revision с policy version, outcome, scope, expiry/review deadline и reviewer;
  reversal создаёт новую revision и компенсирующий effect;
- `ModerationEffect` — идемпотентный обратимый effect конкретного типа; для no-show уникален по match + subject,
  для result correction ссылается на новую authoritative result revision;
- `AuditEntry` — отдельный минимальный append-only security record без текста, evidence, rating и before/after.

Сигнал не равен case, case не равен решению, решение не равно применённому effect. Уникальность reporter signal
подавляет retry, но сигналы разных reporters не схлопываются; один effect не умножается числом сигналов.
`RECEIVED → LINKED/UNDER_REVIEW → RESOLVED` является пользовательским автоматом сигнала, а закрытый case проходит
`OPEN → TRIAGED → ASSIGNED → INVESTIGATING → DECIDED → CLOSED` и может стать `REOPENED` только из-за апелляции или
существенных новых данных. Все переходы используют ожидаемую revision, ограничения БД и один transaction outbox.

Evidence хранится отдельно от searchable metadata как authenticated ciphertext с key version. Immutable snapshot
существующего контента создаёт владеющий модуль и отдаёт trust/safety только через least-privilege read port;
generic event содержит opaque source/signal/case ID и закрытую категорию, но не текст, score, coordinates,
reporter/subject pair или вложение. Public reputation projection читает только текущие eligible review revisions и
final authoritative effects, поддерживает retract/rebuild и не использует pending reports, blocks или sanctions.

## Административная панель

Граница `administration` владеет доступом сотрудников и координирует use cases, но не копирует и не редактирует
authoritative таблицы `identity`, `trust-safety`, `venues`, `matches`, `content-news` или `advertising` напрямую:

- `platform_role_grants` — versioned grant одной из четырёх code-defined ролей с actor/subject, reason code,
  approval reference, validity/review timestamps и revoke revision; wildcard/custom permission отсутствует;
- `admin_sessions` — отдельная audience, MFA/re-auth timestamps, idle/absolute expiry и security epoch без raw
  credential;
- `break_glass_grants` — один actor + case + incident, bounded justification, expiry ≤ 30 минут и revoke state;
- `admin_operation_receipts` — idempotency fingerprint, target/version, safe outcome и связь с audit без domain
  narrative;
- `AuditEntry` остаётся общей append-only security capability с owning partition/port; administration предоставляет
  allowlisted search, но не становится владельцем evidence или произвольных before/after snapshots.

Use case сначала проверяет server-owned role/capability, purpose, свежую re-auth, assignment, conflict и expected
target revision, затем вызывает application-port owning module. Доменная мутация, effect/outbox и audit коммитятся
владельцем атомарно; administration не координирует распределённую транзакцию и не пишет чужую таблицу. Изменения
role/grant/session принадлежат administration и содержат audit в собственной транзакции. Повтор idempotency
fingerprint возвращает тот же safe receipt.

Queue — авторизованная read model из безопасных metadata. Narrative/evidence разрешает owning `trust-safety`
repository только assignee без conflict либо exact-case break-glass; `SUPERADMIN` сам по себе не проходит port.
Venue approve/reject/merge вызывает `venues` port, где candidate lock, expected revision, canonical survivor,
provenance, decision, outbox и audit защищаются одной транзакцией. User lookup использует `identity` port и exact
keyed lookup, а не копию email/Telegram subject.

Cursor списка opaque, подписан и связан с actor, capability, purpose, filters и snapshot boundary; порядок
завершается opaque ID. Записи administration и audit подчиняются retention/legal hold, но hard delete и перезапись
истории через UI отсутствуют. CMS и advertising позже добавят свои агрегаты/capabilities; резервирование ролей не
создаёт преждевременных admin-таблиц или зависимостей от этих модулей.

Точные поля, SQL CHECK/partial uniqueness/transition guards, сроки admin session и break-glass, encrypted operation
receipt и совместимое расширение `AuditEntry` зафиксированы в
[`admin-backoffice-data-policy.md`](admin-backoffice-data-policy.md). Эффективное ограничение пользователя хранится
как versioned `user_restrictions`: один active scope на пользователя, исходное moderation decision неизменно,
отзыв/истечение являются переходом revision, а не удалением строки.

## Клубы

Граница `clubs` владеет сообществом и scoped governance, но не профилями, площадками, матчевым составом или
турнирной сеткой:

- `clubs` — корень `ACTIVE` / `ARCHIVED`, version, публичная карточка и `OPEN` / `APPROVAL` / `INVITE_ONLY` policy;
- `club_memberships` — интервалы активного членства с `OWNER` / `ADMIN` / `MEMBER`; ровно один активный owner на
  клуб и не более одного активного membership пользователя;
- `club_join_requests` — одна pending заявка пользователя при `APPROVAL` и неизменяемый terminal outcome;
- `club_invitations` — адресное, ограниченное сроком приглашение с hashed capability/token, revoke/accept/decline/
  expiry и без хранения raw token;
- `club_blocks` — scoped запрет повторного membership intent после исключения; снятие создаёт transition и не
  восстанавливает прошлое;
- `club_venues` — необязательная many-to-many связь только с public canonical venue ID;
- `recurring_match_rules` и `recurring_match_occurrences` — timezone-aware шаблон с bounded horizon и уникальной
  календарной позицией, которая материализуется не более чем в один самостоятельный match ID;
- `club_operation_receipts` и минимальные governance audit records — идемпотентный ответ и причины чувствительных
  изменений без публичного текста клуба или персональных данных.

Точные wire-поля, TTL, SQL constraints и политика UTC/DST зафиксированы в
[`clubs-data-policy.md`](clubs-data-policy.md).

Создание клуба фиксирует корень и owner membership одной транзакцией. Deferred constraint/serialization на корне
запрещает commit без ровно одного активного owner; transfer одновременно повышает target и понижает прежнего owner.
Join/approve/invite acceptance создаёт membership один раз и терминализирует конфликтующие intents. Exclusion
завершает membership и intents, а club block дополнительно запрещает новые; история матча, профиля и сообщений не
каскадируется.

Archive сохраняет owner, memberships, venue links и историю, но закрывает новые membership/governance/event
operations и приостанавливает генерацию. Restore не оживляет intents и не создаёт пропущенные occurrences. Удаление
или merge venue изменяет только club link/projection; rule с обязательной недоступной venue paused, готовый match
не переписывается.

Правило серии не владеет участниками или общей вместимостью: каждая occurrence получает собственный агрегат
`matches` и его формат, slots, roster, requests, waitlist, guests, result. Уникальность rule + calendar position и
operation receipt защищает от повторной генерации. Club attribution match неизменяема после публикации и служит
для прав/метрик, но club не становится organizer. События границы содержат только opaque IDs, version, closed
enum/state и occurrence key; name/description, invite token, member graph, venue coordinates, roster и reason text
в outbox запрещены.

## Турнирный агрегат и стратегии

`Tournament` — aggregate root с одним user-organizer, необязательной неизменяемой club attribution, публичной
venue reference, lifecycle/revision и `FormatDefinitionSnapshot`. Модуль владеет `TournamentRole`,
`TournamentEntry`, `PartnerIntent`, `TournamentWaitlistEntry`, `TournamentPaymentStatus`, `TournamentCheckIn`,
`TournamentSeed`, `Stage`, `Round`, `TournamentMatch`, result revisions, `Standing` и completion marker. Ссылки на
`User`, `Club` и `Venue` не передают владение и не копируют профиль, membership, координаты или историю расчётов.

`FormatDefinition` — версионируемый код встроенной стратегии; snapshot — неизменяемая после seeding конфигурация
конкретного турнира. Стратегия получает snapshot, ordered seeds с публичным tie-break lot и terminal result
revisions, а возвращает детерминированный граф stages/rounds/matches и standings. Она не читает текущее время,
Redis, профиль, club role или внешнюю оценку и не исполняет пользовательский код. `TournamentMatch` принадлежит
только турниру: ordinary `Match` не используется как bracket node и не получает tournament queue/guest slot.

Entry — единица сетки: individual player для singles/Americano либо ровно два подтверждённых игрока для fixed-team
doubles. Один user имеет не более одного active entry/intention в турнире. Partner intent до атомарного pairing не
является entry; waitlist сохраняет серверный FIFO sequence. Payment status — ручной информационный факт об
операции вне PickleHub и не содержит provider transaction, реквизитов или денег. Check-in, withdrawal,
replacement и no-show — версионируемые переходы entry history, а не удаление строки.

Граф встречи хранит ссылки на source slots и ровно один terminal outcome: played result, walkover, double walkover
или bye. Unique dependency/slot guards не позволяют entrant оказаться в двух одновременных встречах или двум
победителям занять один downstream slot. Result correction создаёт новую revision; до старта зависимости она
инвалидирует и пересчитывает только не начатый downstream. После старта зависимости winner-changing revision не
становится authoritative: агрегат переходит в pause до `RESULT_STANDS` либо cancel.

Общие standings заканчиваются сохранённым при seeding lot; elimination places используют elimination round,
seed и lot, ladder/court positions уникальны конструктивно. Поэтому ни одна стратегия не оставляет равенство для
ручного скрытого решения. Double elimination использует полную power-of-two сетку и reset final при первом
поражении ранее unbeaten finalist. Pool playoff, Swiss matching, Americano partner rounds и одновременные движения
ladder/King of Court являются выходом точной strategy version и проверяются golden fixtures на контрактном этапе.

Authoritative tournament state, snapshot, audit и outbox коммитятся в PostgreSQL одной транзакцией. Generation
lease или BullMQ job не является источником уникальности. После сбоя projection полностью воспроизводится из
snapshot/seeds/results; checksum mismatch, невозможный граф или unresolved tie закрывает новые старты и переводит
агрегат в operational pause. Completion требует terminal всех обязательных nodes, уникальных мест и ровно одного
marker. Отдельная downstream projection может идемпотентно добавить подтверждённую статистику игрока, но marker
турнира не считается marker обычного матча.

## Геймификация

Граница `gamification` владеет только мотивационной проекцией и не является владельцем матчей, результатов,
отзывов, club membership, профиля, DUPR, спортивной статистики или moderation restriction:

- `XpRuleSet` — versioned глобальный либо club-scoped набор из allowlisted источников, caps и коэффициентов;
- `XpLedgerEntry` — append-only `PENDING` / `POSTED` / `CAPPED` award либо связанная reversal/reinstatement;
- `XpBalance` и `AchievementProgress` — воспроизводимые проекции ledger, но не authoritative факты;
- `GamificationSeason` — непересекающийся UTC-интервал и immutable rule snapshot одного scope;
- `LeaderboardConsent` — отдельный versioned opt-in/opt-out пользователя для конкретного сезона;
- `LeaderboardProjection` — consent/block/restriction-aware read model с общим rank при равном net XP;
- `GamificationReviewCase` — hold, закрытый сигнал, решение и appeal references без копирования текста/географии;
- `GamificationOperationReceipt` — идемпотентный результат command/replay.

Owning-модули публикуют после commit минимальный source fact: opaque source ID/type, user IDs фактических
участников, occurredAt, club attribution и revision/status. Они не принимают XP как команду и не читают его для
результата, DUPR, статистики, посева или authorization. Consumer фиксирует уникальность
scope + user + source + rule version; PostgreSQL constraint и транзакция создают ledger, projection и outbox
согласованно. BullMQ/Redis ускоряет обработку, но не определяет уникальность, cap или баланс.

Reversal и reinstatement — отдельные строки одной цепочки; исходная запись неизменяема, а сумма компенсаций
ограничена исходной наградой. Balance, level, achievement и seasonal projection полностью пересчитываются из
ledger/rule snapshot. Событие сверх cap сохраняет terminal `CAPPED`, поэтому поздний retry не переносит его в
другое окно. Ошибка projection/checksum закрывает публикацию баланса, но не меняет owning domain fact.

Club ledger разделён ключом клуба. Eligibility использует membership interval и immutable club attribution на
occurredAt; выход/архивация закрывает будущие award, не удаляя историю и не создавая backlog при восстановлении.
Season и leaderboard не владеют XP: consent лишь добавляет/убирает read projection. Block меняет viewer projection,
restriction/решение — eligibility публикации, но ни одно из них скрыто не переписывает ledger.

Domain events геймификации содержат только opaque IDs, scope kind, closed source/status/reason enum, rule version,
amount и coarse timestamp. Display name/avatar подтягиваются через profile projection только при действующем
leaderboard consent. Score, outcome/winner, review/chat text, координаты, email/Telegram identity, device/network
signals и пары игроков запрещены в generic outbox/analytics payload.

## Контекст контента и новостей

`content-news` владеет реестром источников, входными кандидатами, статьями и их редакциями, категориями, тегами,
закладками, origin snapshots и решениями publication/takedown. Identity владеет пользователем и staff role grant;
content хранит только opaque actor/reader references. Media ownership остаётся в content только для редакционно
одобренных объектов, а object storage является адаптером, не источником прав.

`ContentSource` — versioned policy aggregate с endpoint, состоянием допуска, разрешёнными use classes, attribution,
review/evidence references и validity interval. `IngestCandidate` — непубличный снимок только разрешённых полей и
полученных revisions. Он может породить editorial draft явным решением, но не является `Article` и не переходит в
публичное состояние. Canonical URL, provider ID и fingerprint дают несколько ключей дедупликации; совпадение
создаёт связь duplicate group, не уничтожая кандидата или origin.

`Article` — стабильная identity и lifecycle pointer. Содержание находится в append-only `ArticleRevision`; отдельно
фиксируются locale, category/tag references, SEO, media и attribution snapshot. `PublicationDecision` связывает
точную revision, checklist/policy versions, actor/reviewer, schedule и outcome. Публична только revision, на которую
указывает действующее committed publication decision. Поздний draft, retry scheduler или изменение upstream не
двигает pointer. `UNPUBLISHED` и takedown закрывают все public projections прежде очистки body.

Производная revision имеет один или несколько неизменяемых `ArticleOrigin`: source policy version, исходные title/
author/publisher/URL/timestamps, transformation kind и rights basis. Original article явно маркируется как original
и хранит редакционное авторство. Source pause/delete, candidate cleanup и смена attribution display name не удаляют
origin опубликованной истории.

`Category` — один управляемый локализуемый классификатор статьи; `Tag` — нормализованный редакционный словарь с
many-to-many связью. Они не являются пользовательским контентом. `Bookmark` принадлежит identity+article,
уникален для пары и не меняет ranking. После takedown read projection закладки содержит только недоступное состояние,
а не сохранённую копию title/body.

Content events несут opaque article/revision/source IDs, lifecycle/outcome enum и version; body, excerpt, title,
slug/source URL, search query, author name, rights evidence и bookmark/user graph в generic outbox отсутствуют.
Analytics получает отдельную минимизированную projection только при consent и не является источником publication,
поиска, закладок или истории редакций.

## Рекламный контекст

`advertising` владеет `Advertiser`, versioned `Campaign`/`CampaignRevision`, `CreativeRevision`, `PlacementPolicy`,
`ProviderPolicy`, `DeliveryDecision`, append-only `DeliveryFact`, `FrequencyCapState`, `BudgetReservation`,
`FraudReview` и `AdvertisingOperationReceipt`. Administration владеет staff identity/capability, identity —
пользователем, venues/content/matches — своим контекстом; advertising получает лишь allowlisted contextual
projection без копирования профиля, истории или координат.

Approved campaign revision неизменяемо связывает advertiser, schedule, budget/rate, targeting allowlist, priority,
frequency, creatives, placements и legal-label snapshot. Изменение создаёт новую revision и снимает approval.
Delivery decision фиксирует выбранные revisions и opaque nonce; viewable impression/click — отдельные
идемпотентные факты. Reservation/finalization/release и жёсткий budget cap защищаются PostgreSQL transaction и
constraints, а Redis может лишь ускорять cap/pacing. Cache miss или сбой Redis применяет conservative cap/no-ad,
но не разрешает перерасход.

Placement policy — code-owned registration поверхности и её critical-state guard. Экран передаёт только placement,
client/locale/form-factor, public object kind/category и coarse locality. Locality вычисляется owning boundary из
выбранного города либо публичной площадки и покидает его только как город/регион; venue ID, координата и search
origin не входят в advertising record/event. Frequency subject — purpose-bound keyed псевдоним либо случайный
first-party session key, не reusable user/device/ad identity.

Provider policy deny-by-default и versioned: адаптер получает минимальный contextual request и возвращает
неисполняемый creative candidate, повторно проверяемый общей политикой. Прямой и внешний inventory используют одно
определение viewability, click, critical state, frequency и label; response не становится trusted HTML/iframe/
script. Нет provider — допустимый terminal no-fill, а не ошибка продуктового use case.

Advertising events содержат opaque campaign/creative/placement revisions, state/outcome enum, coarse time/geo/
count buckets и amount minor units только внутри restricted billing boundary. Generic outbox, logs и analytics не
содержат cap subject, user/session/device/ad ID, IP, координаты, URL/query/object ID, profile/match/content history,
creative body или fraud evidence. Behavioral analytics не является источником delivery, spend, cap или recovery.

## Мини-игра

Контекст `mini-game` владеет versioned `GameConfiguration`, непересекающимся 84-дневным `GameSeason`,
короткоживущим одноразовым `GameSessionChallenge`, terminal `GameSessionReceipt`, append-only
`PracticeMarkLedger`, `CosmeticGrant` и их reversal/reinstatement links. Клиент владеет только временным состоянием
раунда и локальным best score; клиентский score, clock, trajectory outcome и input trace не становятся
authoritative спортивным фактом.

Game configuration неизменяемо фиксирует режим, число/длительность ходов, дискретные направления, score formula,
дневные цели и cosmetic thresholds. `STANDARD` и `CALM` используют одну reward eligibility, но несравнимые локальные
score projections. Challenge привязан к user, configuration, mode и сроку; его атомарное поглощение создаёт не
более одного receipt. Receipt может подтвердить только bounded low-value reward eligibility, а не честность score
или спортивный навык.

Один receipt может породить не более одной отметки каждого дневного типа, одного cosmetic grant каждого порога и
одной XP source chain по отдельным уникальным ключам. Reversal и reinstatement append-only и ограничены исходным
grant. Mini-game запрашивает global XP через публичный порт gamification с новым versioned source; gamification
владеет XP ledger/caps и не отдаёт игре возможность писать balance. Matches, profiles/statistics, tournaments,
trust score и matchmaking не читают game records или cosmetics.

Identity подтверждает actor, analytics получает только consented минимизированные события, advertising видит
только зарегистрированный некритический placement, administration/trust-safety — purpose-bound reason/audit без
score или input trace. Offline session не создаёт challenge/receipt и остаётся локальной. Точные модели, ключи,
TTL, события и delete policy зафиксированы в
[контрактах и политике данных мини-игры](mini-game-data-policy.md).
