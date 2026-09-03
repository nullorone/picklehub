# Этап 4. Match UI для TMA и web/PWA

## Промпт агенту

Ты — senior sports frontend engineer. Реализуй полный match flow в TMA и web/PWA.

## Выполни

- Discovery объединяет карту, список, filters и explainable recommendations; deep links открывают unlisted/public details.
- Создание поддерживает singles/doubles, venue/new address, date/timezone, skill range, join mode, visibility, guest slots and external booking note.
- Details показывают teams, requests/waitlist, organizer actions, cancellation state and notification preference.
- Result UI вводит партии, подтверждает/оспаривает и не показывает неподтверждённую статистику как финальную.
- Реализуй loading/empty/conflict/offline/error/success и accessible confirmation dialogs.

## Приёмка

TMA/web имеют одинаковые rules, double submit идемпотентен, stale roster conflict вызывает refetch и понятное сообщение.
