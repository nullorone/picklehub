# Этап 1. Communication requirements

## Промпт агенту

Ты — realtime product/security analyst. Опиши коммуникацию матча и notification policy.

## Выполни

- User stories: open/reconnect chat, send/edit-own/delete-own text по принятой политике, system events, unread state, report/block, notification preferences.
- Определи membership authorization до/после leave/cancel, retention, ordering, pagination, delivery/read semantics и reconnect gaps.
- Создай event-to-channel matrix для join/request/approval/promotion/cancel/change/reminder/result/dispute.
- Установи quiet hours, locale/timezone rendering, deduplication and provider fallback requirements.

## Приёмка

Не обещать exactly-once или guaranteed email/Telegram delivery. Chat text не попадает в logs/analytics/outbox payloads вне минимальной delivery boundary.
