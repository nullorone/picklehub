# Этап 2. Chat/notification contracts и данные

## Промпт агенту

Ты — AsyncAPI and messaging architect. Расширь contracts и data model.

## Выполни

- REST history/cursor, send command fallback, notification list/read/preferences/device-link endpoints.
- AsyncAPI channels: authenticate, subscribe match, message created/updated/deleted, system event, notification and structured error.
- Модели: `Conversation`, `Message`, `Notification`, `NotificationDelivery`, `NotificationPreference`; sequence/order and idempotency keys.
- Versioned safe domain events и BullMQ job payloads; chat body не копируется в общий domain outbox без необходимости.

## Приёмка

Reconnect cursor closes gaps, authorization is server-side, duplicate event/job does not create duplicate notification/delivery. Lint/codegen and migrations pass.
