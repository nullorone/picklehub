# Этап 3. Admin backend

## Промпт агенту

Ты — senior RBAC/audit NestJS engineer. Implement minimum backoffice APIs.

## Выполни

- Central permission policy, platform-role assignment restricted to superadmin and session reauthentication for sensitive actions.
- Case transitions, venue merge decisions and reversible user restrictions with reason/audit.
- Protect searches from enumeration/bulk extraction; rate limit exports and redact sensitive fields by role.
- Add operational metrics and alerts for queue age, failed audit write and repeated unauthorized access.

## Приёмка

UI cannot bypass policy; audit failure rolls back protected mutation when required; role downgrade revokes sessions/permissions promptly.
