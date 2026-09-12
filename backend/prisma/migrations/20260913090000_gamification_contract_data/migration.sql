CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "gamification_scope_kind" AS ENUM ('GLOBAL', 'CLUB');
CREATE TYPE "xp_source_kind" AS ENUM ('CONFIRMED_PLAY', 'CONFIRMED_MATCH_ORGANIZED', 'ELIGIBLE_STRUCTURED_REVIEW');
CREATE TYPE "xp_ledger_entry_kind" AS ENUM ('AWARD', 'REVERSAL', 'REINSTATEMENT');
CREATE TYPE "xp_ledger_entry_status" AS ENUM ('PENDING', 'POSTED', 'CAPPED');
CREATE TYPE "achievement_award_state" AS ENUM ('EARNED', 'REVOKED', 'REINSTATED');
CREATE TYPE "leaderboard_season_state" AS ENUM ('SCHEDULED', 'ACTIVE', 'CLOSED');

CREATE TABLE "xp_rule_definitions" (
    "id" UUID PRIMARY KEY,
    "scope_kind" "gamification_scope_kind" NOT NULL,
    "club_id" UUID,
    "source_kind" "xp_source_kind" NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "base_xp" INTEGER NOT NULL,
    "coefficient_tenths" SMALLINT NOT NULL,
    "daily_event_cap" SMALLINT NOT NULL,
    "weekly_event_cap" SMALLINT NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_until" TIMESTAMPTZ(3),
    "snapshot_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "xp_rule_definitions_scope_check" CHECK (
        ("scope_kind" = 'GLOBAL' AND "club_id" IS NULL) OR ("scope_kind" = 'CLUB' AND "club_id" IS NOT NULL)
    ),
    CONSTRAINT "xp_rule_definitions_version_check" CHECK ("version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'),
    CONSTRAINT "xp_rule_definitions_amount_check" CHECK ("base_xp" > 0),
    CONSTRAINT "xp_rule_definitions_template_bounds_check" CHECK (
        "coefficient_tenths" BETWEEN 5 AND 20 AND "daily_event_cap" BETWEEN 1 AND 3
        AND "weekly_event_cap" BETWEEN "daily_event_cap" AND 10
    ),
    CONSTRAINT "xp_rule_definitions_window_check" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from")
);
CREATE UNIQUE INDEX "xp_rule_definitions_global_version_key" ON "xp_rule_definitions" ("source_kind", "version")
    WHERE "scope_kind" = 'GLOBAL';
CREATE UNIQUE INDEX "xp_rule_definitions_club_version_key" ON "xp_rule_definitions" ("club_id", "source_kind", "version")
    WHERE "scope_kind" = 'CLUB';
CREATE INDEX "xp_rule_definitions_effective_idx" ON "xp_rule_definitions" ("scope_kind", "club_id", "effective_from");

CREATE TABLE "xp_ledger_entries" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "scope_kind" "gamification_scope_kind" NOT NULL,
    "club_id" UUID,
    "source_kind" "xp_source_kind" NOT NULL,
    "source_event_id" UUID NOT NULL,
    "source_occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "rule_definition_id" UUID NOT NULL REFERENCES "xp_rule_definitions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "rule_version" VARCHAR(32) NOT NULL,
    "kind" "xp_ledger_entry_kind" NOT NULL,
    "status" "xp_ledger_entry_status" NOT NULL,
    "amount" INTEGER NOT NULL,
    "compensation_of_entry_id" UUID REFERENCES "xp_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "reason_code" VARCHAR(96),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "xp_ledger_entries_scope_check" CHECK (
        ("scope_kind" = 'GLOBAL' AND "club_id" IS NULL) OR ("scope_kind" = 'CLUB' AND "club_id" IS NOT NULL)
    ),
    CONSTRAINT "xp_ledger_entries_amount_check" CHECK (
        ("kind" = 'AWARD' AND "status" = 'CAPPED' AND "amount" = 0)
        OR ("amount" > 0 AND ("kind" <> 'AWARD' OR "status" <> 'CAPPED'))
    ),
    CONSTRAINT "xp_ledger_entries_compensation_shape_check" CHECK (
        ("kind" = 'AWARD' AND "compensation_of_entry_id" IS NULL)
        OR ("kind" IN ('REVERSAL', 'REINSTATEMENT') AND "compensation_of_entry_id" IS NOT NULL AND "status" = 'POSTED')
    ),
    CONSTRAINT "xp_ledger_entries_capped_kind_check" CHECK ("status" <> 'CAPPED' OR "kind" = 'AWARD')
);
CREATE UNIQUE INDEX "xp_ledger_entries_global_source_key" ON "xp_ledger_entries"
    ("user_id", "source_event_id", "rule_version", "kind") WHERE "scope_kind" = 'GLOBAL';
