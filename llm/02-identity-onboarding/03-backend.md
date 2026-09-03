# Этап 3. Identity backend

## Промпт агенту

Ты — senior NestJS auth engineer. Реализуй contracts без сторонней auth-платформы.

## Выполни

- Проверяй подпись/freshness Telegram init data и не принимай user fields без верификации.
- Реализуй одноразовый hashed magic link, нейтральный request response, rate limits и provider email adapter.
- Реализуй short access sessions, rotating refresh families, reuse detection, revoke/logout-all и audited identity linking.
- Onboarding completion атомарно валидирует профиль/consents и публикует один безопасный event.
- Добавь fake clock и fake providers для детерминированных тестов.

## Приёмка

Replay, concurrent consume/link и stolen rotated token не создают второй аккаунт/сессию. Логи и outbox свободны от секретов/PII. Запусти backend checks.
