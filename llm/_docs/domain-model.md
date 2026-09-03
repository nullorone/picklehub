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
