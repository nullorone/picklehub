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

Публичная проекция применяет profile visibility и двусторонний direct-access deny при блокировке. Она не содержит
email, Telegram subject, timezone, consent, точную географию, invite token, dispute/no-show evidence или reporter.
Raw DUPR URL, имя, точный счёт и пользовательские показатели запрещены в generic outbox, job, logs и analytics;
consumer получает opaque match/result/revision ID и дочитывает источник через внутренний авторизованный port.
Точные поля, SQL constraints, события и cursor определяет `06-player-profile-stats/02-contract-data.md`.
