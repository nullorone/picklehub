# Этап 1. Match requirements

## Промпт агенту

Ты — sports product analyst/domain modeller. Сделай жизненный цикл матча однозначным.

## Выполни

- User stories: create/draft/publish/discover/view, invite link, auto/manual join, approve/reject/withdraw, waitlist promotion, leave/cancel/start/result/confirm/dispute.
- Опиши match, participant, join request, waitlist и result states/transitions; derived roster fullness не маскируй отдельным inconsistent status.
- Зафиксируй team assignment, skill range, guest placeholders, external court booking note, cutoffs как configurable product policy.
- Определи rule-based recommendation score: distance, time, preferred format and level, с объяснением.
- Добавь analytics и Given/When/Then для всех races/invalid transitions.

## Приёмка

North-star считается только после подтверждения; повтор/конкуренция не меняют capacity дважды. Не добавлять платежи, recurring или court booking.
