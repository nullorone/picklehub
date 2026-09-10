CREATE TYPE "venue_import_status" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "venue_import_runs" (
    "id" UUID NOT NULL,
    "provider_key" VARCHAR(80) NOT NULL,
    "source_version" VARCHAR(160) NOT NULL,
    "scope_key" VARCHAR(160) NOT NULL,
    "dry_run" BOOLEAN NOT NULL,
    "status" "venue_import_status" NOT NULL DEFAULT 'RUNNING',
    "checkpoint" JSONB NOT NULL DEFAULT '{"offset":0}'::JSONB,
    "scanned_count" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "deduplicated_count" INTEGER NOT NULL DEFAULT 0,
    "quarantined_count" INTEGER NOT NULL DEFAULT 0,
    "failure_code" VARCHAR(96),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    CONSTRAINT "venue_import_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_import_runs_counts_check" CHECK (
        "scanned_count" >= 0 AND "created_count" >= 0 AND
        "deduplicated_count" >= 0 AND "quarantined_count" >= 0
    ),
    CONSTRAINT "venue_import_runs_state_check" CHECK (
        ("status" = 'RUNNING' AND "finished_at" IS NULL AND "failure_code" IS NULL) OR
        ("status" = 'COMPLETED' AND "finished_at" IS NOT NULL AND "failure_code" IS NULL) OR
        ("status" = 'FAILED' AND "finished_at" IS NOT NULL AND "failure_code" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "venue_import_runs_idempotency_key"
    ON "venue_import_runs" ("provider_key", "source_version", "scope_key", "dry_run")
    WHERE "status" = 'COMPLETED';
CREATE INDEX "venue_import_runs_resume_idx"
    ON "venue_import_runs" ("provider_key", "scope_key", "status", "started_at");

CREATE TABLE "venue_import_checkpoints" (
    "provider_key" VARCHAR(80) NOT NULL,
    "scope_key" VARCHAR(160) NOT NULL,
    "source_version" VARCHAR(160) NOT NULL,
    "checkpoint" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_import_checkpoints_pkey" PRIMARY KEY ("provider_key", "scope_key"),
    CONSTRAINT "venue_import_checkpoints_shape_check" CHECK (jsonb_typeof("checkpoint") = 'object')
);

CREATE FUNCTION reject_completed_venue_import_mutation() RETURNS trigger AS $$
BEGIN
    IF OLD.status <> 'RUNNING' THEN
        RAISE EXCEPTION 'completed venue import runs are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER venue_import_runs_protect_terminal
    BEFORE UPDATE OR DELETE ON venue_import_runs FOR EACH ROW EXECUTE FUNCTION reject_completed_venue_import_mutation();
