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
