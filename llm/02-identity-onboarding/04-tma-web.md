# Этап 4. Identity UI для TMA и web/PWA

## Промпт агенту

Ты — senior frontend auth engineer. Реализуй доступный onboarding в обоих клиентах.

## Выполни

- TMA автоматически обменивает init data через backend; web запрашивает/поглощает magic link без account enumeration.
- Access token хранится только в памяти; refresh выполняется cookie transport. Не помещай auth artifacts в analytics/storage/logs.
- Реализуй resumable onboarding, validation, consent links, timezone/geography/preferences/level и необязательный DUPR URL/ID.
- Добавь linking/unlinking, logout-all и все loading/error/expired/offline/success states.

## Приёмка

Activation event отправляется ровно после server-confirmed completion. Deep link возвращает пользователя в безопасный intended route. Запусти UI tests/builds.
