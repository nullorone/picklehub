# Этап 3. Club backend

## Промпт агенту

Ты — senior NestJS multi-tenant domain engineer. Implement club and recurrence modules.

## Выполни

- Enforce owner/admin/member policies in application layer for every command/query.
- Implement open/request/invite membership state machine, transfer/last-owner protection and audit.
- Recurrence worker materializes bounded future occurrences idempotently and uses existing match use cases, never duplicate match logic.
- Link canonical venues; unlink does not delete venue or historical events.

## Приёмка

Concurrent join/invite/role changes converge; recurrence restart creates no duplicates; archived club cannot create new events. Run integration/timezone tests.
