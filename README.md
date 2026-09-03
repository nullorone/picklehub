# PickleHub

PickleHub is a prompt-first product specification for a pickleball platform. The first production slice targets Telegram Mini App and web/PWA and helps players discover, assemble, play, and confirm real matches.

The repository is intentionally implemented in stages by AI agents. Start with [`llm/00-project-overview.md`](llm/00-project-overview.md), then execute one prompt at a time in the order listed in [`llm/README.md`](llm/README.md). Application directories are created only by the platform scaffold prompts.

## Target architecture

- `backend/`: NestJS modular monolith, PostgreSQL/PostGIS, Redis/BullMQ and transactional outbox.
- `frontend/web/`: React web application, installable PWA and protected admin routes.
- `frontend/tg/`: Telegram Mini App.
- `frontend/mobile/`: React Native/Expo client, implemented after the core API stabilizes.
- `frontend/packages/`: generated API client and shared domain, validation, i18n, and analytics packages.
- `llm/`: product context, decision records, and executable feature prompts.

The application directories above do not exist in the prompt-only baseline. Do not create them manually or implement a later feature ahead of its prompt.

## Working rules

1. Read the project overview and the current feature's `00-overview.md` before executing a prompt.
2. Complete the feature vertically: requirements, contracts/data, backend, TMA/web, verification.
3. Treat root `openapi.yaml` and `asyncapi.yaml` as contract sources of truth after the scaffold creates them.
4. Record meaningful decisions in `llm/_docs/adr/` and actual execution evidence in `llm/_docs/ai-development-log.md`.
5. Do not claim checks, deployments, legal compliance, data licenses, or external integrations without evidence.

## Prompt documentation checks

```bash
npm install
npm run format:check
npm run docs:check
```

Application commands will be added by `llm/01-platform-foundation/`.
