CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'QUARANTINED');

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(160) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" UUID NOT NULL,
    "causation_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMPTZ(3),
    "claimed_by" UUID,
    "published_at" TIMESTAMPTZ(3),
    "last_error_code" VARCHAR(96),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "outbox_events_type_check" CHECK ("type" ~ '^[a-z][a-z0-9]*(\.[a-z0-9]+)*\.v[1-9][0-9]*$')
);

CREATE INDEX "outbox_events_dispatch_idx"
    ON "outbox_events" ("status", "available_at", "occurred_at");

CREATE TABLE "audit_entries" (
    "id" UUID NOT NULL,
    "actor_type" VARCHAR(64) NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(160) NOT NULL,
    "target_type" VARCHAR(96) NOT NULL,
    "target_id" UUID,
    "outcome" VARCHAR(48) NOT NULL,
    "reason_code" VARCHAR(96),
    "changed_fields" JSONB NOT NULL,
    "request_id" UUID NOT NULL,
    "correlation_id" UUID NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_entries_changed_fields_object_check" CHECK (jsonb_typeof("changed_fields") = 'object')
);

CREATE INDEX "audit_entries_target_idx"
    ON "audit_entries" ("target_type", "target_id", "created_at");
CREATE INDEX "audit_entries_actor_idx" ON "audit_entries" ("actor_id", "created_at");

CREATE FUNCTION reject_audit_entry_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_entries are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_entries_reject_update"
    BEFORE UPDATE ON "audit_entries"
    FOR EACH ROW EXECUTE FUNCTION reject_audit_entry_mutation();

CREATE TRIGGER "audit_entries_reject_delete"
    BEFORE DELETE ON "audit_entries"
    FOR EACH ROW EXECUTE FUNCTION reject_audit_entry_mutation();
