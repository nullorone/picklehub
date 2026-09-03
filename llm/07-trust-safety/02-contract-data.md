# Этап 2. Safety contracts и данные

## Промпт агенту

Ты — privacy/API architect. Добавь user safety contracts и case model.

## Выполни

- Player endpoints: reviews, no-show/report submit, blocks and own case receipt/status with minimized details.
- Модели: `Review`, `NoShowReport`, `Report`, `Block`, `ModerationCase`, `ModerationDecision`, immutable `AuditEntry`.
- Encrypt/restrict free-form evidence, separate public aggregates, define status machine and unique eligibility constraints.
- Async events contain case IDs/category only, not narratives or attachments.

## Приёмка

Authorization prevents case browsing, repeated submit is idempotent, deletion/retention has documented legal hold behavior. Contracts/migrations pass.
