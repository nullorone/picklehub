# Этап 3. Chat/notification backend

## Промпт агенту

Ты — senior NestJS realtime/messaging engineer. Реализуй gateways, persistence и delivery workers.

## Выполни

- Authenticate WebSocket, authorize every subscription/message, persist before emit and support cursor reconnect.
- Emit system messages from idempotent domain-event consumers, not from frontend actions.
- Outbox dispatcher and BullMQ workers implement retries/backoff/deduplication/dead-letter visibility.
- Telegram and email provider adapters enforce opt-in/link state, redaction, templates and provider rate limits.
- Add unread counters, preferences, quiet hours, metrics and graceful shutdown.

## Приёмка

Redis/provider outage delays delivery without losing committed events; unauthorized former participant cannot read new chat. Integration tests use real PostgreSQL/Redis.
