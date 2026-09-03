# Этап 4. Client delivery, CI/CD and release

## Промпт агенту

Ты — senior frontend platform/DevOps engineer. Build safe CI/CD and deploy-ready client artifacts.

## Выполни

- CI jobs for contracts, affected workspaces, PostgreSQL/Redis integration, E2E, Docker, dependency/license/secret scans and artifact provenance.
- Deploy web/PWA/TMA as separate versioned artifacts with exact API origins, CSP/security headers, cache strategy and source-map policy.
- Configure Telegram production environment/deep links only from documented values; no dev mocks/TON demo.
- Add canary/rollback, cache purge, frontend-backend compatibility and smoke scripts.
- Prepare mobile pipeline only if feature `14` is complete; do not publish stores automatically.

## Приёмка

PR cannot deploy, failed required check blocks release, artifact matches tested commit, rollback is rehearsed, production config has no wildcard CORS/secrets.
