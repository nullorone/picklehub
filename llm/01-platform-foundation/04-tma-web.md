# Этап 4. Web/PWA и TMA scaffold

## Промпт агенту

Ты — senior frontend platform engineer. Создай `frontend/web`, `frontend/tg` и shared packages без business UI.

## Выполни

1. Настрой React/Vite, Router, TanStack Query, React Hook Form, schema validation и i18n с русским default.
2. Web должен собираться как сайт и installable PWA; TMA использует официальный Telegram SDK и корректный mock только в development.
3. Создай packages `api-client`, `domain`, `validation`, `i18n`, `analytics`; API client генерируется из OpenAPI.
4. Реализуй neutral shell, error boundary, offline indicator, theme/accessibility foundations и typed runtime config.
5. Не переносить legacy UI и TON Connect. Настрой tests/build/Docker для web и TMA.

## Приёмка и проверка

Оба shell запускаются, PWA manifest/service worker валидны, production не содержит mocks, codegen воспроизводим. Запусти lint/typecheck/tests/build.
