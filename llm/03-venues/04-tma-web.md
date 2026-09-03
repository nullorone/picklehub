# Этап 4. Venue UI для TMA и web/PWA

## Промпт агенту

Ты — senior geospatial frontend engineer. Реализуй карту, список и выбор площадки.

## Выполни

- Используй MapLibre-compatible adapter и разрешённый configurable tile provider с attribution.
- Реализуй permission-aware geolocation, manual area, bbox/radius list, search, marker clustering и accessible list fallback.
- Форма новой площадки предупреждает о публичности адреса и запрещает очевидный private residence use.
- Покажи source/verification, report/correction, loading/empty/provider-error/offline states.

## Приёмка

Отказ geolocation не блокирует поиск; карта не обязательна для keyboard/screen reader flow; exact user movement не попадает в analytics.
