CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Extend the closed XP source taxonomy without rewriting GLOBAL_V1 snapshots.
ALTER TYPE "xp_source_kind" RENAME TO "xp_source_kind_old";
CREATE TYPE "xp_source_kind" AS ENUM (
    'CONFIRMED_PLAY',
    'CONFIRMED_MATCH_ORGANIZED',
    'ELIGIBLE_STRUCTURED_REVIEW',
    'MINI_GAME_DAILY_COMPLETION'
);
ALTER TABLE "xp_rule_definitions" ALTER COLUMN "source_kind" TYPE "xp_source_kind"
    USING "source_kind"::text::"xp_source_kind";
ALTER TABLE "xp_ledger_entries" ALTER COLUMN "source_kind" TYPE "xp_source_kind"
    USING "source_kind"::text::"xp_source_kind";
ALTER TABLE "achievement_definitions" ALTER COLUMN "source_kind" TYPE "xp_source_kind"
    USING "source_kind"::text::"xp_source_kind";
DROP TYPE "xp_source_kind_old";

INSERT INTO "xp_rule_definitions" (
    "id", "scope_kind", "club_id", "source_kind", "version", "enabled", "base_xp", "coefficient_tenths",
    "daily_event_cap", "weekly_event_cap", "effective_from", "effective_until", "snapshot_hash"
) VALUES (
    '0182f000-0000-7000-8000-000000000001', 'GLOBAL', NULL, 'MINI_GAME_DAILY_COMPLETION', '2.0.0', TRUE,
    10, 10, 1, 5, '2026-09-16T00:00:00Z', NULL, repeat('4', 64)
);

CREATE TYPE "game_mode" AS ENUM ('STANDARD', 'CALM');
CREATE TYPE "game_session_state" AS ENUM ('ISSUED', 'COMPLETED', 'REJECTED', 'EXPIRED');
CREATE TYPE "game_result_outcome" AS ENUM ('ACCEPTED', 'REJECTED');
CREATE TYPE "game_reward_kind" AS ENUM ('PRACTICE_MARK', 'COSMETIC', 'GLOBAL_XP');
CREATE TYPE "game_reward_state" AS ENUM ('PENDING', 'GRANTED', 'CAPPED', 'REJECTED', 'REVERSED', 'REINSTATED');
CREATE TYPE "game_cosmetic_state" AS ENUM ('UNLOCKED', 'REVOKED', 'REINSTATED');

