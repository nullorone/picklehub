# Этап 5. Club verification

## Промпт агенту

Ты — multi-tenant authorization SDET. Test clubs end-to-end.

## Проверки

- All membership policies, invite/request races, remove/leave, last owner and ownership transfer.
- Cross-club authorization/isolation and platform-vs-club role confusion.
- Recurrence around DST/timezone, retries, edits, cancellation and duplicate worker execution.
- Club without venues, linked venue merge and historical event preservation.
- E2E club join → recurring match → confirmed completion.

## Приёмка

No cross-club mutation or duplicate occurrence; club metrics derive from confirmed events. Record matrix/evidence.
