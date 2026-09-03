# Этап 2. Admin contracts и audit data

## Промпт агенту

Ты — RBAC/API architect. Добавь admin endpoints and immutable audit schema.

## Выполни

- Separate `/v1/admin` schemas for cases, venue candidates, user restrictions and audit with strict minimization.
- Backend-enforced permission decorators/policies map to fixed role/action registry.
- `AuditEntry` records actor, action, target opaque ID, reason, request ID, timestamp and safe diff metadata; no secret/free-text duplication.
- Cursor/search limits and export jobs prevent unbounded synchronous dumps.

## Приёмка

Contract documents 403 vs 404 policy, every mutation creates audit in same transaction where possible, migrations append rather than rewrite audit.