CREATE TABLE "game_configurations" (
    "id" UUID PRIMARY KEY,
    "version" VARCHAR(32) NOT NULL,
    "mode" "game_mode" NOT NULL,
    "active_duration_milliseconds" INTEGER,
    "turn_count" SMALLINT,
    "pause_resume_ttl_seconds" SMALLINT NOT NULL DEFAULT 600,
    "definition_snapshot" JSONB NOT NULL,
    "snapshot_hash" CHAR(64) NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "game_configurations_version_check" CHECK ("version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'),
    CONSTRAINT "game_configurations_mode_shape_check" CHECK (
        ("mode" = 'STANDARD' AND "active_duration_milliseconds" = 90000 AND "turn_count" IS NULL)
        OR ("mode" = 'CALM' AND "active_duration_milliseconds" IS NULL AND "turn_count" = 20)
    ),
    CONSTRAINT "game_configurations_pause_ttl_check" CHECK ("pause_resume_ttl_seconds" = 600),
    CONSTRAINT "game_configurations_snapshot_check" CHECK (
        "definition_snapshot" @> '{"directions":["LEFT","CENTER","RIGHT"],"score":{"successfulReturn":10,"targetDirection":5,"streakLength":5,"streakBonus":10}}'::jsonb
    ),
    UNIQUE ("version", "mode")
);

CREATE TABLE "game_seasons" (
    "id" UUID PRIMARY KEY,
    "version" VARCHAR(32) NOT NULL UNIQUE,
    "configuration_version" VARCHAR(32) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "goal_snapshot" JSONB NOT NULL,
    "cosmetic_snapshot" JSONB NOT NULL,
    "definition_snapshot_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "game_seasons_version_check" CHECK ("version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'),
    CONSTRAINT "game_seasons_exact_window_check" CHECK ("ends_at" = "starts_at" + INTERVAL '84 days'),
    CONSTRAINT "game_seasons_utc_boundary_check" CHECK (
        "starts_at" = date_trunc('day', "starts_at", 'UTC') AND "ends_at" = date_trunc('day', "ends_at", 'UTC')
    ),
    CONSTRAINT "game_seasons_goal_snapshot_check" CHECK (
        "goal_snapshot" @> '[{"code":"DAILY_WARM_UP","target":1},{"code":"DAILY_ACCURACY","target":12},{"code":"DAILY_DIRECTIONS","target":2}]'::jsonb
    ),
    CONSTRAINT "game_seasons_cosmetic_snapshot_check" CHECK (
        "cosmetic_snapshot" @> '[{"code":"SEASON_CARD_BACKGROUND","distinctDays":5},{"code":"BALL_COLOR","practiceMarks":30},{"code":"BALL_TRAIL","distinctDays":20},{"code":"GAME_PROFILE_FRAME","practiceMarks":60}]'::jsonb
    )
);
ALTER TABLE "game_seasons" ADD CONSTRAINT "game_seasons_no_overlap" EXCLUDE USING gist (
    tstzrange("starts_at", "ends_at", '[)') WITH &&
);
CREATE INDEX "game_seasons_window_idx" ON "game_seasons" ("starts_at", "ends_at");

CREATE TABLE "game_sessions" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "configuration_id" UUID NOT NULL REFERENCES "game_configurations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "season_id" UUID NOT NULL REFERENCES "game_seasons"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "task_id" UUID NOT NULL,
    "mode" "game_mode" NOT NULL,
    "state" "game_session_state" NOT NULL DEFAULT 'ISSUED',
    "challenge_hash" CHAR(64) NOT NULL,
    "signature_key_version" INTEGER NOT NULL,
    "daily_window_started_at" TIMESTAMPTZ(3) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "terminal_at" TIMESTAMPTZ(3),
    CONSTRAINT "game_sessions_signature_key_check" CHECK ("signature_key_version" > 0),
    CONSTRAINT "game_sessions_challenge_ttl_check" CHECK (
        "expires_at" = "issued_at" + INTERVAL '15 minutes'
    ),
    CONSTRAINT "game_sessions_daily_window_check" CHECK (
        "daily_window_started_at" = date_trunc('day', "issued_at", 'UTC')
    ),
    CONSTRAINT "game_sessions_terminal_shape_check" CHECK (
        ("state" = 'ISSUED' AND "terminal_at" IS NULL)
        OR ("state" <> 'ISSUED' AND "terminal_at" IS NOT NULL)
    ),
    CONSTRAINT "game_sessions_task_key" UNIQUE ("task_id"),
    CONSTRAINT "game_sessions_challenge_key" UNIQUE ("challenge_hash")
);
CREATE INDEX "game_sessions_daily_cap_idx" ON "game_sessions" ("user_id", "daily_window_started_at", "issued_at");
CREATE INDEX "game_sessions_expiry_idx" ON "game_sessions" ("expires_at", "state");

