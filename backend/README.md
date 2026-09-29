# PickleHub backend

The backend API is a NestJS process with a separate notification worker. Its public product API is the REST surface generated from
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

For local Mini App integration, start PostgreSQL and the backend, then run `npm run start:api` from the root.
This sets `VITE_API_MOCKS=false` and proxies `/api` through Vite to `http://127.0.0.1:3000`. Open the
frontend from a real Telegram Mini App; a normal browser has no verified Telegram initData. For a separate
frontend and backend origin, set `VITE_API_URL` to the reachable HTTPS API origin at build time and add the
frontend origin to `FRONTEND_ORIGINS`. A production build requires `VITE_API_URL`; otherwise the login screen
reports missing API configuration. The default `npm start` remains the isolated mock development mode.

`POST /games`, `GET /games`, and `GET /games/:gameId` require a Bearer session. Creation accepts an
`Idempotency-Key` and atomically stores the game, the optional organizer participation, and the response snapshot.
The key is scoped to the authenticated user; repeating the same request replays its response, while using that key
with a different body returns `409`. The list contains future open games in start-time/ID order with a base64url
cursor. The detail response includes participants; status is `FULL` when the participant limit is reached.

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
inserts its job with a stable key in the _same Prisma transaction_; the unique key prevents duplicate enqueue.
Run the S17 worker separately with `npm run start:worker --workspace @picklehub/backend`. It claims due notification
rows atomically with `FOR UPDATE SKIP LOCKED`, recovers leases older than 60 seconds, and creates one deduplicated
delivery row per event recipient in a transaction. Event recipients and game details are captured at the business
mutation, so later roster changes do not redirect a past notification. The worker checks current Telegram reachability
before sending. Temporary failures and rate limits retry up to eight attempts with capped exponential delay; a
permanent refusal or exhausted retries marks only that recipient's delivery `DEAD`. Diagnostics contain job ID and
bounded error code, never message text, chat ID, token, or Telegram response body. The Telegram send boundary
cannot guarantee exactly-once delivery after an ambiguous network result.

`GAME_REMINDER` is scheduled at `starts_at` minus two hours with a unique game/time-version key. Rescheduling and
cancellation mark pending or leased reminder rows stale in the same transaction as the game update. The worker
rechecks the game status, start time and current roster when expanding the reminder and again immediately before
each delivery. Only participants whose latest join predates the reminder due time qualify; an organizer receives it
only while occupying a participant slot. The worker may send a late reminder for at most 15 minutes after the due
time, and never at or after game start. A reminder missed beyond that window is completed without delivery. Tests
inject a clock into the worker to exercise the threshold without waiting two hours. A concurrent game change after
the final check but during a Telegram network request cannot be recalled; as with other notifications, an ambiguous
Telegram response can result in a duplicate on retry.

The initial migration has DB checks for valid durations/capacities, event versions, retry counts, and coherent
leases. Fixtures are intentionally absent; use synthetic data in isolated local verification databases only.

## Checks

Run `npm run check --workspace @picklehub/backend` (includes Prisma generation) or `npm run backend:check` from
the repository root, or run the corresponding `format`, `lint`, `typecheck`, `test`,
`contracts:check`, and `build` scripts in this workspace. `contracts:check` compares TypeSpec route declarations with
generated OpenAPI paths and ensures operational health routes stay outside the public product contract.
