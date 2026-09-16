CREATE TYPE "privacy_request_kind" AS ENUM ('EXPORT', 'ERASURE');
CREATE TYPE "privacy_request_state" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'FAILED', 'BLOCKED');
CREATE TYPE "data_lifecycle_task_kind" AS ENUM ('EXPORT', 'ERASURE', 'RETENTION', 'RECONCILIATION');
CREATE TYPE "data_lifecycle_task_state" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED');
CREATE TYPE "data_sink_kind" AS ENUM (
    'POSTGRESQL', 'OBJECT_STORAGE', 'REDIS', 'QUEUE', 'SEARCH', 'ANALYTICS', 'OBSERVABILITY', 'PROVIDER', 'BACKUP'
);
CREATE TYPE "storage_object_state" AS ENUM ('REFERENCED', 'DELETE_PENDING', 'DELETED', 'MISSING');
CREATE TYPE "reconciliation_kind" AS ENUM (
    'POSTGRESQL_REDIS', 'POSTGRESQL_OBJECT_STORAGE', 'POSTGRESQL_PROJECTIONS', 'POSTGRESQL_OUTBOX'
);
CREATE TYPE "reconciliation_state" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "reconciliation_finding_kind" AS ENUM (
    'MISSING_DERIVED_RECORD', 'STALE_DERIVED_RECORD', 'MISSING_OBJECT', 'ORPHAN_OBJECT', 'OUTBOX_GAP'
);

CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "privacy_request_kind" NOT NULL,
    "state" "privacy_request_state" NOT NULL DEFAULT 'REQUESTED',
    "policy_version" VARCHAR(128) NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "reauthenticated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "artifact_key_ciphertext" BYTEA,
    "artifact_key_version" INTEGER,
    "artifact_expires_at" TIMESTAMPTZ(3),
    "artifact_consumed_at" TIMESTAMPTZ(3),
    "failure_code" VARCHAR(96),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "privacy_requests_time_check" CHECK (
        "due_at" > "requested_at"
        AND "reauthenticated_at" <= "requested_at"
        AND "reauthenticated_at" >= "requested_at" - INTERVAL '5 minutes'
        AND ("completed_at" IS NULL OR "completed_at" >= "requested_at")
    ),
    CONSTRAINT "privacy_requests_artifact_check" CHECK (
        ("kind" = 'ERASURE' AND "artifact_key_ciphertext" IS NULL AND "artifact_key_version" IS NULL
            AND "artifact_expires_at" IS NULL AND "artifact_consumed_at" IS NULL)
        OR
        ("kind" = 'EXPORT' AND (
            ("artifact_key_ciphertext" IS NULL AND "artifact_key_version" IS NULL
                AND "artifact_expires_at" IS NULL AND "artifact_consumed_at" IS NULL)
            OR
            ("artifact_key_ciphertext" IS NOT NULL AND "artifact_key_version" > 0
                AND "artifact_expires_at" > "requested_at"
                AND ("artifact_consumed_at" IS NULL OR "artifact_consumed_at" <= "artifact_expires_at"))
        ))
    ),
    CONSTRAINT "privacy_requests_failure_code_check" CHECK (
        "failure_code" IS NULL OR "failure_code" ~ '^[A-Z][A-Z0-9_]{2,95}$'
    )
);

CREATE UNIQUE INDEX "privacy_requests_active_kind_key"
    ON "privacy_requests" ("user_id", "kind")
    WHERE "state" IN ('REQUESTED', 'IN_PROGRESS', 'READY', 'BLOCKED');