CREATE TABLE "game_launch_capabilities" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "native_session_id" UUID NOT NULL REFERENCES "identity_sessions"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    "origin" VARCHAR(255) NOT NULL,
    "capability_hash" CHAR(64) NOT NULL,
    "signature_key_version" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "access_token_hash" CHAR(64),
    "access_token_expires_at" TIMESTAMPTZ(3),
    CONSTRAINT "game_launch_capabilities_origin_check" CHECK (
        "origin" ~ '^https://[^/?#]+$'
    ),
    CONSTRAINT "game_launch_capabilities_key_check" CHECK ("signature_key_version" > 0),
    CONSTRAINT "game_launch_capabilities_ttl_check" CHECK (
        "expires_at" = "issued_at" + INTERVAL '60 seconds'
    ),
    CONSTRAINT "game_launch_capabilities_consumption_check" CHECK (
        ("consumed_at" IS NULL AND "access_token_hash" IS NULL AND "access_token_expires_at" IS NULL)
        OR ("consumed_at" IS NOT NULL AND "access_token_hash" IS NOT NULL
            AND "access_token_expires_at" = "consumed_at" + INTERVAL '15 minutes')
    ),
    CONSTRAINT "game_launch_capabilities_capability_key" UNIQUE ("capability_hash"),
    CONSTRAINT "game_launch_capabilities_access_token_key" UNIQUE ("access_token_hash")
);
CREATE INDEX "game_launch_capabilities_expiry_idx"
    ON "game_launch_capabilities" ("expires_at", "consumed_at");

CREATE TABLE "game_results" (
    "id" UUID PRIMARY KEY,
    "session_id" UUID NOT NULL REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "task_id" UUID NOT NULL,
    "outcome" "game_result_outcome" NOT NULL,
    "reason_code" VARCHAR(48) NOT NULL,
    "mode" "game_mode" NOT NULL,
    "configuration_version" VARCHAR(32) NOT NULL,
    "active_duration_milliseconds" INTEGER NOT NULL,
    "paused_duration_milliseconds" INTEGER NOT NULL,
    "attempts" SMALLINT NOT NULL,
    "successful_returns" SMALLINT NOT NULL,
    "target_hits" SMALLINT NOT NULL,
    "streak_bonuses" SMALLINT NOT NULL,
    "left_target_hits" SMALLINT NOT NULL,
    "center_target_hits" SMALLINT NOT NULL,
    "right_target_hits" SMALLINT NOT NULL,
    "result_proof_hash" CHAR(64),
    "accepted_at" TIMESTAMPTZ(3),
    "reward_claim_expires_at" TIMESTAMPTZ(3),
    "retention_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "game_results_version_check" CHECK ("configuration_version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'),
    CONSTRAINT "game_results_counter_bounds_check" CHECK (
        "attempts" BETWEEN 1 AND 180 AND "successful_returns" BETWEEN 0 AND "attempts"
        AND "target_hits" BETWEEN 0 AND "successful_returns"
        AND "streak_bonuses" BETWEEN 0 AND floor("successful_returns" / 5.0)
        AND "left_target_hits" >= 0 AND "center_target_hits" >= 0 AND "right_target_hits" >= 0
        AND "left_target_hits" + "center_target_hits" + "right_target_hits" = "target_hits"
        AND "paused_duration_milliseconds" BETWEEN 0 AND 600000
    ),
    CONSTRAINT "game_results_mode_bounds_check" CHECK (
        ("mode" = 'STANDARD' AND "active_duration_milliseconds" = 90000)
        OR ("mode" = 'CALM' AND "attempts" = 20 AND "active_duration_milliseconds" BETWEEN 1 AND 900000)
    ),
    CONSTRAINT "game_results_terminal_shape_check" CHECK (
        ("outcome" = 'ACCEPTED' AND "reason_code" = 'NONE' AND "result_proof_hash" IS NOT NULL
            AND "accepted_at" IS NOT NULL AND "reward_claim_expires_at" = "accepted_at" + INTERVAL '24 hours')
        OR ("outcome" = 'REJECTED' AND "reason_code" <> 'NONE' AND "result_proof_hash" IS NULL
            AND "accepted_at" IS NULL AND "reward_claim_expires_at" IS NULL)
    ),
    CONSTRAINT "game_results_retention_check" CHECK (
        "retention_expires_at" > "created_at" AND "retention_expires_at" <= "created_at" + INTERVAL '114 days'
    ),
    CONSTRAINT "game_results_session_key" UNIQUE ("session_id"),
    CONSTRAINT "game_results_proof_key" UNIQUE ("result_proof_hash")
);
CREATE INDEX "game_results_daily_cap_idx" ON "game_results" ("user_id", "accepted_at");
CREATE INDEX "game_results_retention_idx" ON "game_results" ("retention_expires_at");

