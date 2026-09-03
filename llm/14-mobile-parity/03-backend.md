# Этап 3. Mobile backend support

## Промпт агенту

Ты — senior mobile backend engineer. Implement only backend gaps approved by the contract prompt.

## Выполни

- Mobile session issuance/rotation/revocation with device metadata minimization and secure token policy.
- Push provider port, device registration, preference integration, idempotent jobs and invalid-token cleanup.
- Universal/app link configuration endpoints where needed; never expose email/Telegram provider secrets.
- Add mobile-specific abuse/rate metrics without fingerprinting users.

## Приёмка

Push/provider outage does not block domain operations; logout/delete revokes device delivery; TMA/web regression suite stays green.
