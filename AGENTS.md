# Repository Guidelines

## Repository purpose

This is a prompt-first monorepo for PickleHub. Until the scaffold stage, root contains shared configuration and `llm/`. Later prompts create `backend/` and `frontend/`; never create product code ahead of the active prompt.

Read `llm/00-project-overview.md`, `llm/README.md`, the active feature overview, and every earlier completed prompt result before making changes. Execute one prompt at a time and stop when its acceptance criteria are not met.

## Target structure

- `backend/`: NestJS modular monolith.
- `frontend/web/`: React website, PWA, and admin backoffice.
- `frontend/tg/`: Telegram Mini App.
- `frontend/mobile/`: React Native/Expo application implemented after API stabilization.
- `frontend/packages/`: shared API/domain/validation/i18n/analytics packages; do not share platform UI blindly.
- `llm/<feature>/`: vertical implementation prompts.
- `llm/_docs/`: requirements, architecture, analytics, security, ADR, and factual AI development log.

## Engineering rules

- Use strict TypeScript, npm workspaces, and the root lockfile.
- Use four-space indentation, single quotes, semicolons, trailing ES5 commas, and a 120-character width unless an app-specific formatter created by a prompt says otherwise.
- OpenAPI is the REST source of truth; AsyncAPI is the realtime/event source of truth. Never hand-edit generated clients.
- Store time in UTC and render it in the user's timezone. Store geographic coordinates in PostGIS.
- Never log Telegram init data, auth tokens, magic links, email addresses, chat text, exact user movement, or advertising identifiers.
- Preserve transactional invariants with database constraints and idempotency; application pre-checks alone are insufficient.
- Do not add payments, court booking, age verification, DUPR scraping, arbitrary JavaScript execution, or unapproved content scraping.

## Required verification

Every implementation prompt defines its own checks. At minimum, affected work must pass format, lint, typecheck, relevant tests, contract checks, and builds. Do not weaken a check or update snapshots merely to make CI green. Record exact commands and outcomes in `llm/_docs/ai-development-log.md`.

## Security and production

Production must use Russian data residency subject to legal review. Do not commit secrets or real personal data. External map, OSM, DUPR, news, email, Telegram, analytics, and advertising integrations require verified terms and provider adapters. A provider name in documentation is not evidence of permission or compliance.

## Commits

Use focused Conventional Commit subjects such as `docs: add match prompts`, `feat: implement venue search`, or `fix: prevent duplicate match joins`. Pull requests must name the active prompt, affected clients/routes, contract changes, verification commands, and UI evidence where applicable.
