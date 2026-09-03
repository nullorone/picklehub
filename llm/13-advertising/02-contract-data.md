# Этап 2. Advertising contracts и data model

## Промпт агенту

Ты — ad serving/API architect. Design direct inventory and provider-neutral fallback.

## Выполни

- Client decision endpoint receives coarse context and placement, returns labelled creative or no-fill; click uses safe redirect/receipt.
- Admin endpoints cover campaigns, creatives, placements, targeting, approval, pause and aggregate reports.
- Models: `Campaign`, `Creative`, `Placement`, `TargetRule`, `DeliveryCounter`, `AdDeliveryEvent`; no raw movement/event profile.
- Idempotent impression/click tokens, TTL, fraud limits and aggregate retention; event contracts exclude auth/PII.

## Приёмка

Contracts distinguish served/viewable/clicked, caps work across sessions per allowed identifier, and direct/no-fill/fallback are explicit.
