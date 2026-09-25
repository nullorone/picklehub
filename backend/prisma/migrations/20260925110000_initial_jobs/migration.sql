-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "public"."GameStatus" AS ENUM ('OPEN', 'CANCELLED');
CREATE TYPE "public"."JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'DEAD');

CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."telegram_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."games" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "venue_name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "participant_limit" SMALLINT NOT NULL,
    "level" VARCHAR(80) NOT NULL,
    "description" VARCHAR(2000),
    "status" "public"."GameStatus" NOT NULL DEFAULT 'OPEN',
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "games_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "games_duration_minutes_check" CHECK ("duration_minutes" BETWEEN 30 AND 360),
    CONSTRAINT "games_participant_limit_check" CHECK ("participant_limit" BETWEEN 2 AND 32),
    CONSTRAINT "games_event_version_check" CHECK ("event_version" > 0)
);

CREATE TABLE "public"."game_participants" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "game_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."jobs" (
    "id" UUID NOT NULL,
    "game_id" UUID,
    "type" VARCHAR(40) NOT NULL,
    "event_version" INTEGER NOT NULL,
    "deduplication_key" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 8,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(100),
    "last_error_code" VARCHAR(80),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "jobs_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= "max_attempts"),
    CONSTRAINT "jobs_max_attempts_check" CHECK ("max_attempts" BETWEEN 1 AND 20),
    CONSTRAINT "jobs_processing_lease_check" CHECK (("status" = 'PROCESSING') = ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL))
);

CREATE UNIQUE INDEX "telegram_identities_user_id_key" ON "public"."telegram_identities"("user_id");
CREATE UNIQUE INDEX "telegram_identities_telegram_user_id_key" ON "public"."telegram_identities"("telegram_user_id");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "public"."sessions"("token_hash");
CREATE INDEX "sessions_expires_at_idx" ON "public"."sessions"("expires_at");
CREATE INDEX "games_starts_at_status_idx" ON "public"."games"("starts_at", "status");
CREATE INDEX "game_participants_user_id_idx" ON "public"."game_participants"("user_id");
CREATE UNIQUE INDEX "game_participants_game_id_user_id_key" ON "public"."game_participants"("game_id", "user_id");
CREATE UNIQUE INDEX "jobs_deduplication_key_key" ON "public"."jobs"("deduplication_key");
CREATE INDEX "jobs_status_available_at_idx" ON "public"."jobs"("status", "available_at");
CREATE INDEX "jobs_status_locked_at_idx" ON "public"."jobs"("status", "locked_at");
CREATE INDEX "jobs_game_id_event_version_idx" ON "public"."jobs"("game_id", "event_version");

ALTER TABLE "public"."telegram_identities" ADD CONSTRAINT "telegram_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."games" ADD CONSTRAINT "games_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."game_participants" ADD CONSTRAINT "game_participants_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."game_participants" ADD CONSTRAINT "game_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL ON UPDATE CASCADE;
