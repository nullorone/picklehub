# Этап 2. Mobile contract readiness

## Промпт агенту

Ты — mobile/API architect. Validate contracts and add only required platform-neutral capabilities.

## Выполни

- Audit OpenAPI/AsyncAPI generated client compatibility with React Native runtime.
- Define mobile refresh token transport in secure storage, device/push token registration/revocation and deep-link state.
- Ensure file uploads, WebSocket auth, cursor reconnect and idempotency work without browser cookies where inappropriate.
- Add no mobile-only duplicate DTOs; provider tokens remain backend-owned.

## Приёмка

Codegen builds in Expo, account/session switching clears caches, lost device token is revocable, contract changes preserve TMA/web.