CREATE UNIQUE INDEX "xp_ledger_entries_club_source_key" ON "xp_ledger_entries"
    ("club_id", "user_id", "source_event_id", "rule_version", "kind") WHERE "scope_kind" = 'CLUB';
CREATE UNIQUE INDEX "xp_ledger_entries_one_reversal_key" ON "xp_ledger_entries" ("compensation_of_entry_id")
    WHERE "kind" = 'REVERSAL';
CREATE UNIQUE INDEX "xp_ledger_entries_one_reinstatement_key" ON "xp_ledger_entries" ("compensation_of_entry_id")
    WHERE "kind" = 'REINSTATEMENT';
CREATE INDEX "xp_ledger_entries_owner_idx" ON "xp_ledger_entries" ("user_id", "scope_kind", "club_id", "created_at", "id");

CREATE TABLE "xp_balances" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "scope_kind" "gamification_scope_kind" NOT NULL,
    "club_id" UUID,
    "lifetime_net_xp" BIGINT NOT NULL DEFAULT 0,
    "projection_revision" BIGINT NOT NULL DEFAULT 0,
    "checksum" CHAR(64) NOT NULL,
    "frozen_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "xp_balances_scope_check" CHECK (
        ("scope_kind" = 'GLOBAL' AND "club_id" IS NULL) OR ("scope_kind" = 'CLUB' AND "club_id" IS NOT NULL)
    ),
    CONSTRAINT "xp_balances_nonnegative_check" CHECK ("lifetime_net_xp" >= 0 AND "projection_revision" >= 0)
);
CREATE UNIQUE INDEX "xp_balances_global_owner_key" ON "xp_balances" ("user_id") WHERE "scope_kind" = 'GLOBAL';
CREATE UNIQUE INDEX "xp_balances_club_owner_key" ON "xp_balances" ("club_id", "user_id") WHERE "scope_kind" = 'CLUB';

CREATE TABLE "level_definitions" (
    "id" UUID PRIMARY KEY,
    "scope_kind" "gamification_scope_kind" NOT NULL,
    "club_id" UUID,
    "version" VARCHAR(32) NOT NULL,
    "ordinal" SMALLINT NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "threshold_xp" BIGINT NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "level_definitions_scope_check" CHECK (
        ("scope_kind" = 'GLOBAL' AND "club_id" IS NULL) OR ("scope_kind" = 'CLUB' AND "club_id" IS NOT NULL)
    ),
    CONSTRAINT "level_definitions_bounds_check" CHECK (
        "ordinal" BETWEEN 1 AND 20 AND char_length(btrim("name")) BETWEEN 1 AND 30 AND "threshold_xp" >= 0
    )
);
CREATE UNIQUE INDEX "level_definitions_global_ordinal_key" ON "level_definitions" ("version", "ordinal") WHERE "scope_kind" = 'GLOBAL';
CREATE UNIQUE INDEX "level_definitions_club_ordinal_key" ON "level_definitions" ("club_id", "version", "ordinal") WHERE "scope_kind" = 'CLUB';
CREATE UNIQUE INDEX "level_definitions_global_threshold_key" ON "level_definitions" ("version", "threshold_xp") WHERE "scope_kind" = 'GLOBAL';
CREATE UNIQUE INDEX "level_definitions_club_threshold_key" ON "level_definitions" ("club_id", "version", "threshold_xp") WHERE "scope_kind" = 'CLUB';

CREATE TABLE "achievement_definitions" (
    "id" UUID PRIMARY KEY,
    "scope_kind" "gamification_scope_kind" NOT NULL,
    "code" VARCHAR(96) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "source_kind" "xp_source_kind" NOT NULL,
    "threshold_count" INTEGER NOT NULL CHECK ("threshold_count" > 0),
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("scope_kind", "code", "version")
);

