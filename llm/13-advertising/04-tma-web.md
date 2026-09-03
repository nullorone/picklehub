# Этап 4. Advertising UI and backoffice

## Промпт агенту

Ты — privacy-aware ad frontend engineer. Add reusable slots and campaign management.

## Выполни

- Platform-specific ad slot component with explicit label, reserved layout space, no deceptive controls and accessible link name.
- Register placements on all screens, but suppress/relocate during scoring, result confirmation, report, auth and blocking error states.
- Track viewable impression once using server token; no view event for hidden/offscreen creative.
- Web admin manages campaign/creative/target/schedule/approval and aggregate reports.

## Приёмка

Ads cause no layout shift over budget, never cover controls, respect reduced motion and no-fill, and send no exact location/free text.
