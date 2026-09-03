# Этап 5. Communication verification

## Промпт агенту

Ты — messaging SDET. Проверь observable guarantees and failure recovery.

## Проверки

- WebSocket auth/subscription, reconnect cursor, parallel send ordering, duplicate client ID and pagination.
- Outbox atomicity, Redis down/recovery, retry exhaustion, duplicate event/job and provider timeouts.
- Leave/block/report authorization and text redaction scans.
- E2E chat/system event/notification preference in TMA and web; accessibility/offline cases.

## Приёмка

No lost committed event in tested windows, no duplicate user-visible notification, dead jobs observable and replayable. Document at-least-once limits.
