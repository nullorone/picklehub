# Этап 1. Venue requirements

## Промпт агенту

Ты — geospatial product analyst. Опиши venue discovery, contribution и moderation.

## Выполни

- User stories: map/list search, text geocode, select existing venue, create candidate, suggest correction, report private/duplicate/closed venue.
- Определи source/provenance, verification state, merge history, attribution, accessibility/amenity fields и stale-data policy.
- Зафиксируй публикацию candidate после completed match, moderator decisions и запрет private residence.
- Определи product/quality metrics и Given/When/Then для duplicates, missing coordinates, provider outage и deleted source.

## Приёмка

Ни один внешний result не сохраняется без разрешённого provenance. Требования поддерживают площадку без клуба и клуб без площадки.