CREATE TABLE "achievement_awards" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "club_id" UUID,
    "achievement_definition_id" UUID NOT NULL REFERENCES "achievement_definitions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "achievement_award_state" NOT NULL,
    "qualifying_count" INTEGER NOT NULL CHECK ("qualifying_count" > 0),
    "source_ledger_entry_id" UUID NOT NULL REFERENCES "xp_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "supersedes_award_id" UUID REFERENCES "achievement_awards"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "achievement_awards_global_state_key" ON "achievement_awards"
    ("user_id", "achievement_definition_id", "state") WHERE "club_id" IS NULL;
CREATE UNIQUE INDEX "achievement_awards_club_state_key" ON "achievement_awards"
    ("club_id", "user_id", "achievement_definition_id", "state") WHERE "club_id" IS NOT NULL;

CREATE TABLE "leaderboard_seasons" (
    "id" UUID PRIMARY KEY,
    "scope_kind" "gamification_scope_kind" NOT NULL,
    "club_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "state" "leaderboard_season_state" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "rule_version" VARCHAR(32) NOT NULL,
    "definition_snapshot" JSONB NOT NULL,
    "definition_snapshot_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leaderboard_seasons_scope_check" CHECK (
        ("scope_kind" = 'GLOBAL' AND "club_id" IS NULL) OR ("scope_kind" = 'CLUB' AND "club_id" IS NOT NULL)
    ),
    CONSTRAINT "leaderboard_seasons_duration_check" CHECK (
        "ends_at" >= "starts_at" + INTERVAL '28 days' AND "ends_at" <= "starts_at" + INTERVAL '366 days'
    ),
    CONSTRAINT "leaderboard_seasons_half_open_check" CHECK (date_trunc('millisecond', "starts_at") = "starts_at" AND date_trunc('millisecond', "ends_at") = "ends_at")
);
ALTER TABLE "leaderboard_seasons" ADD CONSTRAINT "leaderboard_seasons_no_overlap"
    EXCLUDE USING gist (
        "scope_kind" WITH =,
        (COALESCE("club_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (tstzrange("starts_at", "ends_at", '[)')) WITH &&
    );

CREATE TABLE "leaderboard_consents" (
    "id" UUID PRIMARY KEY,
    "season_id" UUID NOT NULL REFERENCES "leaderboard_seasons"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "user_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL CHECK ("revision" >= 0),
    "opted_in" BOOLEAN NOT NULL,
    "policy_version" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("season_id", "user_id", "revision")
);
CREATE INDEX "leaderboard_consents_current_idx" ON "leaderboard_consents" ("season_id", "user_id", "revision" DESC);

CREATE TABLE "leaderboard_entries" (
    "season_id" UUID NOT NULL REFERENCES "leaderboard_seasons"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "user_id" UUID NOT NULL,
    "consent_revision" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL CHECK ("rank" > 0),
    "seasonal_net_xp" BIGINT NOT NULL CHECK ("seasonal_net_xp" >= 0),
    "level_definition_id" UUID NOT NULL REFERENCES "level_definitions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "projection_revision" BIGINT NOT NULL CHECK ("projection_revision" >= 0),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("season_id", "user_id"),
    FOREIGN KEY ("season_id", "user_id", "consent_revision")
        REFERENCES "leaderboard_consents"("season_id", "user_id", "revision") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "leaderboard_entries_page_idx" ON "leaderboard_entries" ("season_id", "rank", "user_id");
CREATE INDEX "leaderboard_entries_xp_idx" ON "leaderboard_entries" ("season_id", "seasonal_net_xp" DESC);

CREATE TABLE "processed_gamification_events" (
    "message_id" UUID PRIMARY KEY,
    "event_type" VARCHAR(160) NOT NULL,
    "source_event_id" UUID NOT NULL,
    "source_revision" INTEGER NOT NULL CHECK ("source_revision" >= 0),
    "payload_hash" CHAR(64) NOT NULL,
    "outcome" VARCHAR(32) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("event_type", "source_event_id", "source_revision")
);

CREATE TABLE "gamification_operation_receipts" (
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
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours',
    UNIQUE ("actor_user_id", "method", "canonical_path", "idempotency_key")
);
CREATE INDEX "gamification_operation_receipts_expiry_idx" ON "gamification_operation_receipts" ("expires_at");

CREATE FUNCTION "reject_gamification_append_only_mutation"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'gamification ledger, definitions, consent history and awards are append-only';
END; $$;

CREATE TRIGGER "xp_ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "xp_ledger_entries"
    FOR EACH ROW EXECUTE FUNCTION "reject_gamification_append_only_mutation"();
CREATE TRIGGER "xp_rule_definitions_immutable" BEFORE UPDATE OR DELETE ON "xp_rule_definitions"
    FOR EACH ROW EXECUTE FUNCTION "reject_gamification_append_only_mutation"();
CREATE TRIGGER "level_definitions_immutable" BEFORE UPDATE OR DELETE ON "level_definitions"
    FOR EACH ROW EXECUTE FUNCTION "reject_gamification_append_only_mutation"();
CREATE TRIGGER "achievement_definitions_immutable" BEFORE UPDATE OR DELETE ON "achievement_definitions"
    FOR EACH ROW EXECUTE FUNCTION "reject_gamification_append_only_mutation"();
CREATE TRIGGER "achievement_awards_append_only" BEFORE UPDATE OR DELETE ON "achievement_awards"
    FOR EACH ROW EXECUTE FUNCTION "reject_gamification_append_only_mutation"();
CREATE TRIGGER "leaderboard_consents_append_only" BEFORE UPDATE OR DELETE ON "leaderboard_consents"
    FOR EACH ROW EXECUTE FUNCTION "reject_gamification_append_only_mutation"();
CREATE TRIGGER "gamification_operation_receipts_immutable" BEFORE UPDATE OR DELETE ON "gamification_operation_receipts"
    FOR EACH ROW EXECUTE FUNCTION "reject_gamification_append_only_mutation"();

CREATE FUNCTION "leaderboard_season_immutable_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" <> OLD."id" OR NEW."scope_kind" <> OLD."scope_kind"
        OR NEW."club_id" IS DISTINCT FROM OLD."club_id" OR NEW."name" <> OLD."name"
        OR NEW."starts_at" <> OLD."starts_at" OR NEW."ends_at" <> OLD."ends_at"
        OR NEW."rule_version" <> OLD."rule_version"
        OR NEW."definition_snapshot" <> OLD."definition_snapshot"
        OR NEW."definition_snapshot_hash" <> OLD."definition_snapshot_hash"
        OR NEW."created_at" <> OLD."created_at" THEN
        RAISE EXCEPTION 'season scope, interval and rule snapshot are immutable';
    END IF;
    IF NOT ((OLD."state" = 'SCHEDULED' AND NEW."state" IN ('ACTIVE', 'CLOSED'))
        OR (OLD."state" = 'ACTIVE' AND NEW."state" = 'CLOSED')) THEN
        RAISE EXCEPTION 'leaderboard season state transition is not monotonic';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "leaderboard_seasons_immutable_guard" BEFORE UPDATE ON "leaderboard_seasons"
    FOR EACH ROW EXECUTE FUNCTION "leaderboard_season_immutable_guard"();

CREATE FUNCTION "validate_xp_ledger_chain"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    original "xp_ledger_entries"%ROWTYPE;
    reversal "xp_ledger_entries"%ROWTYPE;
    rule_definition "xp_rule_definitions"%ROWTYPE;
    daily_count INTEGER;
    weekly_count INTEGER;
BEGIN
    SELECT * INTO rule_definition FROM "xp_rule_definitions" WHERE "id" = NEW."rule_definition_id";
    IF rule_definition."scope_kind" <> NEW."scope_kind"
        OR rule_definition."club_id" IS DISTINCT FROM NEW."club_id"
        OR rule_definition."source_kind" <> NEW."source_kind"
        OR rule_definition."version" <> NEW."rule_version"
        OR NEW."source_occurred_at" < rule_definition."effective_from"
        OR (rule_definition."effective_until" IS NOT NULL AND NEW."source_occurred_at" >= rule_definition."effective_until") THEN
        RAISE EXCEPTION 'ledger entry does not match historical rule snapshot';
    END IF;
    IF NEW."kind" = 'AWARD' THEN
        IF rule_definition."enabled" IS NOT TRUE THEN
            RAISE EXCEPTION 'disabled club template cannot create an award';
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(
            NEW."user_id"::text || ':' || NEW."scope_kind"::text || ':' || COALESCE(NEW."club_id"::text, '-')
            || ':' || NEW."source_kind"::text, 0
        ));
        SELECT count(*) FILTER (WHERE date_trunc('day', entry."source_occurred_at", 'UTC') =
                date_trunc('day', NEW."source_occurred_at", 'UTC')),
            count(*) FILTER (WHERE date_trunc('week', entry."source_occurred_at", 'UTC') =
                date_trunc('week', NEW."source_occurred_at", 'UTC'))
        INTO daily_count, weekly_count
        FROM "xp_ledger_entries" entry
        WHERE entry."kind" = 'AWARD' AND entry."status" <> 'CAPPED' AND entry."user_id" = NEW."user_id"
            AND entry."scope_kind" = NEW."scope_kind" AND entry."club_id" IS NOT DISTINCT FROM NEW."club_id"
            AND entry."source_kind" = NEW."source_kind";
        IF daily_count >= rule_definition."daily_event_cap" OR weekly_count >= rule_definition."weekly_event_cap" THEN
            IF NEW."status" <> 'CAPPED' OR NEW."amount" <> 0 THEN
                RAISE EXCEPTION 'award beyond its UTC source-time cap must be terminal CAPPED with zero XP';
            END IF;
        ELSIF NEW."status" = 'CAPPED' OR NEW."amount" <> floor(
            rule_definition."base_xp" * rule_definition."coefficient_tenths" / 10.0
        ) THEN
            RAISE EXCEPTION 'award amount/status does not match its historical rule snapshot and cap window';
        END IF;
    END IF;
    IF NEW."kind" <> 'AWARD' THEN
        SELECT * INTO original FROM "xp_ledger_entries" WHERE "id" = NEW."compensation_of_entry_id" FOR SHARE;
        IF NOT FOUND OR original."user_id" <> NEW."user_id" OR original."scope_kind" <> NEW."scope_kind"
            OR original."club_id" IS DISTINCT FROM NEW."club_id" OR original."amount" <> NEW."amount"
            OR original."rule_definition_id" <> NEW."rule_definition_id" THEN
            RAISE EXCEPTION 'compensation must preserve owner, scope and original amount';
        END IF;
        IF NEW."kind" = 'REVERSAL' AND (original."kind" <> 'AWARD' OR original."status" <> 'POSTED') THEN
            RAISE EXCEPTION 'reversal must compensate a posted award';
        END IF;
        IF NEW."kind" = 'REINSTATEMENT' THEN
            SELECT * INTO reversal FROM "xp_ledger_entries" WHERE "id" = NEW."compensation_of_entry_id";
            IF reversal."kind" <> 'REVERSAL' THEN RAISE EXCEPTION 'reinstatement must compensate a reversal'; END IF;
        END IF;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "xp_ledger_entries_chain_guard" BEFORE INSERT ON "xp_ledger_entries"
    FOR EACH ROW EXECUTE FUNCTION "validate_xp_ledger_chain"();

CREATE FUNCTION "validate_leaderboard_entry_consent"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE consent "leaderboard_consents"%ROWTYPE; season "leaderboard_seasons"%ROWTYPE;
BEGIN
    SELECT * INTO consent FROM "leaderboard_consents"
        WHERE "season_id" = NEW."season_id" AND "user_id" = NEW."user_id" AND "revision" = NEW."consent_revision";
    SELECT * INTO season FROM "leaderboard_seasons" WHERE "id" = NEW."season_id";
    IF NOT FOUND OR consent."opted_in" IS NOT TRUE THEN
        RAISE EXCEPTION 'leaderboard entry requires explicit current opt-in';
    END IF;
    IF EXISTS (SELECT 1 FROM "leaderboard_consents" newer WHERE newer."season_id" = NEW."season_id"
        AND newer."user_id" = NEW."user_id" AND newer."revision" > NEW."consent_revision") THEN
        RAISE EXCEPTION 'leaderboard entry consent revision is stale';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "leaderboard_entries_consent_guard" BEFORE INSERT OR UPDATE ON "leaderboard_entries"
    FOR EACH ROW EXECUTE FUNCTION "validate_leaderboard_entry_consent"();

CREATE FUNCTION "leaderboard_consent_season_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE season "leaderboard_seasons"%ROWTYPE;
BEGIN
    SELECT * INTO season FROM "leaderboard_seasons" WHERE "id" = NEW."season_id" FOR SHARE;
    IF season."state" = 'CLOSED' AND NEW."opted_in" THEN RAISE EXCEPTION 'closed season rejects new leaderboard opt-in'; END IF;
    IF NEW."revision" <> COALESCE((SELECT max(consent."revision") + 1 FROM "leaderboard_consents" consent
        WHERE consent."season_id" = NEW."season_id" AND consent."user_id" = NEW."user_id"), 0) THEN
        RAISE EXCEPTION 'leaderboard consent revision must be contiguous';
    END IF;
    DELETE FROM "leaderboard_entries" entry
        WHERE entry."season_id" = NEW."season_id" AND entry."user_id" = NEW."user_id";
    RETURN NEW;
END; $$;
CREATE TRIGGER "leaderboard_consents_season_guard" BEFORE INSERT ON "leaderboard_consents"
    FOR EACH ROW EXECUTE FUNCTION "leaderboard_consent_season_guard"();

CREATE FUNCTION "validate_level_definition_order"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "level_definitions" level
        WHERE level."scope_kind" = NEW."scope_kind" AND level."club_id" IS NOT DISTINCT FROM NEW."club_id"
        AND level."version" = NEW."version"
        AND ((level."ordinal" < NEW."ordinal" AND level."threshold_xp" >= NEW."threshold_xp")
          OR (level."ordinal" > NEW."ordinal" AND level."threshold_xp" <= NEW."threshold_xp"))) THEN
        RAISE EXCEPTION 'level thresholds must strictly increase with ordinal';
    END IF;
    IF (SELECT count(*) FROM "level_definitions" level WHERE level."scope_kind" = NEW."scope_kind"
        AND level."club_id" IS NOT DISTINCT FROM NEW."club_id" AND level."version" = NEW."version") >= 20 THEN
        RAISE EXCEPTION 'a level definition set contains at most 20 levels';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER "level_definitions_order_guard" BEFORE INSERT ON "level_definitions"
    FOR EACH ROW EXECUTE FUNCTION "validate_level_definition_order"();

CREATE FUNCTION "validate_leaderboard_competition_rank"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "leaderboard_entries" entry
        WHERE entry."season_id" = COALESCE(NEW."season_id", OLD."season_id") AND entry."rank" <>
            1 + (SELECT count(*) FROM "leaderboard_entries" higher WHERE higher."season_id" = entry."season_id"
                AND higher."seasonal_net_xp" > entry."seasonal_net_xp")) THEN
        RAISE EXCEPTION 'leaderboard must use shared competition rank based only on seasonal net XP';
    END IF;
    RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "leaderboard_entries_competition_rank_guard"
    AFTER INSERT OR UPDATE OR DELETE ON "leaderboard_entries" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "validate_leaderboard_competition_rank"();