CREATE INDEX "privacy_requests_due_idx" ON "privacy_requests" ("state", "due_at", "id");
CREATE INDEX "privacy_requests_owner_idx" ON "privacy_requests" ("user_id", "requested_at", "id");
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "data_lifecycle_tasks" (
    "id" UUID NOT NULL,
    "privacy_request_id" UUID,
    "kind" "data_lifecycle_task_kind" NOT NULL,
    "sink" "data_sink_kind" NOT NULL,
    "bucket_code" VARCHAR(64) NOT NULL,
    "state" "data_lifecycle_task_state" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "claimed_at" TIMESTAMPTZ(3),
    "claim_expires_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "last_error_code" VARCHAR(96),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_lifecycle_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_lifecycle_tasks_bucket_check" CHECK ("bucket_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    CONSTRAINT "data_lifecycle_tasks_claim_check" CHECK (
        "attempt" >= 0
        AND (("claimed_at" IS NULL AND "claim_expires_at" IS NULL)
            OR ("claimed_at" IS NOT NULL AND "claim_expires_at" > "claimed_at"))
        AND ("completed_at" IS NULL OR "completed_at" >= "created_at")
        AND ("last_error_code" IS NULL OR "last_error_code" ~ '^[A-Z][A-Z0-9_]{2,95}$')
    ),
    CONSTRAINT "data_lifecycle_tasks_state_check" CHECK (
        ("state" = 'SUCCEEDED' AND "completed_at" IS NOT NULL AND "last_error_code" IS NULL)
        OR ("state" IN ('FAILED', 'BLOCKED') AND "completed_at" IS NULL AND "last_error_code" IS NOT NULL)
        OR ("state" IN ('PENDING', 'RUNNING') AND "completed_at" IS NULL)
    ),
    CONSTRAINT "data_lifecycle_tasks_request_check" CHECK (
        ("kind" IN ('EXPORT', 'ERASURE') AND "privacy_request_id" IS NOT NULL)
        OR ("kind" IN ('RETENTION', 'RECONCILIATION') AND "privacy_request_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "data_lifecycle_tasks_request_sink_key"
    ON "data_lifecycle_tasks" ("privacy_request_id", "sink", "bucket_code");
CREATE UNIQUE INDEX "data_lifecycle_tasks_singleton_key"
    ON "data_lifecycle_tasks" ("kind", "sink", "bucket_code")
    WHERE "privacy_request_id" IS NULL AND "state" IN ('PENDING', 'RUNNING', 'BLOCKED');
CREATE INDEX "data_lifecycle_tasks_dispatch_idx" ON "data_lifecycle_tasks" ("state", "available_at", "id");
ALTER TABLE "data_lifecycle_tasks" ADD CONSTRAINT "data_lifecycle_tasks_privacy_request_id_fkey"
    FOREIGN KEY ("privacy_request_id") REFERENCES "privacy_requests" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "deletion_suppressions" (
    "id" UUID NOT NULL,
    "subject_kind" VARCHAR(64) NOT NULL,
    "subject_key" CHAR(64) NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "backup_purge_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deletion_suppressions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deletion_suppressions_shape_check" CHECK (
        "subject_kind" ~ '^[A-Z][A-Z0-9_]{1,63}$'
        AND "subject_key" ~ '^[a-f0-9]{64}$'
        AND "backup_purge_at" > "effective_at"
    )
);

CREATE UNIQUE INDEX "deletion_suppressions_subject_key"
    ON "deletion_suppressions" ("subject_kind", "subject_key");
CREATE INDEX "deletion_suppressions_backup_idx" ON "deletion_suppressions" ("backup_purge_at");

CREATE TABLE "storage_object_records" (
    "id" UUID NOT NULL,
    "storage_class" VARCHAR(64) NOT NULL,
    "bucket_code" VARCHAR(64) NOT NULL,
    "object_key_hash" CHAR(64) NOT NULL,
    "object_key_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "owner_type" VARCHAR(64) NOT NULL,
    "owner_id" UUID NOT NULL,
    "state" "storage_object_state" NOT NULL DEFAULT 'REFERENCED',
    "retention_expires_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storage_object_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "storage_object_records_shape_check" CHECK (
        "storage_class" ~ '^[A-Z][A-Z0-9_]{1,63}$'
        AND "bucket_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'
        AND "owner_type" ~ '^[A-Z][A-Z0-9_]{1,63}$'
        AND "object_key_hash" ~ '^[a-f0-9]{64}$'
        AND "encryption_key_version" > 0
        AND (("state" = 'DELETED' AND "deleted_at" IS NOT NULL) OR ("state" <> 'DELETED' AND "deleted_at" IS NULL))
    )
);

CREATE UNIQUE INDEX "storage_object_records_object_key"
    ON "storage_object_records" ("storage_class", "bucket_code", "object_key_hash");
CREATE INDEX "storage_object_records_retention_idx"
    ON "storage_object_records" ("state", "retention_expires_at", "id");
CREATE INDEX "storage_object_records_owner_idx" ON "storage_object_records" ("owner_type", "owner_id");

CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL,
    "kind" "reconciliation_kind" NOT NULL,
    "state" "reconciliation_state" NOT NULL DEFAULT 'RUNNING',
    "high_watermark" TIMESTAMPTZ(3) NOT NULL,
    "examined_count" BIGINT NOT NULL DEFAULT 0,
    "finding_count" BIGINT NOT NULL DEFAULT 0,
    "repaired_count" BIGINT NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "last_error_code" VARCHAR(96),
    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reconciliation_runs_shape_check" CHECK (
        "examined_count" >= 0 AND "finding_count" >= 0 AND "repaired_count" >= 0
        AND "repaired_count" <= "finding_count" AND "finding_count" <= "examined_count"
        AND "high_watermark" <= "started_at"
        AND (("state" = 'RUNNING' AND "completed_at" IS NULL) OR ("state" <> 'RUNNING' AND "completed_at" >= "started_at"))
        AND ("last_error_code" IS NULL OR "last_error_code" ~ '^[A-Z][A-Z0-9_]{2,95}$')
    )
);

