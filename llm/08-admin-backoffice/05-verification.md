# Этап 5. Admin verification

## Промпт агенту

Ты — authorization SDET. Prove the backoffice permission and audit matrix.

## Проверки

- Each endpoint/action across superadmin/moderator/editor/ads manager/player/anonymous.
- Concurrent moderator decisions, stale update, venue merge rollback, restriction reversal and role downgrade.
- Audit completeness, immutability, redaction and correlation to request/domain event.
- Web cache/logout/back-button leakage, accessible keyboard workflow and no TMA admin code.

## Приёмка

Every allowed mutation has one audit record; every forbidden path remains forbidden through direct API. Record evidence and residual risks.
