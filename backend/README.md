# PickleHub backend

The backend is a single NestJS process. Its public product API is the REST surface generated from
[`contracts/main.tsp`](../contracts/main.tsp); health endpoints are operational and are deliberately outside that
contract. Product routes will be implemented in later tasks. Do not expose database models as response DTOs.

## Local development

From the repository root:

```sh
docker compose -f backend/docker-compose.yml up -d --wait
cp backend/.env.example backend/.env
npm run dev --workspace @picklehub/backend
```

The API listens on `http://127.0.0.1:3000`. `GET /health/live` reports process liveness. `GET /health/ready`
executes a small PostgreSQL query and returns HTTP 503 while the database cannot be reached. PostgreSQL data is
kept in the named `picklehub-postgres` volume; stop the service with `docker compose -f backend/docker-compose.yml
down`. Removing data requires explicitly removing that volume.

Configuration is read from environment variables and then `backend/.env` (existing process variables take priority).
Copy the example file for local use. `DATABASE_URL` must be a PostgreSQL URL, `FRONTEND_ORIGINS` is a comma-separated
allowlist of exact HTTP(S) origins, and wildcard origins are rejected. Startup validation reports invalid field names
and requirements without printing supplied values. Never commit `.env` or production credentials.

The process handles `SIGINT` and `SIGTERM` through Nest shutdown hooks and closes the PostgreSQL pool. Request logs
contain only request ID, HTTP method, URL path (not query string), status, and duration. Request headers and bodies,
Telegram init data, authorization values, email, and user content are not logged. A valid incoming `X-Request-Id` is
returned as-is; otherwise the server generates one.

The API has no auth bypass or product endpoints in this foundation task. Telegram session verification and routes
will be added in their ordered tasks. Local development CORS origins should be explicitly added to the environment;
the committed example contains localhost and the current GitHub Pages origin.

## Checks

Run `npm run backend:check` from the repository root, or run the corresponding `format`, `lint`, `typecheck`, `test`,
`contracts:check`, and `build` scripts in this workspace. `contracts:check` compares TypeSpec route declarations with
generated OpenAPI paths and ensures operational health routes stay outside the public product contract.