CREATE INDEX "reconciliation_runs_history_idx" ON "reconciliation_runs" ("kind", "started_at", "id");
CREATE UNIQUE INDEX "reconciliation_runs_active_kind_key" ON "reconciliation_runs" ("kind") WHERE "state" = 'RUNNING';

CREATE TABLE "reconciliation_findings" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "kind" "reconciliation_finding_kind" NOT NULL,
    "reference_hash" CHAR(64) NOT NULL,
    "repair_code" VARCHAR(96),
    "discovered_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "reconciliation_findings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reconciliation_findings_shape_check" CHECK (
        "reference_hash" ~ '^[a-f0-9]{64}$'
        AND ("repair_code" IS NULL OR "repair_code" ~ '^[A-Z][A-Z0-9_]{2,95}$')
        AND ("resolved_at" IS NULL OR "resolved_at" >= "discovered_at")
    )
);

CREATE UNIQUE INDEX "reconciliation_findings_run_reference_key"
    ON "reconciliation_findings" ("run_id", "kind", "reference_hash");
CREATE INDEX "reconciliation_findings_open_idx" ON "reconciliation_findings" ("resolved_at", "discovered_at");
ALTER TABLE "reconciliation_findings" ADD CONSTRAINT "reconciliation_findings_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "reconciliation_runs" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "data_legal_holds" (
    "id" UUID NOT NULL,
    "record_scope" VARCHAR(96) NOT NULL,
    "record_reference_hash" CHAR(64) NOT NULL,
    "reason_code" VARCHAR(96) NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "owner_reference" UUID NOT NULL,
    "review_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_legal_holds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_legal_holds_shape_check" CHECK (
        "record_scope" ~ '^[A-Z][A-Z0-9_]{1,95}$'
        AND "record_reference_hash" ~ '^[a-f0-9]{64}$'
        AND "reason_code" ~ '^[A-Z][A-Z0-9_]{2,95}$'
        AND "review_at" > "created_at" AND "expires_at" >= "review_at"
        AND ("released_at" IS NULL OR "released_at" >= "created_at")
    )
);

CREATE INDEX "data_legal_holds_expiry_idx" ON "data_legal_holds" ("expires_at", "released_at");
CREATE INDEX "data_legal_holds_record_idx" ON "data_legal_holds" ("record_scope", "record_reference_hash");

CREATE FUNCTION "production_readiness_append_only"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'append-only production readiness record';
END;
$$;

CREATE TRIGGER "deletion_suppressions_append_only" BEFORE UPDATE OR DELETE ON "deletion_suppressions"
    FOR EACH ROW EXECUTE FUNCTION "production_readiness_append_only"();

