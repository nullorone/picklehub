# Security, privacy and legal baseline

- Production personal data must be localized in Russia, subject to qualified legal review before public launch.
- Telegram init data is verified server-side with freshness checks. Magic links and refresh tokens are hashed/rotated/revocable.
- Platform RBAC and club/tournament scoped roles are enforced in backend use cases, never only in UI.
- Public user-generated venues must be sports facilities; private residences are rejected and reportable.
- The product does not verify age. Minimize profile data, expose reporting/blocking and document this unresolved risk.
- Logs, traces, analytics and queues exclude secrets, email, chat text, exact movement history and unnecessary personal data.
- OSM attribution and ODbL obligations are mandatory. Other maps/geocoders may be used only within current official terms.
- DUPR is never scraped. News imports require source allowlists and rights/attribution review. Ads require labeling, frequency caps and legal review.
- Define retention/deletion/export flows before production; destructive moderation actions require audit records.
