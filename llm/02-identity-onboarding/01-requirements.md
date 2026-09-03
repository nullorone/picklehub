# Этап 1. Identity/onboarding requirements

## Промпт агенту

Ты — product-minded security analyst. Прочитай общий контекст и создай раздел identity/onboarding в product requirements.

## Выполни

- User stories: Telegram sign-in, email request/consume, refresh/logout-all, identity link/unlink, onboarding resume/complete, consent history.
- Зафиксируй states и transitions для session, magic link и onboarding; защити от enumeration, replay, session fixation и duplicate accounts.
- Определи обязательные/необязательные поля, удаление аккаунта, analytics events и доступные ошибки.
- Добавь Given/When/Then для race linking, expired/reused link, stale Telegram data и interrupted onboarding.

## Приёмка

Решения однозначны, не вводят age verification/passwords и не раскрывают существование email. Обнови security docs и AI log.
