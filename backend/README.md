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

`POST /sessions/telegram` verifies Mini App initData with the official Telegram Web Apps HMAC procedure and rejects
data older than 24 hours or more than 30 seconds in the future. It creates or finds the account by the verified
Telegram numeric ID and returns a 30-day opaque Bearer token. Only the token SHA-256 hash is stored in `sessions`;
the guard checks expiry on each protected request. `TELEGRAM_BOT_TOKEN` is required and must be supplied through the
runtime environment or an untracked `.env`; never put it in frontend variables. The process applies a per-IP login
limit of 10 attempts per minute. Its limiter is process-local, suitable for the single-process pilot; a multi-instance
deployment needs a shared limiter.

For a separate frontend and API origin, keep the returned Bearer token in frontend memory and send it in the
`Authorization` header; do not put it in a URL, browser storage, or logs. The API currently does not enable
credentialed CORS or cookie auth. Telegram initData and the bot token follow Telegram's
[Mini App validation procedure](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
Development MSW mocks are gated by Vite's `import.meta.env.DEV`; production builds do not enable them.
Local development CORS origins should be explicitly added to the environment;
the committed example contains localhost and the current GitHub Pages origin.

## Database and durable jobs

Prisma schema lives in `prisma/schema.prisma`; apply committed migrations with
`npm run prisma:migrate:deploy --workspace @picklehub/backend` and regenerate the client with
`npm run prisma:generate --workspace @picklehub/backend`. A Telegram identity is separate from the internal user;
sessions store only a token hash. A game references its organizer independently from `game_participants`, so an
organizer who opted out still has management ownership. Participant uniqueness is enforced by the database.

Joining must run in a PostgreSQL transaction and take `SELECT ... FROM games WHERE id = $1 FOR UPDATE` before
checking status, start time, and participant count, then insert the participant. All join/leave/capacity-changing
operations use that same game-row lock. This serializes competing joins for the final place; the unique
`(game_id, user_id)` constraint protects duplicate membership even if application code races. The count check must
include an organizer who participates because that identity also has a participant row.

Jobs are durable rows in `jobs`, not process memory. A business mutation increments `games.event_version` and
inserts its job with a stable key such as `game:<id>:<version>:<event-type>` in the _same Prisma transaction_;
the unique key prevents duplicate enqueue. Claim batches atomically with `FOR UPDATE SKIP LOCKED`, changing due
`PENDING` rows to `PROCESSING`, setting `locked_at`/`locked_by`, and incrementing attempts in one statement. After
the external call, mark completed or return to pending with exponential delay `min(2^attempts * 5 seconds, 1 hour)`;
after 8 attempts mark `DEAD` and retain only a bounded internal error code (never provider response bodies or user
content). A worker periodically requeues `PROCESSING` rows whose lease is older than 5 minutes, clearing lease
fields; exhausted rows become `DEAD`. Claiming and delivery are deferred to S17/S18. Before delivery, compare the
job's game version and current state and resolve current recipients; this avoids sending stale cancellation or
reminder jobs. The Telegram send boundary cannot guarantee exactly-once delivery after an ambiguous network result.

The initial migration has DB checks for valid durations/capacities, event versions, retry counts, and coherent
leases. Fixtures are intentionally absent; use synthetic data in isolated local verification databases only.

## Checks

Run `npm run check --workspace @picklehub/backend` (includes Prisma generation) or `npm run backend:check` from
the repository root, or run the corresponding `format`, `lint`, `typecheck`, `test`,
`contracts:check`, and `build` scripts in this workspace. `contracts:check` compares TypeSpec route declarations with
generated OpenAPI paths and ensures operational health routes stay outside the public product contract.