CREATE TABLE "processed_game_tasks" (
    "task_id" UUID PRIMARY KEY,
    "session_id" UUID NOT NULL REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "receipt_id" UUID NOT NULL REFERENCES "game_results"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "payload_hash" CHAR(64) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "processed_game_tasks_ttl_check" CHECK ("expires_at" = "processed_at" + INTERVAL '24 hours'),
    CONSTRAINT "processed_game_tasks_session_key" UNIQUE ("session_id"),
    CONSTRAINT "processed_game_tasks_receipt_key" UNIQUE ("receipt_id")
);
CREATE INDEX "processed_game_tasks_expiry_idx" ON "processed_game_tasks" ("expires_at");

CREATE TABLE "processed_game_nonces" (
    "nonce_hash" CHAR(64) PRIMARY KEY,
    "session_id" UUID NOT NULL REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "request_hash" CHAR(64) NOT NULL,
    "receipt_id" UUID NOT NULL REFERENCES "game_results"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "processed_game_nonces_ttl_check" CHECK ("expires_at" = "processed_at" + INTERVAL '24 hours')
);
CREATE INDEX "processed_game_nonces_expiry_idx" ON "processed_game_nonces" ("expires_at");

CREATE TABLE "reward_grants" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "receipt_id" UUID NOT NULL REFERENCES "game_results"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "season_id" UUID NOT NULL REFERENCES "game_seasons"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "kind" "game_reward_kind" NOT NULL,
    "state" "game_reward_state" NOT NULL,
    "semantic_key" VARCHAR(96) NOT NULL,
    "goal_code" VARCHAR(40),
    "cosmetic_code" VARCHAR(40),
    "amount" INTEGER NOT NULL,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL,
    "compensation_of_grant_id" UUID REFERENCES "reward_grants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "reason_code" VARCHAR(48),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "reward_grants_shape_check" CHECK (
        ("kind" = 'PRACTICE_MARK' AND "goal_code" IN ('DAILY_WARM_UP', 'DAILY_ACCURACY', 'DAILY_DIRECTIONS')
            AND "cosmetic_code" IS NULL AND "amount" IN (0, 1))
        OR ("kind" = 'COSMETIC' AND "goal_code" IS NULL
            AND "cosmetic_code" IN ('SEASON_CARD_BACKGROUND', 'BALL_COLOR', 'BALL_TRAIL', 'GAME_PROFILE_FRAME')
            AND "amount" IN (0, 1))
        OR ("kind" = 'GLOBAL_XP' AND "goal_code" IS NULL AND "cosmetic_code" IS NULL AND "amount" IN (0, 10))
    ),
    CONSTRAINT "reward_grants_state_shape_check" CHECK (
        ("state" IN ('PENDING', 'GRANTED', 'CAPPED', 'REJECTED') AND "compensation_of_grant_id" IS NULL)
        OR ("state" IN ('REVERSED', 'REINSTATED') AND "compensation_of_grant_id" IS NOT NULL)
    ),
    CONSTRAINT "reward_grants_amount_state_check" CHECK (
        ("state" IN ('GRANTED', 'REVERSED', 'REINSTATED') AND "amount" > 0)
        OR ("state" IN ('PENDING', 'CAPPED', 'REJECTED') AND "amount" = 0)
    ),
    CONSTRAINT "reward_grants_window_check" CHECK (
        "window_started_at" = date_trunc('day', "window_started_at", 'UTC')
    ),
    CONSTRAINT "reward_grants_retention_check" CHECK (
        "retention_expires_at" > "created_at" AND "retention_expires_at" <= "created_at" + INTERVAL '114 days'
    ),
    CONSTRAINT "reward_grants_semantic_state_key" UNIQUE ("user_id", "season_id", "semantic_key", "state")
);
CREATE UNIQUE INDEX "reward_grants_one_reversal_key" ON "reward_grants" ("compensation_of_grant_id")
    WHERE "state" = 'REVERSED';
