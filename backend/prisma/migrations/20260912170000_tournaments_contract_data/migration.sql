-- Tournament contract/data: one aggregate family and deterministic versioned format strategies.

CREATE TYPE "tournament_format_code" AS ENUM ('AMERICANO', 'ROUND_ROBIN', 'SINGLE_ELIMINATION',
    'DOUBLE_ELIMINATION', 'POOL_PLAY', 'SWISS', 'LADDER', 'KING_OF_COURT', 'CUSTOM_DSL');
CREATE TYPE "tournament_state" AS ENUM
    ('DRAFT', 'PUBLISHED', 'CHECK_IN', 'SEEDED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "tournament_registration_gate" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "tournament_play_mode" AS ENUM ('INDIVIDUAL_DOUBLES', 'SINGLES', 'FIXED_TEAM_DOUBLES');
CREATE TYPE "tournament_entrant_state" AS ENUM ('ELIGIBLE', 'WAITLISTED', 'WITHDRAWN', 'REPLACED', 'NO_SHOW');
CREATE TYPE "tournament_member_state" AS ENUM
    ('PENDING_CONFIRMATION', 'CONFIRMED', 'WITHDRAWN', 'REPLACED', 'NO_SHOW');
CREATE TYPE "tournament_stage_kind" AS ENUM
    ('LEAGUE', 'POOL', 'WINNERS', 'LOSERS', 'PLAYOFF', 'FINAL', 'BRONZE', 'LADDER', 'COURT');
CREATE TYPE "tournament_round_state" AS ENUM ('PLANNED', 'READY', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "tournament_match_state" AS ENUM
    ('PLANNED', 'READY', 'IN_PROGRESS', 'COMPLETED', 'BYE', 'WALKOVER', 'DOUBLE_WALKOVER', 'VOID');
CREATE TYPE "tournament_slot_source_outcome" AS ENUM ('WINNER', 'LOSER');
CREATE TYPE "tournament_payment_state" AS ENUM
    ('NOT_REQUIRED', 'PENDING_EXTERNAL', 'MARKED_PAID', 'WAIVED', 'REFUND_REPORTED');
CREATE TYPE "tournament_partner_intent_state" AS ENUM ('PENDING', 'PAIRED', 'WAITLISTED', 'WITHDRAWN', 'EXPIRED');
CREATE TYPE "tournament_scoped_role" AS ENUM ('ORGANIZER', 'CO_ORGANIZER', 'SCOREKEEPER');

CREATE TABLE "format_definitions" (
    "id" UUID PRIMARY KEY,
    "format_code" "tournament_format_code" NOT NULL,
    "strategy_version" VARCHAR(24) NOT NULL,
    "schema_version" VARCHAR(24) NOT NULL,
    "schema_id" VARCHAR(200) NOT NULL,
    "schema" JSONB NOT NULL,
    "schema_hash" CHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "format_definitions_versions_check" CHECK (
        "strategy_version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'
        AND "schema_version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'
        AND "schema_hash" ~ '^[a-f0-9]{64}$'
        AND ("format_code" <> 'CUSTOM_DSL' OR "active" = FALSE)
    ),
    CONSTRAINT "format_definitions_preset_schema_check" CHECK (
        length("schema_id") BETWEEN 1 AND 200 AND jsonb_typeof("schema") = 'object'
        AND "schema"->>'$id' = "schema_id"
    ),
    UNIQUE ("format_code", "strategy_version", "schema_version")
);

CREATE TABLE "tournaments" (
    "id" UUID PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "projection_revision" BIGINT NOT NULL DEFAULT 0,
    "projection_checksum" CHAR(64),
    "state" "tournament_state" NOT NULL DEFAULT 'DRAFT',
    "registration_gate" "tournament_registration_gate" NOT NULL DEFAULT 'CLOSED',
    "organizer_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "club_id" UUID REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "venue_id" UUID NOT NULL REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "format_definition_id" UUID NOT NULL REFERENCES "format_definitions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "format_snapshot" JSONB NOT NULL,
    "format_snapshot_hash" CHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "registration_opens_at" TIMESTAMPTZ(3) NOT NULL,
    "registration_closes_at" TIMESTAMPTZ(3) NOT NULL,
    "check_in_closes_at" TIMESTAMPTZ(3),
    "capacity" SMALLINT NOT NULL,
    "price_minor" BIGINT,
    "currency" CHAR(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    CONSTRAINT "tournaments_fields_check" CHECK (
        "version" >= 0 AND "projection_revision" >= 0
        AND ("projection_checksum" IS NULL OR "projection_checksum" ~ '^[a-f0-9]{64}$')
        AND "format_snapshot_hash" ~ '^[a-f0-9]{64}$'
        AND length(btrim("name")) BETWEEN 1 AND 120 AND length("description") <= 2000
        AND "registration_opens_at" < "registration_closes_at"
        AND "registration_closes_at" <= "starts_at"
        AND ("check_in_closes_at" IS NULL OR
            ("check_in_closes_at" >= "registration_closes_at" AND "check_in_closes_at" <= "starts_at"))
        AND "capacity" BETWEEN 2 AND 128
        AND ("price_minor" IS NULL OR "price_minor" >= 0)
        AND (("price_minor" IS NULL AND "currency" IS NULL) OR
            ("price_minor" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$'))
    ),
    CONSTRAINT "tournaments_terminal_shape_check" CHECK (
        ("state" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL)
        OR ("state" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "completed_at" IS NULL)
        OR ("state" NOT IN ('COMPLETED', 'CANCELLED') AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
    )
);
CREATE INDEX "tournaments_public_search_idx" ON "tournaments"("state", "starts_at", "id");
CREATE INDEX "tournaments_organizer_idx" ON "tournaments"("organizer_id", "state", "updated_at");
CREATE INDEX "tournaments_club_idx" ON "tournaments"("club_id", "state", "starts_at");

CREATE TABLE "tournament_entrants" (
    "id" UUID PRIMARY KEY,
    "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "tournament_entrant_state" NOT NULL DEFAULT 'ELIGIBLE',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "kind" VARCHAR(16) NOT NULL,
    "captain_user_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "fifo_sequence" BIGINT,
    "seed" SMALLINT,
    "tie_break_lot" BIGINT,
    "check_in_state" VARCHAR(24) NOT NULL,
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminal_at" TIMESTAMPTZ(3),
    CONSTRAINT "tournament_entrants_shape_check" CHECK (
        "revision" >= 0 AND "kind" IN ('INDIVIDUAL', 'TEAM')
        AND ("fifo_sequence" IS NULL OR "fifo_sequence" > 0)
        AND (("seed" IS NULL AND "tie_break_lot" IS NULL) OR ("seed" > 0 AND "tie_break_lot" IS NOT NULL))
        AND "check_in_state" IN ('NOT_REQUIRED', 'PENDING', 'ARRIVED', 'WITHDRAWN', 'NO_SHOW')
        AND (("state" IN ('ELIGIBLE', 'WAITLISTED') AND "terminal_at" IS NULL)
            OR ("state" NOT IN ('ELIGIBLE', 'WAITLISTED') AND "terminal_at" IS NOT NULL))
    )
);
CREATE UNIQUE INDEX "tournament_entrants_fifo_key"
    ON "tournament_entrants"("tournament_id", "fifo_sequence") WHERE "fifo_sequence" IS NOT NULL;
CREATE UNIQUE INDEX "tournament_entrants_seed_key"
    ON "tournament_entrants"("tournament_id", "seed") WHERE "seed" IS NOT NULL;
CREATE UNIQUE INDEX "tournament_entrants_lot_key"
    ON "tournament_entrants"("tournament_id", "tie_break_lot") WHERE "tie_break_lot" IS NOT NULL;
CREATE INDEX "entrants_roster_idx" ON "tournament_entrants"("tournament_id", "state", "registered_at", "id");
CREATE INDEX "entrants_fifo_idx" ON "tournament_entrants"("tournament_id", "state", "fifo_sequence");

CREATE TABLE "tournament_entrant_members" (
    "id" UUID PRIMARY KEY,
    "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "entrant_id" UUID NOT NULL REFERENCES "tournament_entrants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "tournament_member_state" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(3),
    "terminal_at" TIMESTAMPTZ(3),
    CONSTRAINT "tournament_entrant_members_shape_check" CHECK (
        "revision" >= 0
        AND (("state" IN ('PENDING_CONFIRMATION', 'CONFIRMED') AND "terminal_at" IS NULL)
            OR ("state" NOT IN ('PENDING_CONFIRMATION', 'CONFIRMED') AND "terminal_at" IS NOT NULL))
        AND ("state" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL)
    )
);
CREATE UNIQUE INDEX "tournament_entrant_members_active_user_key"
    ON "tournament_entrant_members"("tournament_id", "user_id")
    WHERE "state" IN ('PENDING_CONFIRMATION', 'CONFIRMED');
CREATE UNIQUE INDEX "tournament_entrant_members_entry_user_key"
    ON "tournament_entrant_members"("entrant_id", "user_id");
CREATE INDEX "entrant_members_entry_idx" ON "tournament_entrant_members"("entrant_id", "state");

CREATE TABLE "tournament_partner_intents" (
    "id" UUID PRIMARY KEY,
    "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" "tournament_partner_intent_state" NOT NULL DEFAULT 'PENDING',
    "matching_opt_in" BOOLEAN NOT NULL DEFAULT TRUE,
    "fifo_sequence" BIGINT NOT NULL,
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminal_at" TIMESTAMPTZ(3),
    CONSTRAINT "tournament_partner_intents_shape_check" CHECK (
        "revision" >= 0 AND "matching_opt_in" = TRUE AND "fifo_sequence" > 0
        AND (("state" IN ('PENDING', 'WAITLISTED') AND "terminal_at" IS NULL)
            OR ("state" NOT IN ('PENDING', 'WAITLISTED') AND "terminal_at" IS NOT NULL))
    ),
    UNIQUE ("tournament_id", "fifo_sequence")
);
CREATE UNIQUE INDEX "tournament_partner_intents_active_user_key"
    ON "tournament_partner_intents"("tournament_id", "user_id") WHERE "state" IN ('PENDING', 'WAITLISTED');
CREATE INDEX "tournament_partner_intents_queue_idx"
    ON "tournament_partner_intents"("tournament_id", "state", "fifo_sequence");

CREATE TABLE "tournament_roles" (
    "id" UUID PRIMARY KEY,
    "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "role" "tournament_scoped_role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    CONSTRAINT "tournament_roles_shape_check" CHECK (
        "revision" >= 0 AND (("active" AND "ended_at" IS NULL) OR
            (NOT "active" AND "ended_at" >= "assigned_at"))
    )
);
CREATE UNIQUE INDEX "tournament_roles_active_user_key"
    ON "tournament_roles"("tournament_id", "user_id") WHERE "active";
CREATE UNIQUE INDEX "tournament_roles_active_organizer_key"
    ON "tournament_roles"("tournament_id") WHERE "active" AND "role" = 'ORGANIZER';
CREATE INDEX "tournament_roles_access_idx" ON "tournament_roles"("tournament_id", "active", "role", "user_id");

CREATE TABLE "tournament_stages" (
    "id" UUID PRIMARY KEY,
    "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "sequence" SMALLINT NOT NULL,
    "kind" "tournament_stage_kind" NOT NULL,
    "strategy_key" VARCHAR(80) NOT NULL,
    CONSTRAINT "tournament_stages_sequence_check" CHECK ("sequence" > 0),
    UNIQUE ("tournament_id", "sequence"), UNIQUE ("tournament_id", "strategy_key")
);

CREATE TABLE "tournament_rounds" (
    "id" UUID PRIMARY KEY,
    "stage_id" UUID NOT NULL REFERENCES "tournament_stages"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "sequence" SMALLINT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" "tournament_round_state" NOT NULL DEFAULT 'PLANNED',
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "tournament_rounds_shape_check" CHECK (
        "sequence" > 0 AND "generation" > 0 AND "revision" >= 0
        AND ("started_at" IS NULL OR "state" IN ('IN_PROGRESS', 'COMPLETED'))
        AND ("completed_at" IS NULL OR "state" = 'COMPLETED')
    ),
    UNIQUE ("stage_id", "sequence", "generation")
);
CREATE INDEX "tournament_rounds_stage_idx" ON "tournament_rounds"("stage_id", "state", "sequence");

CREATE TABLE "tournament_matches" (
    "id" UUID PRIMARY KEY,
    "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "stage_id" UUID NOT NULL REFERENCES "tournament_stages"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "round_id" UUID NOT NULL REFERENCES "tournament_rounds"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "strategy_key" VARCHAR(120) NOT NULL,
    "sequence" SMALLINT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "result_revision" INTEGER NOT NULL DEFAULT 0,
    "state" "tournament_match_state" NOT NULL DEFAULT 'PLANNED',
    "winner_entrant_id" UUID REFERENCES "tournament_entrants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "authoritative_result_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "terminal_at" TIMESTAMPTZ(3),
    CONSTRAINT "tournament_matches_shape_check" CHECK (
        "sequence" > 0 AND "revision" >= 0 AND "result_revision" >= 0
        AND ("started_at" IS NULL OR "state" IN ('IN_PROGRESS', 'COMPLETED', 'WALKOVER', 'DOUBLE_WALKOVER'))
        AND (("state" IN ('COMPLETED', 'BYE', 'WALKOVER', 'DOUBLE_WALKOVER', 'VOID') AND "terminal_at" IS NOT NULL)
            OR ("state" IN ('PLANNED', 'READY', 'IN_PROGRESS') AND "terminal_at" IS NULL))
        AND ("state" <> 'DOUBLE_WALKOVER' OR "winner_entrant_id" IS NULL)
    ),
    UNIQUE ("tournament_id", "strategy_key"), UNIQUE ("round_id", "sequence")
);
CREATE INDEX "tournament_matches_execution_idx" ON "tournament_matches"("tournament_id", "state", "round_id");

CREATE TABLE "tournament_match_slots" (
    "tournament_match_id" UUID NOT NULL REFERENCES "tournament_matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "position" SMALLINT NOT NULL,
    "entrant_id" UUID REFERENCES "tournament_entrants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "source_match_id" UUID REFERENCES "tournament_matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "source_outcome" "tournament_slot_source_outcome",
    PRIMARY KEY ("tournament_match_id", "position"),
    CONSTRAINT "tournament_match_slots_source_shape_check" CHECK (
        "position" IN (1, 2)
        AND (("entrant_id" IS NOT NULL AND "source_match_id" IS NULL AND "source_outcome" IS NULL)
            OR ("entrant_id" IS NULL AND "source_match_id" IS NOT NULL AND "source_outcome" IS NOT NULL)
            OR ("entrant_id" IS NULL AND "source_match_id" IS NULL AND "source_outcome" IS NULL))
        AND "source_match_id" IS DISTINCT FROM "tournament_match_id"
    )
);
CREATE UNIQUE INDEX "tournament_match_slots_source_target_key"
    ON "tournament_match_slots"("source_match_id", "source_outcome") WHERE "source_match_id" IS NOT NULL;
CREATE INDEX "tournament_match_slots_entrant_idx" ON "tournament_match_slots"("entrant_id", "tournament_match_id");

CREATE TABLE "tournament_court_assignments" (
    "id" UUID PRIMARY KEY,
    "tournament_match_id" UUID NOT NULL REFERENCES "tournament_matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "court_rank" SMALLINT NOT NULL,
    "batch" SMALLINT NOT NULL,
    "starts_at" TIMESTAMPTZ(3),
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),
    CONSTRAINT "tournament_court_assignments_shape_check" CHECK
        ("revision" >= 0 AND "court_rank" > 0 AND "batch" > 0 AND
            ("released_at" IS NULL OR "released_at" >= "assigned_at"))
);
CREATE UNIQUE INDEX "tournament_court_assignments_active_match_key"
    ON "tournament_court_assignments"("tournament_match_id") WHERE "released_at" IS NULL;
CREATE INDEX "court_assignments_schedule_idx" ON "tournament_court_assignments"("court_rank", "starts_at");

CREATE TABLE "tournament_match_results" (
    "id" UUID PRIMARY KEY,
    "tournament_match_id" UUID NOT NULL REFERENCES "tournament_matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL,
    "outcome" VARCHAR(24) NOT NULL,
    "winner_entrant_id" UUID REFERENCES "tournament_entrants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "score" JSONB NOT NULL,
    "supersedes_id" UUID REFERENCES "tournament_match_results"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "reason_code" VARCHAR(96),
    "recorded_by_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_match_results_shape_check" CHECK (
        "revision" > 0 AND "outcome" IN ('PLAYED', 'BYE', 'WALKOVER', 'DOUBLE_WALKOVER')
        AND ("reason_code" IS NULL OR "reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$')
        AND (("outcome" = 'DOUBLE_WALKOVER' AND "winner_entrant_id" IS NULL)
            OR ("outcome" <> 'DOUBLE_WALKOVER' AND "winner_entrant_id" IS NOT NULL))
        AND (("revision" = 1 AND "supersedes_id" IS NULL) OR ("revision" > 1 AND "supersedes_id" IS NOT NULL))
    ),
    UNIQUE ("tournament_match_id", "revision")
);
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_authoritative_result_fk"
    FOREIGN KEY ("authoritative_result_id") REFERENCES "tournament_match_results"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE "tournament_standings" (
    "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "stage_id" UUID REFERENCES "tournament_stages"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "entrant_id" UUID NOT NULL REFERENCES "tournament_entrants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL,
    "rank" SMALLINT NOT NULL,
    "match_points" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "game_differential" INTEGER NOT NULL,
    "point_differential" INTEGER NOT NULL,
    "points_scored" INTEGER NOT NULL,
    "tie_break_lot" BIGINT NOT NULL,
    "detail" JSONB NOT NULL,
    PRIMARY KEY ("tournament_id", "entrant_id", "revision"),
    CONSTRAINT "tournament_standings_values_check" CHECK
        ("revision" >= 0 AND "rank" > 0 AND "match_points" >= 0 AND "wins" >= 0 AND "points_scored" >= 0),
    UNIQUE ("tournament_id", "revision", "rank")
);
CREATE INDEX "tournament_standings_projection_idx" ON "tournament_standings"("tournament_id", "revision", "rank");

CREATE TABLE "tournament_payment_marks" (
    "id" UUID PRIMARY KEY,
    "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "entrant_id" UUID NOT NULL REFERENCES "tournament_entrants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL,
    "state" "tournament_payment_state" NOT NULL,
    "reason_code" VARCHAR(96) NOT NULL,
    "marked_by_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_payment_marks_shape_check" CHECK
        ("revision" > 0 AND "reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    UNIQUE ("entrant_id", "revision")
);
CREATE INDEX "tournament_payment_marks_entry_idx" ON "tournament_payment_marks"("tournament_id", "entrant_id", "marked_at");

CREATE TABLE "tournament_operation_receipts" (
    "id" UUID PRIMARY KEY, "tournament_id" UUID, "actor_user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL, "method" VARCHAR(8) NOT NULL, "canonical_path" VARCHAR(200) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL, "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL, "encryption_key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT "tournament_operation_receipts_shape_check" CHECK
        ("request_fingerprint" ~ '^[a-f0-9]{64}$' AND "encryption_key_version" > 0
            AND "expires_at" = "created_at" + INTERVAL '24 hours'),
    UNIQUE ("actor_user_id", "method", "canonical_path", "idempotency_key")
);
CREATE INDEX "tournament_operation_receipts_expiry_idx" ON "tournament_operation_receipts"("expires_at");

CREATE TABLE "tournament_audits" (
    "id" UUID PRIMARY KEY, "tournament_id" UUID NOT NULL REFERENCES "tournaments"("id") ON DELETE RESTRICT,
    "operation_id" UUID NOT NULL UNIQUE, "actor_id" UUID NOT NULL, "target_id" UUID,
    "action" VARCHAR(96) NOT NULL, "outcome" VARCHAR(32) NOT NULL, "reason_code" VARCHAR(96),
    "from_revision" INTEGER, "to_revision" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_audits_shape_check" CHECK
        ("reason_code" IS NULL OR "reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$')
);
CREATE INDEX "tournament_audits_tournament_idx" ON "tournament_audits"("tournament_id", "created_at", "id");

CREATE TABLE "tournament_completion_markers" (
    "tournament_id" UUID PRIMARY KEY REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "projection_revision" BIGINT NOT NULL, "projection_checksum" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_completion_markers_shape_check" CHECK
        ("projection_revision" > 0 AND "projection_checksum" ~ '^[a-f0-9]{64}$')
);

-- Composite ownership keys prevent a child graph from crossing tournament or stage boundaries.
ALTER TABLE "tournament_entrants" ADD CONSTRAINT "tournament_entrants_id_scope_key"
    UNIQUE ("id", "tournament_id");
ALTER TABLE "tournament_entrant_members" ADD CONSTRAINT "tournament_entrant_members_entry_scope_fk"
    FOREIGN KEY ("entrant_id", "tournament_id") REFERENCES "tournament_entrants"("id", "tournament_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "tournament_stages" ADD CONSTRAINT "tournament_stages_id_scope_key"
    UNIQUE ("id", "tournament_id");
ALTER TABLE "tournament_rounds" ADD CONSTRAINT "tournament_rounds_id_stage_key"
    UNIQUE ("id", "stage_id");
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_stage_scope_fk"
    FOREIGN KEY ("stage_id", "tournament_id") REFERENCES "tournament_stages"("id", "tournament_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_round_stage_fk"
    FOREIGN KEY ("round_id", "stage_id") REFERENCES "tournament_rounds"("id", "stage_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_scope_fk"
    FOREIGN KEY ("winner_entrant_id", "tournament_id") REFERENCES "tournament_entrants"("id", "tournament_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "tournament_standings" ADD CONSTRAINT "tournament_standings_entrant_scope_fk"
    FOREIGN KEY ("entrant_id", "tournament_id") REFERENCES "tournament_entrants"("id", "tournament_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "tournament_standings" ADD CONSTRAINT "tournament_standings_stage_scope_fk"
    FOREIGN KEY ("stage_id", "tournament_id") REFERENCES "tournament_stages"("id", "tournament_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "tournament_payment_marks" ADD CONSTRAINT "tournament_payment_marks_entrant_scope_fk"
    FOREIGN KEY ("entrant_id", "tournament_id") REFERENCES "tournament_entrants"("id", "tournament_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "reject_format_definition_mutation"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'format definitions are immutable; create a new semantic version'; END; $$;
CREATE TRIGGER "format_definitions_immutable" BEFORE UPDATE OR DELETE ON "format_definitions"
    FOR EACH ROW EXECUTE FUNCTION "reject_format_definition_mutation"();

CREATE FUNCTION "guard_tournament_snapshot"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" <> 'DRAFT' AND (NEW."format_definition_id", NEW."format_snapshot", NEW."format_snapshot_hash",
        NEW."capacity", NEW."venue_id") IS DISTINCT FROM
        (OLD."format_definition_id", OLD."format_snapshot", OLD."format_snapshot_hash", OLD."capacity", OLD."venue_id")
    THEN RAISE EXCEPTION 'published tournament format snapshot is immutable'; END IF;
    IF NEW."state" IN ('SEEDED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED') AND NEW."projection_checksum" IS NULL
    THEN RAISE EXCEPTION 'seeded tournament requires deterministic projection checksum'; END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "tournaments_snapshot_immutable" BEFORE UPDATE ON "tournaments"
    FOR EACH ROW EXECUTE FUNCTION "guard_tournament_snapshot"();

CREATE FUNCTION "guard_tournament_format_activation"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE definition "format_definitions"%ROWTYPE; configuration JSONB; snapshot_play_mode TEXT;
    format_max INTEGER; configured_rounds INTEGER;
    pool_count INTEGER; qualifiers INTEGER; wildcards INTEGER; playoff_size INTEGER; smallest_pool INTEGER;
BEGIN
    SELECT * INTO definition FROM "format_definitions" WHERE "id" = NEW."format_definition_id";
    IF definition."format_code" = 'CUSTOM_DSL' OR definition."active" = FALSE
    THEN RAISE EXCEPTION 'CUSTOM_DSL activation is disabled until the final DSL prompt'; END IF;
    configuration := NEW."format_snapshot"->'configuration';
    snapshot_play_mode := NEW."format_snapshot"->>'playMode';
    IF NEW."format_snapshot"->>'formatCode' IS DISTINCT FROM definition."format_code"::TEXT
        OR NEW."format_snapshot"->>'strategyVersion' IS DISTINCT FROM definition."strategy_version"
        OR configuration->>'schemaVersion' IS DISTINCT FROM definition."schema_version"
        OR configuration->>'formatCode' IS DISTINCT FROM definition."format_code"::TEXT
    THEN RAISE EXCEPTION 'tournament snapshot does not match registered format definition'; END IF;
    IF (definition."format_code" = 'AMERICANO' AND snapshot_play_mode <> 'INDIVIDUAL_DOUBLES')
        OR (definition."format_code" <> 'AMERICANO' AND snapshot_play_mode NOT IN ('SINGLES', 'FIXED_TEAM_DOUBLES'))
    THEN RAISE EXCEPTION 'tournament play mode is not allowed by format'; END IF;
    IF configuration ?& ARRAY['schemaVersion', 'formatCode', 'courtCount'] = FALSE
        OR jsonb_typeof(configuration->'courtCount') <> 'number'
        OR (configuration->>'courtCount')::INTEGER NOT BETWEEN 1 AND 64
    THEN RAISE EXCEPTION 'tournament preset configuration does not satisfy registered schema'; END IF;
    IF NOT CASE definition."format_code"
        WHEN 'AMERICANO' THEN (configuration->>'rounds')::INTEGER BETWEEN 3 AND 63
        WHEN 'ROUND_ROBIN' THEN (configuration->>'legs')::INTEGER BETWEEN 1 AND 2
        WHEN 'SINGLE_ELIMINATION' THEN jsonb_typeof(configuration->'bronzeMatch') = 'boolean'
        WHEN 'DOUBLE_ELIMINATION' THEN configuration->'grandFinalReset' = 'true'::JSONB
        WHEN 'POOL_PLAY' THEN configuration ?&
            ARRAY['poolCount', 'qualifiersPerPool', 'wildcardCount', 'playoffSize']
        WHEN 'SWISS' THEN (configuration->>'rounds')::INTEGER BETWEEN 3 AND 9
        WHEN 'LADDER' THEN (configuration->>'rounds')::INTEGER BETWEEN 3 AND 20
            AND (configuration->>'challengeSpan')::INTEGER BETWEEN 1 AND 5
        WHEN 'KING_OF_COURT' THEN (configuration->>'rounds')::INTEGER BETWEEN 1 AND 20
        ELSE FALSE
    END THEN RAISE EXCEPTION 'tournament format-specific configuration is invalid'; END IF;
    IF NEW."capacity" < CASE definition."format_code"
        WHEN 'AMERICANO' THEN 4 WHEN 'ROUND_ROBIN' THEN 3 WHEN 'SINGLE_ELIMINATION' THEN 2
        WHEN 'DOUBLE_ELIMINATION' THEN 4 WHEN 'POOL_PLAY' THEN 6 ELSE 4 END
    THEN RAISE EXCEPTION 'capacity is below format minimum'; END IF;
    format_max := CASE definition."format_code"
        WHEN 'SINGLE_ELIMINATION' THEN 128 WHEN 'SWISS' THEN 128 ELSE 64 END;
    IF NEW."capacity" > format_max THEN RAISE EXCEPTION 'capacity is above format maximum'; END IF;
    IF definition."format_code" = 'AMERICANO' AND NEW."capacity" % 4 <> 0
    THEN RAISE EXCEPTION 'AMERICANO capacity must be divisible by four'; END IF;
    configured_rounds := NULLIF(configuration->>'rounds', '')::INTEGER;
    IF definition."format_code" IN ('AMERICANO', 'SWISS') AND configured_rounds > NEW."capacity" - 1
    THEN RAISE EXCEPTION 'configured rounds exceed entrant opponent bound'; END IF;
    IF definition."format_code" = 'DOUBLE_ELIMINATION' AND (NEW."capacity" & (NEW."capacity" - 1)) <> 0
    THEN RAISE EXCEPTION 'DOUBLE_ELIMINATION capacity must be a power of two'; END IF;
    IF definition."format_code" = 'KING_OF_COURT' AND NEW."capacity" % 2 <> 0
    THEN RAISE EXCEPTION 'KING_OF_COURT capacity must be even'; END IF;
    IF definition."format_code" = 'KING_OF_COURT'
        AND (configuration->>'courtCount')::INTEGER <> NEW."capacity" / 2
    THEN RAISE EXCEPTION 'KING_OF_COURT requires exactly one ranked court per two entrants'; END IF;
    IF definition."format_code" = 'POOL_PLAY' THEN
        pool_count := (configuration->>'poolCount')::INTEGER;
        qualifiers := (configuration->>'qualifiersPerPool')::INTEGER;
        wildcards := (configuration->>'wildcardCount')::INTEGER;
        playoff_size := (configuration->>'playoffSize')::INTEGER;
        smallest_pool := NEW."capacity" / pool_count;
        IF smallest_pool < 3 OR CEIL(NEW."capacity"::NUMERIC / pool_count) > 6
            OR qualifiers > smallest_pool OR playoff_size NOT IN (2, 4, 8, 16, 32)
            OR qualifiers * pool_count + wildcards <> playoff_size
            OR wildcards > NEW."capacity" - qualifiers * pool_count
        THEN RAISE EXCEPTION 'POOL_PLAY pool and playoff parameters are inconsistent'; END IF;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "tournaments_format_activation_guard" BEFORE INSERT OR UPDATE OF "format_definition_id", "capacity", "format_snapshot"
    ON "tournaments" FOR EACH ROW EXECUTE FUNCTION "guard_tournament_format_activation"();

CREATE FUNCTION "guard_exact_tournament_organizer"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE checked_tournament_id UUID; root_organizer_id UUID; organizer_count INTEGER; role_organizer_id UUID;
BEGIN
    checked_tournament_id := CASE WHEN TG_TABLE_NAME = 'tournaments' THEN
        CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END
    ELSE CASE WHEN TG_OP = 'DELETE' THEN OLD."tournament_id" ELSE NEW."tournament_id" END END;
    SELECT "organizer_id" INTO root_organizer_id FROM "tournaments" WHERE "id" = checked_tournament_id;
    IF root_organizer_id IS NULL THEN RETURN NULL; END IF;
    SELECT count(*) INTO organizer_count FROM "tournament_roles"
        WHERE "tournament_id" = checked_tournament_id AND "active" AND "role" = 'ORGANIZER';
    SELECT "user_id" INTO role_organizer_id FROM "tournament_roles"
        WHERE "tournament_id" = checked_tournament_id AND "active" AND "role" = 'ORGANIZER' LIMIT 1;
    IF organizer_count <> 1 OR role_organizer_id IS DISTINCT FROM root_organizer_id
    THEN RAISE EXCEPTION 'tournament requires exactly one active organizer matching aggregate owner'; END IF;
    RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "tournaments_exact_organizer_guard" AFTER INSERT OR UPDATE OF "organizer_id" ON "tournaments"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "guard_exact_tournament_organizer"();
CREATE CONSTRAINT TRIGGER "tournament_roles_exact_organizer_guard" AFTER INSERT OR UPDATE OR DELETE ON "tournament_roles"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "guard_exact_tournament_organizer"();

CREATE FUNCTION "guard_tournament_active_involvement"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE checked_tournament_id UUID; checked_user_id UUID; active_count INTEGER;
BEGIN
    checked_tournament_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."tournament_id" ELSE NEW."tournament_id" END;
    checked_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."user_id" ELSE NEW."user_id" END;
    SELECT
        (SELECT count(*) FROM "tournament_entrant_members" WHERE "tournament_id" = checked_tournament_id
            AND "user_id" = checked_user_id AND "state" IN ('PENDING_CONFIRMATION', 'CONFIRMED'))
        + (SELECT count(*) FROM "tournament_partner_intents" WHERE "tournament_id" = checked_tournament_id
            AND "user_id" = checked_user_id AND "state" IN ('PENDING', 'WAITLISTED'))
        INTO active_count;
    IF active_count > 1 THEN
        RAISE EXCEPTION 'user cannot have both active entrant membership and partner intent in one tournament';
    END IF;
    RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "tournament_member_active_involvement_guard"
    AFTER INSERT OR UPDATE OR DELETE ON "tournament_entrant_members" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "guard_tournament_active_involvement"();
CREATE CONSTRAINT TRIGGER "tournament_partner_active_involvement_guard"
    AFTER INSERT OR UPDATE OR DELETE ON "tournament_partner_intents" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "guard_tournament_active_involvement"();

CREATE FUNCTION "guard_entrant_shape"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE member_count INTEGER; entrant_kind VARCHAR(16); seeded BOOLEAN; checked_entrant_id UUID; checked_tournament_id UUID;
BEGIN
    checked_entrant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."entrant_id" ELSE NEW."entrant_id" END;
    checked_tournament_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."tournament_id" ELSE NEW."tournament_id" END;
    SELECT count(*) INTO member_count FROM "tournament_entrant_members"
        WHERE "entrant_id" = checked_entrant_id AND "state" = 'CONFIRMED';
    SELECT "kind" INTO entrant_kind FROM "tournament_entrants" WHERE "id" = checked_entrant_id;
    IF entrant_kind = 'INDIVIDUAL' AND member_count <> 1 THEN
        RAISE EXCEPTION 'individual entrant requires exactly one confirmed member';
    ELSIF entrant_kind = 'TEAM' AND member_count <> 2 THEN
        RAISE EXCEPTION 'team entrant requires exactly two distinct confirmed members';
    END IF;
    SELECT "state" IN ('SEEDED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED') INTO seeded
        FROM "tournaments" WHERE "id" = checked_tournament_id;
    IF seeded AND TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'seeded entrant roster is immutable'; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER "tournament_entrant_member_shape_guard"
    AFTER INSERT OR UPDATE OR DELETE ON "tournament_entrant_members" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "guard_entrant_shape"();

CREATE FUNCTION "guard_tournament_result"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE result_match UUID; result_revision INTEGER; dependent_started BOOLEAN;
BEGIN
    IF NEW."authoritative_result_id" IS NOT NULL THEN
        SELECT "tournament_match_id", "revision" INTO result_match, result_revision
            FROM "tournament_match_results" WHERE "id" = NEW."authoritative_result_id";
        IF result_match IS DISTINCT FROM NEW."id" OR result_revision IS DISTINCT FROM NEW."result_revision"
        THEN RAISE EXCEPTION 'authoritative result and match revision must be reciprocal'; END IF;
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM "tournament_match_slots" slot JOIN "tournament_matches" dependency
            ON dependency."id" = slot."tournament_match_id"
        WHERE slot."source_match_id" = NEW."id" AND dependency."started_at" IS NOT NULL
    ) INTO dependent_started;
    IF dependent_started AND NEW."winner_entrant_id" IS DISTINCT FROM OLD."winner_entrant_id"
    THEN RAISE EXCEPTION 'winner-changing correction cannot rewrite a started dependency'; END IF;
    RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER "tournament_match_result_reciprocal_guard" AFTER INSERT OR UPDATE ON "tournament_matches"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "guard_tournament_result"();

CREATE FUNCTION "guard_tournament_graph_scope"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE owner_tournament_id UUID; referenced_tournament_id UUID;
BEGIN
    SELECT "tournament_id" INTO owner_tournament_id FROM "tournament_matches"
        WHERE "id" = NEW."tournament_match_id";
    IF TG_TABLE_NAME = 'tournament_match_slots' THEN
        IF NEW."entrant_id" IS NOT NULL THEN
            SELECT "tournament_id" INTO referenced_tournament_id FROM "tournament_entrants" WHERE "id" = NEW."entrant_id";
        ELSIF NEW."source_match_id" IS NOT NULL THEN
            SELECT "tournament_id" INTO referenced_tournament_id FROM "tournament_matches" WHERE "id" = NEW."source_match_id";
        ELSE referenced_tournament_id := owner_tournament_id;
        END IF;
    ELSE
        IF NEW."winner_entrant_id" IS NULL THEN referenced_tournament_id := owner_tournament_id;
        ELSE SELECT "tournament_id" INTO referenced_tournament_id FROM "tournament_entrants"
            WHERE "id" = NEW."winner_entrant_id"; END IF;
    END IF;
    IF referenced_tournament_id IS DISTINCT FROM owner_tournament_id
    THEN RAISE EXCEPTION 'tournament graph reference cannot cross aggregate boundary'; END IF;
    RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER "tournament_match_slots_scope_guard" AFTER INSERT OR UPDATE ON "tournament_match_slots"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "guard_tournament_graph_scope"();
CREATE CONSTRAINT TRIGGER "tournament_match_results_scope_guard" AFTER INSERT OR UPDATE ON "tournament_match_results"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "guard_tournament_graph_scope"();

CREATE FUNCTION "reject_tournament_append_only_mutation"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'tournament result, audit and completion history is append-only'; END; $$;
CREATE TRIGGER "tournament_match_results_append_only" BEFORE UPDATE OR DELETE ON "tournament_match_results"
    FOR EACH ROW EXECUTE FUNCTION "reject_tournament_append_only_mutation"();
CREATE TRIGGER "tournament_audits_append_only" BEFORE UPDATE OR DELETE ON "tournament_audits"
    FOR EACH ROW EXECUTE FUNCTION "reject_tournament_append_only_mutation"();
CREATE TRIGGER "tournament_completion_markers_append_only" BEFORE UPDATE OR DELETE ON "tournament_completion_markers"
    FOR EACH ROW EXECUTE FUNCTION "reject_tournament_append_only_mutation"();

-- PostgreSQL aggregate row locks plus expected version/revision protect round generation and correction.
-- Outbox message_id is the replay key; projection_revision/checksum makes recovery deterministic and fail-closed.
