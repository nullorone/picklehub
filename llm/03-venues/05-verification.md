# Этап 5. Venue verification

## Промпт агенту

Ты — geospatial SDET/data quality engineer. Проверь venue vertical slice.

## Проверки

- PostGIS radius/bbox boundary, antimeridian-safe assumptions для целевого региона, index plans и pagination.
- OSM import replay, changed/deleted source, attribution, rate limit and malformed geometry.
- Candidate dedupe/merge, completed-match trigger, private address report и moderation handoff.
- Map/list parity, denied geolocation, offline cache and provider outage E2E.
- License/provider checklist фиксирует только доказанные разрешения.

## Приёмка

Нет silent data copying, duplicate canonical venues или broken match references. Все checks и gaps внесены в AI log.