CREATE FUNCTION "privacy_request_transition_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."user_id" <> NEW."user_id" OR OLD."kind" <> NEW."kind" OR OLD."requested_at" <> NEW."requested_at"
       OR OLD."due_at" <> NEW."due_at" OR OLD."reauthenticated_at" <> NEW."reauthenticated_at"
       OR OLD."policy_version" <> NEW."policy_version" THEN
        RAISE EXCEPTION 'privacy request identity is immutable';
    END IF;
    IF OLD."state" IN ('COMPLETED', 'FAILED') AND NEW."state" <> OLD."state" THEN
        RAISE EXCEPTION 'terminal privacy request is immutable';
    END IF;
    IF (OLD."state" = 'REQUESTED' AND NEW."state" NOT IN ('REQUESTED', 'IN_PROGRESS', 'FAILED', 'BLOCKED'))
       OR (OLD."state" = 'IN_PROGRESS' AND NEW."state" NOT IN ('IN_PROGRESS', 'READY', 'COMPLETED', 'FAILED', 'BLOCKED'))
       OR (OLD."state" = 'READY' AND NEW."state" NOT IN ('READY', 'COMPLETED', 'FAILED', 'BLOCKED'))
       OR (OLD."state" = 'BLOCKED' AND NEW."state" NOT IN ('BLOCKED', 'IN_PROGRESS', 'FAILED')) THEN
        RAISE EXCEPTION 'invalid privacy request transition';
    END IF;
    IF NEW."state" = 'READY' AND (NEW."kind" <> 'EXPORT' OR NEW."artifact_key_ciphertext" IS NULL) THEN
        RAISE EXCEPTION 'ready export requires encrypted artifact capability';
    END IF;
    IF NEW."state" = 'COMPLETED' AND NEW."completed_at" IS NULL THEN
        RAISE EXCEPTION 'completed request requires completion time';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "privacy_requests_state_machine" BEFORE UPDATE ON "privacy_requests"
    FOR EACH ROW EXECUTE FUNCTION "privacy_request_transition_guard"();