CREATE UNIQUE INDEX "reward_grants_one_reinstatement_key" ON "reward_grants" ("compensation_of_grant_id")
    WHERE "state" = 'REINSTATED';
CREATE INDEX "reward_grants_receipt_idx" ON "reward_grants" ("receipt_id", "created_at");
CREATE INDEX "reward_grants_retention_idx" ON "reward_grants" ("retention_expires_at");

CREATE TABLE "cosmetic_unlocks" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "season_id" UUID NOT NULL REFERENCES "game_seasons"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "cosmetic_code" VARCHAR(40) NOT NULL CHECK (
        "cosmetic_code" IN ('SEASON_CARD_BACKGROUND', 'BALL_COLOR', 'BALL_TRAIL', 'GAME_PROFILE_FRAME')
    ),
    "state" "game_cosmetic_state" NOT NULL,
    "source_grant_id" UUID NOT NULL REFERENCES "reward_grants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "supersedes_unlock_id" UUID REFERENCES "cosmetic_unlocks"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cosmetic_unlocks_chain_shape_check" CHECK (
        ("state" = 'UNLOCKED' AND "supersedes_unlock_id" IS NULL)
        OR ("state" IN ('REVOKED', 'REINSTATED') AND "supersedes_unlock_id" IS NOT NULL)
    ),
    CONSTRAINT "cosmetic_unlocks_source_grant_key" UNIQUE ("source_grant_id")
);
CREATE UNIQUE INDEX "cosmetic_unlocks_initial_key" ON "cosmetic_unlocks" ("user_id", "season_id", "cosmetic_code")
    WHERE "state" = 'UNLOCKED';
CREATE UNIQUE INDEX "cosmetic_unlocks_one_successor_key" ON "cosmetic_unlocks" ("supersedes_unlock_id");
CREATE INDEX "cosmetic_unlocks_owner_idx" ON "cosmetic_unlocks" ("user_id", "season_id", "cosmetic_code", "created_at");

CREATE TABLE "mini_game_operation_receipts" (
    "id" UUID PRIMARY KEY,
    "actor_user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "canonical_path" VARCHAR(200) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT "mini_game_operation_receipts_ttl_check" CHECK ("expires_at" = "created_at" + INTERVAL '24 hours'),
    CONSTRAINT "mini_game_operation_receipts_scope_key"
        UNIQUE ("actor_user_id", "method", "canonical_path", "idempotency_key")
);
CREATE INDEX "mini_game_operation_receipts_expiry_idx" ON "mini_game_operation_receipts" ("expires_at");

CREATE FUNCTION "game_configuration_immutable"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'published game configuration is immutable'; END; $$;
CREATE TRIGGER "game_configurations_immutable" BEFORE UPDATE OR DELETE ON "game_configurations"
    FOR EACH ROW EXECUTE FUNCTION "game_configuration_immutable"();
CREATE TRIGGER "game_seasons_immutable" BEFORE UPDATE OR DELETE ON "game_seasons"
    FOR EACH ROW EXECUTE FUNCTION "game_configuration_immutable"();

CREATE FUNCTION "validate_game_session_insert"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE config "game_configurations"%ROWTYPE; season "game_seasons"%ROWTYPE; issued_count INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."user_id"::text || ':' || NEW."daily_window_started_at"::text, 0));
    SELECT * INTO config FROM "game_configurations" WHERE "id" = NEW."configuration_id" FOR SHARE;
    SELECT * INTO season FROM "game_seasons" WHERE "id" = NEW."season_id" FOR SHARE;
    IF NOT FOUND OR config."mode" <> NEW."mode" OR config."version" <> season."configuration_version"
        OR NEW."issued_at" < season."starts_at" OR NEW."issued_at" >= season."ends_at" THEN
        RAISE EXCEPTION 'session must use the active immutable mode/configuration/season snapshot';
    END IF;
    SELECT count(*) INTO issued_count FROM "game_sessions" session
        WHERE session."user_id" = NEW."user_id" AND session."daily_window_started_at" = NEW."daily_window_started_at";
    IF issued_count >= 20 THEN RAISE EXCEPTION 'daily reward-eligible game session issue cap reached'; END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "game_sessions_issue_guard" BEFORE INSERT ON "game_sessions"
    FOR EACH ROW EXECUTE FUNCTION "validate_game_session_insert"();

