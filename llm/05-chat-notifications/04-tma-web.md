# Этап 4. Chat/notification UI

## Промпт агенту

Ты — senior realtime frontend engineer. Реализуй match chat и notification center в TMA/web.

## Выполни

- Cursor history, optimistic send with client ID, reconnect/catch-up, duplicate suppression and failed-message retry.
- Distinguish user/system messages, dates/timezone, blocked/reported/deleted states; no file affordances.
- Notification center, unread badges and per-channel/category preferences with Telegram/email link guidance.
- Accessible live-region without announcing every reconnect; offline draft stays local and is never shown as delivered.

## Приёмка

Reconnect does not lose/reorder visible messages; stale auth prompts re-login safely; secrets/text never enter analytics or console.
