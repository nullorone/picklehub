# Domain model baseline

Initial aggregates and supporting records:

- Identity: `User`, `Identity`, `Session`, `MagicLink`, `Consent`.
- Profile: `PlayerProfile`, `SkillSelfAssessment`, `ExternalProfileLink`, `PlayerPreference`.
- Venue: `Venue`, `VenueSource`, `VenueCandidate`, `VenueRevision`, `VenueModerationDecision`.
- Match: `Match`, `MatchTeam`, `MatchParticipant`, `JoinRequest`, `WaitlistEntry`, `MatchResult`, `GameScore`, `ResultConfirmation`.
- Communication: `Conversation`, `Message`, `Notification`, `NotificationPreference`, `OutboxEvent`.
- Safety: `Review`, `NoShowReport`, `Report`, `Block`, `ModerationCase`, `AuditEntry`.
- Club: `Club`, `ClubMembership`, `ClubVenue`, `RecurringMatchRule`.
- Tournament: `Tournament`, `Entrant`, `Stage`, `Round`, `TournamentMatch`, `Standing`, `FormatDefinition`.
- Progress: `XpLedgerEntry`, `LevelDefinition`, `Achievement`, `LeaderboardSeason`.
- Content/ads: `Article`, `ContentSource`, `Bookmark`, `Campaign`, `Creative`, `Placement`, `AdDeliveryEvent`.

Exact fields, enums, indexes, retention and ownership are defined by the responsible `02-contract-data.md` prompt. Cross-aggregate writes require an explicit application transaction boundary and outbox event.