CREATE FUNCTION "validate_game_session_transition"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."state" <> 'ISSUED' OR NEW."state" = 'ISSUED' OR NEW."id" <> OLD."id"
        OR NEW."user_id" <> OLD."user_id" OR NEW."configuration_id" <> OLD."configuration_id"
        OR NEW."season_id" <> OLD."season_id" OR NEW."task_id" <> OLD."task_id"
        OR NEW."mode" <> OLD."mode" OR NEW."challenge_hash" <> OLD."challenge_hash"
        OR NEW."signature_key_version" <> OLD."signature_key_version"
        OR NEW."daily_window_started_at" <> OLD."daily_window_started_at"
        OR NEW."issued_at" <> OLD."issued_at" OR NEW."expires_at" <> OLD."expires_at" THEN
        RAISE EXCEPTION 'game session permits one ISSUED to terminal transition only';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "game_sessions_state_machine" BEFORE UPDATE ON "game_sessions"
    FOR EACH ROW EXECUTE FUNCTION "validate_game_session_transition"();

CREATE FUNCTION "validate_game_launch_transition"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."consumed_at" IS NOT NULL OR NEW."consumed_at" IS NULL
        OR NEW."id" <> OLD."id" OR NEW."user_id" <> OLD."user_id"
        OR NEW."native_session_id" <> OLD."native_session_id" OR NEW."origin" <> OLD."origin"
        OR NEW."capability_hash" <> OLD."capability_hash"
        OR NEW."signature_key_version" <> OLD."signature_key_version" OR NEW."issued_at" <> OLD."issued_at"
        OR NEW."expires_at" <> OLD."expires_at" OR NEW."consumed_at" > OLD."expires_at" THEN
        RAISE EXCEPTION 'WebView launch capability permits one unexpired consumption only';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "game_launch_capabilities_single_use" BEFORE UPDATE ON "game_launch_capabilities"
    FOR EACH ROW EXECUTE FUNCTION "validate_game_launch_transition"();

CREATE FUNCTION "validate_game_result"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE session "game_sessions"%ROWTYPE; config "game_configurations"%ROWTYPE; daily_count INTEGER;
BEGIN
    SELECT * INTO session FROM "game_sessions" WHERE "id" = NEW."session_id" FOR UPDATE;
    SELECT * INTO config FROM "game_configurations" WHERE "id" = session."configuration_id" FOR SHARE;
    IF session."user_id" <> NEW."user_id" OR session."task_id" <> NEW."task_id"
        OR session."mode" <> NEW."mode" OR config."version" <> NEW."configuration_version" THEN
        RAISE EXCEPTION 'result does not match challenge ownership, task, mode or configuration';
    END IF;
    IF session."state" <> 'ISSUED' THEN RAISE EXCEPTION 'game challenge already terminal'; END IF;
    IF NEW."created_at" > session."expires_at" THEN RAISE EXCEPTION 'game challenge expired'; END IF;
    IF NEW."outcome" = 'ACCEPTED' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW."user_id"::text || ':' || session."daily_window_started_at"::text || ':accepted', 0));
        SELECT count(*) INTO daily_count FROM "game_results" result
            WHERE result."user_id" = NEW."user_id" AND result."outcome" = 'ACCEPTED'
            AND result."accepted_at" >= session."daily_window_started_at"
            AND result."accepted_at" < session."daily_window_started_at" + INTERVAL '1 day';
        IF daily_count >= 10 THEN RAISE EXCEPTION 'daily accepted result cap reached'; END IF;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "game_results_session_guard" BEFORE INSERT ON "game_results"
    FOR EACH ROW EXECUTE FUNCTION "validate_game_result"();

