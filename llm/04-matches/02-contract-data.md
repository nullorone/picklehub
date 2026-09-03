# Этап 2. Match contracts и данные

## Промпт агенту

Ты — API/database architect. Добавь match aggregate в OpenAPI/AsyncAPI и data model.

## Выполни

- Endpoints: discovery/recommendations/details, CRUD draft/publish, join/approve/reject/withdraw/leave, waitlist, cancel/start, result propose/confirm/dispute.
- Модели: `Match`, `MatchTeam`, `MatchParticipant`, `JoinRequest`, `WaitlistEntry`, `MatchResult`, `GameScore`, `ResultConfirmation`.
- Database constraints защищают capacity, unique active participation, ordering and one effective result transition; все команды idempotent.
- Public discovery не выдаёт unlisted matches; opaque share token не является authorization для мутаций.
- Versioned events описывают transitions без chat/PII.

## Приёмка

OpenAPI/codegen/migrations валидны; constraints выдерживают concurrent last-slot attempts; result score schema поддерживает 11/15/21 и win-by-two validation.
