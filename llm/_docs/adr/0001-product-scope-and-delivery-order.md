# ADR 0001. Product scope and delivery order

- Status: accepted
- Date: 2026-09-03

## Decision

Deliver TMA and web/PWA Match MVP before clubs, tournaments, gamification, content, ads, mobile and mini-game. Keep later domains visible in architecture but do not implement speculative code for them.

The first public slice contains identity/onboarding, venues, match discovery/lifecycle, chat/notifications, profile/statistics, trust & safety and minimum admin operations. Premium, payments and court booking are excluded.

## Consequences

- Real-world match completion can be measured before expensive extensions.
- Web and TMA stay contract-compatible while keeping platform-specific UI.
- Full tournament breadth is delayed but implemented later over a single strategy engine.