CREATE FUNCTION "append_only_game_record"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'mini-game receipt and reward records are append-only'; END; $$;
CREATE TRIGGER "game_results_append_only" BEFORE UPDATE ON "game_results"
    FOR EACH ROW EXECUTE FUNCTION "append_only_game_record"();
CREATE TRIGGER "processed_game_tasks_append_only" BEFORE UPDATE ON "processed_game_tasks"
    FOR EACH ROW EXECUTE FUNCTION "append_only_game_record"();
CREATE TRIGGER "processed_game_nonces_append_only" BEFORE UPDATE ON "processed_game_nonces"
    FOR EACH ROW EXECUTE FUNCTION "append_only_game_record"();
CREATE TRIGGER "reward_grants_append_only" BEFORE UPDATE ON "reward_grants"
    FOR EACH ROW EXECUTE FUNCTION "append_only_game_record"();
CREATE TRIGGER "cosmetic_unlocks_append_only" BEFORE UPDATE ON "cosmetic_unlocks"
    FOR EACH ROW EXECUTE FUNCTION "append_only_game_record"();

CREATE FUNCTION "validate_game_terminal_bundle"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE receipt "game_results"%ROWTYPE; session "game_sessions"%ROWTYPE;
BEGIN
    SELECT * INTO receipt FROM "game_results" WHERE "id" = COALESCE(NEW."id", OLD."id");
    IF TG_TABLE_NAME = 'game_sessions' THEN
        SELECT * INTO session FROM "game_sessions" WHERE "id" = COALESCE(NEW."id", OLD."id");
        IF session."state" = 'ISSUED' THEN RETURN NULL; END IF;
        SELECT * INTO receipt FROM "game_results" WHERE "session_id" = session."id";
        IF session."state" = 'EXPIRED' AND receipt."id" IS NULL THEN RETURN NULL; END IF;
    ELSE
        SELECT * INTO session FROM "game_sessions" WHERE "id" = receipt."session_id";
    END IF;
    IF receipt."id" IS NULL OR session."id" IS NULL
        OR (receipt."outcome" = 'ACCEPTED' AND session."state" <> 'COMPLETED')
        OR (receipt."outcome" = 'REJECTED' AND session."state" <> 'REJECTED')
        OR NOT EXISTS (SELECT 1 FROM "processed_game_tasks" task WHERE task."receipt_id" = receipt."id")
        OR NOT EXISTS (SELECT 1 FROM "processed_game_nonces" nonce WHERE nonce."receipt_id" = receipt."id") THEN
        RAISE EXCEPTION 'terminal session, receipt, processed task and nonce must commit atomically';
    END IF;
    RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "game_results_terminal_bundle_guard"
    AFTER INSERT ON "game_results" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "validate_game_terminal_bundle"();
CREATE CONSTRAINT TRIGGER "game_sessions_terminal_bundle_guard"
    AFTER UPDATE ON "game_sessions" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "validate_game_terminal_bundle"();