-- Seed immutable GLOBAL_V1 snapshots. XP is awarded for confirmed participation and contribution, never victory.
INSERT INTO "xp_rule_definitions" VALUES
('0182a000-0000-7000-8000-000000000001', 'GLOBAL', NULL, 'CONFIRMED_PLAY', '1.0.0', TRUE, 100, 10, 3, 10, '2026-09-13T00:00:00Z', NULL, repeat('1', 64), CURRENT_TIMESTAMP),
('0182a000-0000-7000-8000-000000000002', 'GLOBAL', NULL, 'CONFIRMED_MATCH_ORGANIZED', '1.0.0', TRUE, 40, 10, 3, 10, '2026-09-13T00:00:00Z', NULL, repeat('2', 64), CURRENT_TIMESTAMP),
('0182a000-0000-7000-8000-000000000003', 'GLOBAL', NULL, 'ELIGIBLE_STRUCTURED_REVIEW', '1.0.0', TRUE, 15, 10, 3, 10, '2026-09-13T00:00:00Z', NULL, repeat('3', 64), CURRENT_TIMESTAMP);

INSERT INTO "level_definitions" ("id", "scope_kind", "club_id", "version", "ordinal", "name", "threshold_xp", "effective_from") VALUES
('0182a000-0000-7000-8000-000000000011', 'GLOBAL', NULL, '1.0.0', 1, 'Старт', 0, '2026-09-13T00:00:00Z'),
('0182a000-0000-7000-8000-000000000012', 'GLOBAL', NULL, '1.0.0', 2, 'На площадке', 500, '2026-09-13T00:00:00Z'),
('0182a000-0000-7000-8000-000000000013', 'GLOBAL', NULL, '1.0.0', 3, 'В игре', 1500, '2026-09-13T00:00:00Z'),
('0182a000-0000-7000-8000-000000000014', 'GLOBAL', NULL, '1.0.0', 4, 'Активный участник', 3500, '2026-09-13T00:00:00Z'),
('0182a000-0000-7000-8000-000000000015', 'GLOBAL', NULL, '1.0.0', 5, 'Опора сообщества', 7500, '2026-09-13T00:00:00Z');
