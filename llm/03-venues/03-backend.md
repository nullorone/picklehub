# Этап 3. Venue backend и import

## Промпт агенту

Ты — senior geospatial backend engineer. Реализуй venue module и provider ports.

## Выполни

- Реализуй PostGIS search, normalization/deduplication candidates и immutable provenance.
- Создай idempotent OSM importer с Overpass adapter, checkpoint, attribution, rate/backoff и dry-run; не используйте production public tile server как bulk API.
- Geocoder adapter возвращает ephemeral suggestions и сохраняет только разрешённые данные с provider metadata.
- Candidate promotion запускается от confirmed match event, но public publication требует moderation.
- Добавь audit, metrics и safe cache invalidation.

## Приёмка

Повтор import не дублирует точки; provider outage не удаляет каталог; private-address report скрывает candidate до review. Запусти PostGIS/integration tests.
