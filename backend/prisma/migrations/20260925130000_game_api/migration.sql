ALTER TABLE "games" DROP CONSTRAINT "games_duration_minutes_check";
ALTER TABLE "games" ADD CONSTRAINT "games_duration_minutes_check" CHECK ("duration_minutes" BETWEEN 30 AND 480);
ALTER TABLE "games" ALTER COLUMN "level" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "display_name" VARCHAR(120) NOT NULL DEFAULT 'Игрок';

CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_user_id_key_key" ON "idempotency_records"("user_id", "key");
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