CREATE FUNCTION "validate_reward_grant_chain"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE original "reward_grants"%ROWTYPE; reversal "reward_grants"%ROWTYPE; daily_count INTEGER; weekly_count INTEGER; season_count INTEGER;
BEGIN
    IF NEW."state" IN ('REVERSED', 'REINSTATED') THEN
        SELECT * INTO original FROM "reward_grants" WHERE "id" = NEW."compensation_of_grant_id" FOR SHARE;
        IF NOT FOUND OR original."user_id" <> NEW."user_id" OR original."season_id" <> NEW."season_id"
            OR original."kind" <> NEW."kind" OR original."semantic_key" <> NEW."semantic_key"
            OR original."goal_code" IS DISTINCT FROM NEW."goal_code"
            OR original."cosmetic_code" IS DISTINCT FROM NEW."cosmetic_code"
            OR original."amount" <> NEW."amount" OR original."window_started_at" <> NEW."window_started_at"
            OR original."receipt_id" <> NEW."receipt_id" THEN
            RAISE EXCEPTION 'reward compensation must preserve receipt, owner, season, kind, item, semantic key, window and amount';
        END IF;
        IF NEW."state" = 'REVERSED' AND original."state" <> 'GRANTED' THEN
            RAISE EXCEPTION 'reward reversal must compensate a granted entry';
        END IF;
        IF NEW."state" = 'REINSTATED' THEN
            SELECT * INTO reversal FROM "reward_grants" WHERE "id" = NEW."compensation_of_grant_id";
            IF reversal."state" <> 'REVERSED' THEN RAISE EXCEPTION 'reward reinstatement must compensate a reversal'; END IF;
        END IF;
    END IF;
    IF NEW."kind" = 'GLOBAL_XP' AND NEW."state" = 'GRANTED' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW."user_id"::text || ':MINI_GAME_DAILY_COMPLETION', 0));
        SELECT count(*) FILTER (WHERE grant."window_started_at" = NEW."window_started_at"),
            count(*) FILTER (WHERE date_trunc('week', grant."window_started_at", 'UTC') = date_trunc('week', NEW."window_started_at", 'UTC')),
            count(*) FILTER (WHERE grant."season_id" = NEW."season_id")
        INTO daily_count, weekly_count, season_count
        FROM "reward_grants" grant WHERE grant."user_id" = NEW."user_id" AND grant."kind" = 'GLOBAL_XP'
            AND grant."state" IN ('GRANTED', 'REINSTATED');
        IF daily_count >= 1 OR weekly_count >= 5 OR season_count >= 30 THEN
            RAISE EXCEPTION 'mini-game XP daily, UTC-week or 84-day season cap reached';
        END IF;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "reward_grants_chain_guard" BEFORE INSERT ON "reward_grants"
    FOR EACH ROW EXECUTE FUNCTION "validate_reward_grant_chain"();

CREATE FUNCTION "validate_cosmetic_unlock_chain"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE prior "cosmetic_unlocks"%ROWTYPE; grant "reward_grants"%ROWTYPE;
BEGIN
    SELECT * INTO grant FROM "reward_grants" WHERE "id" = NEW."source_grant_id" FOR SHARE;
    IF NOT FOUND OR grant."user_id" <> NEW."user_id" OR grant."season_id" <> NEW."season_id"
        OR grant."kind" <> 'COSMETIC' OR grant."cosmetic_code" <> NEW."cosmetic_code" THEN
        RAISE EXCEPTION 'cosmetic unlock must use its exact cosmetic reward grant';
    END IF;
    IF NEW."state" <> 'UNLOCKED' THEN
        SELECT * INTO prior FROM "cosmetic_unlocks" WHERE "id" = NEW."supersedes_unlock_id" FOR SHARE;
        IF NOT FOUND OR prior."user_id" <> NEW."user_id" OR prior."season_id" <> NEW."season_id"
            OR prior."cosmetic_code" <> NEW."cosmetic_code" THEN
            RAISE EXCEPTION 'cosmetic transition must preserve owner, season and fixed item';
        END IF;
        IF NEW."state" = 'REVOKED' AND prior."state" <> 'UNLOCKED' THEN
            RAISE EXCEPTION 'cosmetic revoke must supersede unlock';
        END IF;
        IF NEW."state" = 'REINSTATED' AND prior."state" <> 'REVOKED' THEN
            RAISE EXCEPTION 'cosmetic reinstatement must supersede revoke';
        END IF;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "cosmetic_unlocks_chain_guard" BEFORE INSERT ON "cosmetic_unlocks"
    FOR EACH ROW EXECUTE FUNCTION "validate_cosmetic_unlock_chain"();

-- The API and worker must insert result, processed task/nonce, terminal session update and outbox in one transaction.
-- Raw challenge/result proofs are never stored: only keyed hashes are retained. Cleanup removes processed records after
-- 24 hours and receipt/reward records no later than 30 days after the 84-day integrity window; legal hold is external.
