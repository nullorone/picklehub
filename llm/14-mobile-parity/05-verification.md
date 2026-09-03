# Этап 5. Mobile verification

## Промпт агенту

Ты — mobile SDET/release engineer. Verify parity and production packaging without publishing stores.

## Проверки

- Automated parity matrix via unit/component and Maestro/Detox E2E on representative iOS/Android.
- Magic/deep links cold/warm start, secure storage, rotation/logout/delete and account switch.
- Map/location denied, WebSocket background reconnect, push duplicate/tap routing and offline mutation behavior.
- Accessibility, font scaling, reduced motion, small screen and performance/crash monitoring hooks.
- Build artifacts contain no dev URL, mock, source secret or signing material.

## Приёмка

All Match MVP stories are pass/explicitly blocked with evidence; store submission remains a separately authorized external action.