CREATE FUNCTION "data_lifecycle_task_transition_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."privacy_request_id" IS DISTINCT FROM NEW."privacy_request_id" OR OLD."kind" <> NEW."kind"
       OR OLD."sink" <> NEW."sink" OR OLD."bucket_code" <> NEW."bucket_code" THEN
        RAISE EXCEPTION 'data lifecycle task identity is immutable';
    END IF;
    IF OLD."state" = 'SUCCEEDED' AND NEW."state" <> 'SUCCEEDED' THEN
        RAISE EXCEPTION 'successful data lifecycle task is terminal';
    END IF;
    IF (OLD."state" = 'PENDING' AND NEW."state" NOT IN ('PENDING', 'RUNNING', 'BLOCKED'))
       OR (OLD."state" = 'RUNNING' AND NEW."state" NOT IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED'))
       OR (OLD."state" IN ('FAILED', 'BLOCKED') AND NEW."state" NOT IN (OLD."state", 'PENDING')) THEN
        RAISE EXCEPTION 'invalid data lifecycle task transition';
    END IF;
    IF NEW."attempt" < OLD."attempt" THEN
        RAISE EXCEPTION 'data lifecycle task attempt cannot decrease';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "data_lifecycle_tasks_state_machine" BEFORE UPDATE ON "data_lifecycle_tasks"
    FOR EACH ROW EXECUTE FUNCTION "data_lifecycle_task_transition_guard"();

CREATE FUNCTION "data_lifecycle_task_request_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    request_kind TEXT;
BEGIN
    IF NEW."privacy_request_id" IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT "kind"::TEXT INTO request_kind
    FROM "privacy_requests"
    WHERE "id" = NEW."privacy_request_id";
    IF request_kind IS NULL OR request_kind <> NEW."kind"::TEXT THEN
        RAISE EXCEPTION 'data lifecycle task kind must match privacy request';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "data_lifecycle_tasks_request_guard" BEFORE INSERT OR UPDATE ON "data_lifecycle_tasks"
    FOR EACH ROW EXECUTE FUNCTION "data_lifecycle_task_request_guard"();

CREATE FUNCTION "privacy_request_completion_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" = 'COMPLETED' AND (
        NOT EXISTS (SELECT 1 FROM "data_lifecycle_tasks" WHERE "privacy_request_id" = NEW."id")
        OR EXISTS (
            SELECT 1 FROM "data_lifecycle_tasks"
            WHERE "privacy_request_id" = NEW."id" AND "state" <> 'SUCCEEDED'
        )
    ) THEN
        RAISE EXCEPTION 'completed privacy request requires all sink tasks to succeed';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "privacy_requests_completion_guard"
    AFTER INSERT OR UPDATE ON "privacy_requests" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "privacy_request_completion_guard"();

CREATE FUNCTION "storage_object_transition_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."storage_class" <> NEW."storage_class" OR OLD."bucket_code" <> NEW."bucket_code"
       OR OLD."object_key_hash" <> NEW."object_key_hash" OR OLD."owner_type" <> NEW."owner_type"
       OR OLD."owner_id" <> NEW."owner_id" THEN
        RAISE EXCEPTION 'storage object identity is immutable';
    END IF;
    IF OLD."state" = 'DELETED' AND NEW."state" <> 'DELETED' THEN
        RAISE EXCEPTION 'deleted object cannot be restored by retry';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "storage_object_records_state_machine" BEFORE UPDATE ON "storage_object_records"
    FOR EACH ROW EXECUTE FUNCTION "storage_object_transition_guard"();

CREATE FUNCTION "reconciliation_run_transition_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."kind" <> NEW."kind" OR OLD."high_watermark" <> NEW."high_watermark"
       OR OLD."started_at" <> NEW."started_at" THEN
        RAISE EXCEPTION 'reconciliation run identity is immutable';
    END IF;
    IF OLD."state" <> 'RUNNING' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'terminal reconciliation run is immutable';
    END IF;
    IF NEW."examined_count" < OLD."examined_count" OR NEW."finding_count" < OLD."finding_count"
       OR NEW."repaired_count" < OLD."repaired_count" THEN
        RAISE EXCEPTION 'reconciliation counters cannot decrease';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "reconciliation_runs_state_machine" BEFORE UPDATE ON "reconciliation_runs"
    FOR EACH ROW EXECUTE FUNCTION "reconciliation_run_transition_guard"();

CREATE FUNCTION "reconciliation_finding_transition_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."run_id" <> NEW."run_id" OR OLD."kind" <> NEW."kind"
       OR OLD."reference_hash" <> NEW."reference_hash" OR OLD."discovered_at" <> NEW."discovered_at" THEN
        RAISE EXCEPTION 'reconciliation finding identity is immutable';
    END IF;
    IF OLD."resolved_at" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'resolved reconciliation finding is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "reconciliation_findings_state_machine" BEFORE UPDATE ON "reconciliation_findings"
    FOR EACH ROW EXECUTE FUNCTION "reconciliation_finding_transition_guard"();

CREATE FUNCTION "data_legal_hold_transition_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."record_scope" <> NEW."record_scope" OR OLD."record_reference_hash" <> NEW."record_reference_hash"
       OR OLD."reason_code" <> NEW."reason_code" OR OLD."policy_version" <> NEW."policy_version"
       OR OLD."owner_reference" <> NEW."owner_reference" OR OLD."review_at" <> NEW."review_at"
       OR OLD."expires_at" <> NEW."expires_at" OR OLD."created_at" <> NEW."created_at" THEN
        RAISE EXCEPTION 'data legal hold scope is immutable';
    END IF;
    IF OLD."released_at" IS NOT NULL AND NEW."released_at" IS DISTINCT FROM OLD."released_at" THEN
        RAISE EXCEPTION 'released data legal hold is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "data_legal_holds_state_machine" BEFORE UPDATE ON "data_legal_holds"
    FOR EACH ROW EXECUTE FUNCTION "data_legal_hold_transition_guard"();

COMMENT ON TABLE "privacy_requests" IS
    'Opaque export/erasure control records; export payload and one-time delivery are outside ordinary application access.';
COMMENT ON TABLE "deletion_suppressions" IS
    'Keyed non-reversible markers applied before restored data, delayed jobs or provider retries become visible.';
COMMENT ON TABLE "reconciliation_findings" IS
    'Operational hashes and bounded repair codes only; raw object keys, user IDs and payloads are forbidden.';
