# Этап 2. Venue contracts и данные

## Промпт агенту

Ты — PostGIS/API architect. Добавь venue endpoints и model.

## Выполни

- OpenAPI: list/map bbox/radius/text search, details, candidate create, correction/report; admin moderation остаётся в feature `08`.
- Модели: `Venue`, `VenueSource`, `VenueCandidate`, `VenueRevision`; geography point, GiST indexes, normalized address and source IDs.
- Определи cursor pagination, maximum radius/bbox, coordinate precision, attribution payload и stable provider-unavailable errors.
- Добавь internal events `venue.candidate_created`, `venue.verified`, `venue.merged` без personal location history.

## Приёмка

Contract lint/codegen и migration tests проходят; proximity queries используют index; merge сохраняет ссылки существующих матчей.
