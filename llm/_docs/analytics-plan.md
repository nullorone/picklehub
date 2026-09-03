# Product analytics baseline

## Funnel

1. `app_opened`
2. `auth_completed`
3. `onboarding_completed` — activation
4. `match_created` or `join_requested`
5. `match_roster_completed`
6. `match_completed_confirmed` — north-star input
7. `second_match_completed` — retention signal

## Guardrail metrics

- time to first match intent and time to fill;
- join approval and waitlist conversion;
- cancellation/no-show/dispute/report rates;
- notification delivery and opt-out rates;
- venue candidate approval/duplicate rates;
- D1/D7/D30 return and second-match conversion;
- chat/report abuse and ad impact on critical conversion.

Events use opaque user/match IDs, a versioned schema, consent policy and retention limits. Never include email, chat text, auth artifacts, exact coordinates or free-form report content. Feature requirements must define event trigger, properties, deduplication, owner and dashboard use.
