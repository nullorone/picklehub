-- Clubs contract/data: shared-schema scoped governance, optional venues and deterministic recurring matches.

CREATE TYPE "club_state" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "club_membership_policy" AS ENUM ('OPEN', 'APPROVAL', 'INVITE_ONLY');
CREATE TYPE "club_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "club_membership_state" AS ENUM ('ACTIVE', 'LEFT', 'EXCLUDED', 'SUPERSEDED');
CREATE TYPE "club_join_request_state" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'SUPERSEDED');
CREATE TYPE "club_invitation_state" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED', 'SUPERSEDED');
CREATE TYPE "club_block_state" AS ENUM ('ACTIVE', 'LIFTED');
CREATE TYPE "recurring_match_rule_state" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');
CREATE TYPE "recurring_match_frequency" AS ENUM ('WEEKLY');
CREATE TYPE "recurring_dst_gap_policy" AS ENUM ('SKIP');
CREATE TYPE "recurring_dst_overlap_policy" AS ENUM ('EARLIER_OFFSET', 'LATER_OFFSET');
CREATE TYPE "recurring_occurrence_state" AS ENUM ('MATERIALIZED', 'SKIPPED_DST_GAP', 'SKIPPED_PAUSE');
CREATE TYPE "club_match_origin" AS ENUM ('CLUB', 'RECURRING_RULE');

CREATE TABLE "clubs" (
    "id" UUID PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "state" "club_state" NOT NULL DEFAULT 'ACTIVE',
    "name" VARCHAR(120) NOT NULL,
    "normalized_name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "locality" VARCHAR(120) NOT NULL,
    "normalized_locality" VARCHAR(120) NOT NULL,
    "membership_policy" "club_membership_policy" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),
    CONSTRAINT "clubs_fields_check" CHECK (
        "version" >= 0
        AND length(btrim("name")) BETWEEN 1 AND 120
        AND length("description") <= 1000
        AND length(btrim("locality")) BETWEEN 1 AND 120
        AND length("normalized_name") BETWEEN 1 AND 120
        AND length("normalized_locality") BETWEEN 1 AND 120
    ),
    CONSTRAINT "clubs_archive_shape_check" CHECK (
        ("state" = 'ACTIVE' AND "archived_at" IS NULL)
        OR ("state" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
    )
);
CREATE INDEX "clubs_public_search_idx" ON "clubs"("state", "normalized_name", "id");
CREATE INDEX "clubs_locality_search_idx"
    ON "clubs"("state", "normalized_locality", "normalized_name", "id");

CREATE TABLE "club_memberships" (
    "id" UUID PRIMARY KEY,
    "club_id" UUID NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "role" "club_role" NOT NULL,
    "state" "club_membership_state" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    CONSTRAINT "club_memberships_state_check" CHECK (
        "revision" >= 0 AND (
            ("state" = 'ACTIVE' AND "ended_at" IS NULL)
            OR ("state" <> 'ACTIVE' AND "ended_at" IS NOT NULL AND "ended_at" >= "joined_at")
        )
    )
);
CREATE UNIQUE INDEX "club_memberships_active_user_key"
    ON "club_memberships"("club_id", "user_id") WHERE "state" = 'ACTIVE';
CREATE UNIQUE INDEX "club_memberships_active_owner_key"
    ON "club_memberships"("club_id") WHERE "state" = 'ACTIVE' AND "role" = 'OWNER';
CREATE INDEX "club_memberships_roster_idx"
    ON "club_memberships"("club_id", "state", "role", "joined_at", "id");
CREATE INDEX "club_memberships_user_idx" ON "club_memberships"("user_id", "state", "club_id");

CREATE TABLE "club_join_requests" (
    "id" UUID PRIMARY KEY,
    "club_id" UUID NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "requester_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "club_join_request_state" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "club_join_requests_state_check" CHECK (
        "revision" >= 0 AND (
            ("state" = 'PENDING' AND "resolved_at" IS NULL)
            OR ("state" <> 'PENDING' AND "resolved_at" IS NOT NULL AND "resolved_at" >= "created_at")
        )
    )
);
CREATE UNIQUE INDEX "club_join_requests_pending_key"
    ON "club_join_requests"("club_id", "requester_id") WHERE "state" = 'PENDING';
CREATE INDEX "club_join_requests_queue_idx"
    ON "club_join_requests"("club_id", "state", "created_at", "id");

CREATE TABLE "club_invitations" (
    "id" UUID PRIMARY KEY,
    "club_id" UUID NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "invitee_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "issued_by_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "club_invitation_state" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "token_hash" CHAR(64) NOT NULL UNIQUE,
    "key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "club_invitations_token_hash_check" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "club_invitations_state_check" CHECK (
        "revision" >= 0 AND "key_version" > 0
        AND "expires_at" = "created_at" + INTERVAL '7 days'
        AND (
            ("state" = 'PENDING' AND "resolved_at" IS NULL)
            OR ("state" <> 'PENDING' AND "resolved_at" IS NOT NULL AND "resolved_at" >= "created_at")
        )
    )
);
CREATE UNIQUE INDEX "club_invitations_pending_key"
    ON "club_invitations"("club_id", "invitee_id") WHERE "state" = 'PENDING';
CREATE INDEX "club_invitations_queue_idx" ON "club_invitations"("club_id", "state", "created_at", "id");
CREATE INDEX "club_invitations_invitee_idx" ON "club_invitations"("invitee_id", "state", "expires_at");

CREATE TABLE "club_blocks" (
    "id" UUID PRIMARY KEY,
    "club_id" UUID NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "club_block_state" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "reason_code" VARCHAR(96) NOT NULL,
    "created_by_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lifted_by_user_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "lifted_at" TIMESTAMPTZ(3),
    CONSTRAINT "club_blocks_reason_check" CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    CONSTRAINT "club_blocks_state_check" CHECK (
        "revision" >= 0 AND (
            ("state" = 'ACTIVE' AND "lifted_by_user_id" IS NULL AND "lifted_at" IS NULL)
            OR ("state" = 'LIFTED' AND "lifted_by_user_id" IS NOT NULL AND "lifted_at" >= "created_at")
        )
    )
);
CREATE UNIQUE INDEX "club_blocks_active_key"
    ON "club_blocks"("club_id", "user_id") WHERE "state" = 'ACTIVE';
CREATE INDEX "club_blocks_access_idx" ON "club_blocks"("club_id", "state", "user_id");

CREATE TABLE "club_venues" (
    "club_id" UUID NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "venue_id" UUID NOT NULL REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "linked_by_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("club_id", "venue_id")
);
CREATE INDEX "club_venues_venue_idx" ON "club_venues"("venue_id", "club_id");

CREATE TABLE "recurring_match_rules" (
    "id" UUID PRIMARY KEY,
    "club_id" UUID NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "organizer_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" "recurring_match_rule_state" NOT NULL DEFAULT 'ACTIVE',
    "frequency" "recurring_match_frequency" NOT NULL DEFAULT 'WEEKLY',
    "interval_weeks" SMALLINT NOT NULL,
    "weekdays" SMALLINT[] NOT NULL,
    "local_start_time" TIME NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "tzdata_version" VARCHAR(32) NOT NULL,
    "dst_gap_policy" "recurring_dst_gap_policy" NOT NULL DEFAULT 'SKIP',
    "dst_overlap_policy" "recurring_dst_overlap_policy" NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "generated_through" DATE,
    "generation_horizon_days" SMALLINT NOT NULL DEFAULT 42,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "match_template" JSONB NOT NULL,
    "pause_reason_code" VARCHAR(96),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    CONSTRAINT "recurring_match_rules_id_club_key" UNIQUE ("id", "club_id"),
    CONSTRAINT "recurring_match_rules_bounds_check" CHECK (
        "revision" >= 0 AND "interval_weeks" BETWEEN 1 AND 12
        AND cardinality("weekdays") BETWEEN 1 AND 7
        AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
        AND "generation_horizon_days" = 42
        AND "template_version" > 0
        AND length("time_zone") BETWEEN 1 AND 64
        AND length("tzdata_version") BETWEEN 1 AND 32
        AND ("ends_on" IS NULL OR "ends_on" >= "starts_on")
        AND ("generated_through" IS NULL OR "generated_through" >= "starts_on")
        AND (("state" = 'ENDED' AND "ended_at" IS NOT NULL) OR ("state" <> 'ENDED' AND "ended_at" IS NULL))
    )
);
CREATE INDEX "recurring_match_rules_generation_idx"
    ON "recurring_match_rules"("state", "generated_through", "id");
CREATE INDEX "recurring_match_rules_club_idx"
    ON "recurring_match_rules"("club_id", "state", "created_at", "id");

CREATE FUNCTION "club_weekdays_are_unique"(days SMALLINT[]) RETURNS BOOLEAN AS $$
    SELECT cardinality(days) = (SELECT count(DISTINCT day) FROM unnest(days) AS day);
$$ LANGUAGE SQL IMMUTABLE STRICT;
ALTER TABLE "recurring_match_rules" ADD CONSTRAINT "recurring_match_rules_unique_weekdays_check"
    CHECK ("club_weekdays_are_unique"("weekdays"));

CREATE TABLE "recurring_match_occurrences" (
    "id" UUID PRIMARY KEY,
    "club_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "calendar_key" VARCHAR(16) NOT NULL,
    "local_date" DATE NOT NULL,
    "local_start_time" TIME NOT NULL,
    "state" "recurring_occurrence_state" NOT NULL,
    "starts_at" TIMESTAMPTZ(3),
    "utc_offset_minutes" SMALLINT,
    "match_id" UUID UNIQUE,
    "materialized_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurring_match_occurrences_rule_fkey"
        FOREIGN KEY ("rule_id", "club_id") REFERENCES "recurring_match_rules"("id", "club_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "recurring_match_occurrences_match_fkey"
        FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "recurring_match_occurrences_calendar_key" UNIQUE ("rule_id", "calendar_key"),
    CONSTRAINT "recurring_match_occurrences_calendar_shape_check" CHECK (
        "template_version" > 0
        AND "calendar_key" = to_char("local_date", 'YYYY-MM-DD') || 'T' || to_char("local_start_time", 'HH24:MI')
        AND (
            ("state" = 'MATERIALIZED' AND "starts_at" IS NOT NULL
                AND "utc_offset_minutes" BETWEEN -840 AND 840 AND "match_id" IS NOT NULL)
            OR ("state" IN ('SKIPPED_DST_GAP', 'SKIPPED_PAUSE')
                AND "starts_at" IS NULL AND "utc_offset_minutes" IS NULL AND "match_id" IS NULL)
        )
    )
);
CREATE INDEX "recurring_match_occurrences_club_idx"
    ON "recurring_match_occurrences"("club_id", "starts_at", "id");

CREATE TABLE "club_operation_receipts" (
    "id" UUID PRIMARY KEY,
    "club_id" UUID REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "actor_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "idempotency_key" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "canonical_path" VARCHAR(200) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT "club_operation_receipts_scope_key" UNIQUE (
        "actor_user_id", "method", "canonical_path", "idempotency_key"
    ),
    CONSTRAINT "club_operation_receipts_shape_check" CHECK (
        "method" IN ('POST', 'PATCH', 'DELETE')
        AND "request_fingerprint" ~ '^[a-f0-9]{64}$'
        AND "response_status" BETWEEN 200 AND 599
        AND "encryption_key_version" > 0
        AND "expires_at" = "created_at" + INTERVAL '24 hours'
    )
);
CREATE INDEX "club_operation_receipts_expiry_idx" ON "club_operation_receipts"("expires_at");

CREATE TABLE "club_governance_audits" (
    "id" UUID PRIMARY KEY,
    "club_id" UUID NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "operation_id" UUID NOT NULL UNIQUE,
    "actor_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "target_id" UUID,
    "action" VARCHAR(96) NOT NULL,
    "outcome" VARCHAR(32) NOT NULL,
    "reason_code" VARCHAR(96) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "club_governance_audits_shape_check" CHECK (
        "action" IN ('OWNERSHIP_TRANSFER', 'ROLE_CHANGE', 'MEMBER_EXCLUSION', 'MEMBER_BLOCK', 'BLOCK_LIFT',
            'CLUB_ARCHIVE', 'CLUB_RESTORE')
        AND "outcome" IN ('SUCCEEDED', 'DENIED', 'CONFLICT', 'FAILED')
        AND "reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'
    )
);
CREATE INDEX "club_governance_audits_club_idx" ON "club_governance_audits"("club_id", "created_at", "id");

ALTER TABLE "matches"
    ADD COLUMN "club_id" UUID REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD COLUMN "club_origin" "club_match_origin",
    ADD COLUMN "recurring_rule_id" UUID,
    ADD COLUMN "recurring_occurrence_id" UUID;
ALTER TABLE "matches" ADD CONSTRAINT "matches_recurring_rule_fkey"
    FOREIGN KEY ("recurring_rule_id", "club_id") REFERENCES "recurring_match_rules"("id", "club_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "matches" ADD CONSTRAINT "matches_recurring_occurrence_fkey"
    FOREIGN KEY ("recurring_occurrence_id") REFERENCES "recurring_match_occurrences"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "matches" ADD CONSTRAINT "matches_club_source_shape_check" CHECK (
    ("club_origin" IS NULL AND "club_id" IS NULL AND "recurring_rule_id" IS NULL AND "recurring_occurrence_id" IS NULL)
    OR ("club_origin" = 'CLUB' AND "club_id" IS NOT NULL
        AND "recurring_rule_id" IS NULL AND "recurring_occurrence_id" IS NULL)
    OR ("club_origin" = 'RECURRING_RULE' AND "club_id" IS NOT NULL
        AND "recurring_rule_id" IS NOT NULL AND "recurring_occurrence_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "matches_recurring_occurrence_key" ON "matches"("recurring_occurrence_id");
CREATE INDEX "matches_club_idx" ON "matches"("club_id", "state", "starts_at");

CREATE FUNCTION "club_assert_exactly_one_owner"("checked_club_id" UUID) RETURNS VOID AS $$
BEGIN
    IF (SELECT count(*) FROM "club_memberships"
        WHERE "club_id" = "checked_club_id" AND "state" = 'ACTIVE' AND "role" = 'OWNER') <> 1 THEN
        RAISE EXCEPTION 'club must have exactly one active owner';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "club_owner_constraint_guard"() RETURNS trigger AS $$
BEGIN
    PERFORM "club_assert_exactly_one_owner"(COALESCE(NEW."club_id", OLD."club_id"));
    IF TG_OP = 'UPDATE' AND OLD."club_id" <> NEW."club_id" THEN
        PERFORM "club_assert_exactly_one_owner"(OLD."club_id");
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "club_memberships_exactly_one_owner"
    AFTER INSERT OR UPDATE OR DELETE ON "club_memberships"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "club_owner_constraint_guard"();

CREATE FUNCTION "club_root_owner_constraint_guard"() RETURNS trigger AS $$
BEGIN
    PERFORM "club_assert_exactly_one_owner"(NEW."id");
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "clubs_exactly_one_owner"
    AFTER INSERT ON "clubs" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "club_root_owner_constraint_guard"();

CREATE FUNCTION "club_membership_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."club_id" <> OLD."club_id" OR NEW."user_id" <> OLD."user_id"
        OR NEW."joined_at" <> OLD."joined_at" THEN
        RAISE EXCEPTION 'club membership identity is immutable';
    END IF;
    IF NEW."revision" <> OLD."revision" + 1 THEN
        RAISE EXCEPTION 'club membership revision must advance once';
    END IF;
    IF OLD."state" <> 'ACTIVE' OR NEW."state" = 'ACTIVE' AND OLD."role" = NEW."role" THEN
        RAISE EXCEPTION 'terminal club membership cannot be reopened or rewritten';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "club_memberships_transition_guard" BEFORE UPDATE ON "club_memberships"
    FOR EACH ROW EXECUTE FUNCTION "club_membership_transition_guard"();

CREATE FUNCTION "club_intent_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."club_id" <> OLD."club_id" OR NEW."revision" <> OLD."revision" + 1
        OR OLD."state" <> 'PENDING' OR NEW."state" = 'PENDING' THEN
        RAISE EXCEPTION 'club intent may transition from pending exactly once';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "club_join_requests_transition_guard" BEFORE UPDATE ON "club_join_requests"
    FOR EACH ROW EXECUTE FUNCTION "club_intent_transition_guard"();
CREATE TRIGGER "club_invitations_transition_guard" BEFORE UPDATE ON "club_invitations"
    FOR EACH ROW EXECUTE FUNCTION "club_intent_transition_guard"();

CREATE FUNCTION "club_join_request_identity_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."requester_id" <> OLD."requester_id" OR NEW."created_at" <> OLD."created_at" THEN
        RAISE EXCEPTION 'club join request identity is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "club_join_requests_identity_guard" BEFORE UPDATE ON "club_join_requests"
    FOR EACH ROW EXECUTE FUNCTION "club_join_request_identity_guard"();

CREATE FUNCTION "club_invitation_identity_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."invitee_id" <> OLD."invitee_id" OR NEW."issued_by_user_id" <> OLD."issued_by_user_id"
        OR NEW."token_hash" <> OLD."token_hash" OR NEW."key_version" <> OLD."key_version"
        OR NEW."created_at" <> OLD."created_at" OR NEW."expires_at" <> OLD."expires_at" THEN
        RAISE EXCEPTION 'club invitation identity and expiry are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "club_invitations_identity_guard" BEFORE UPDATE ON "club_invitations"
    FOR EACH ROW EXECUTE FUNCTION "club_invitation_identity_guard"();

CREATE FUNCTION "club_active_intent_guard"() RETURNS trigger AS $$
DECLARE
    target_user_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "clubs" WHERE "id" = NEW."club_id" AND "state" = 'ACTIVE') THEN
        RAISE EXCEPTION 'archived club rejects new membership intent';
    END IF;
    IF TG_TABLE_NAME = 'club_memberships' THEN target_user_id := NEW."user_id";
    ELSIF TG_TABLE_NAME = 'club_join_requests' THEN target_user_id := NEW."requester_id";
    ELSE target_user_id := NEW."invitee_id";
    END IF;
    IF EXISTS (SELECT 1 FROM "club_blocks"
        WHERE "club_id" = NEW."club_id" AND "user_id" = target_user_id AND "state" = 'ACTIVE') THEN
        RAISE EXCEPTION 'club block rejects membership intent';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "club_memberships_active_intent_guard" BEFORE INSERT ON "club_memberships"
    FOR EACH ROW EXECUTE FUNCTION "club_active_intent_guard"();
CREATE TRIGGER "club_join_requests_active_intent_guard" BEFORE INSERT ON "club_join_requests"
    FOR EACH ROW EXECUTE FUNCTION "club_active_intent_guard"();
CREATE TRIGGER "club_invitations_active_intent_guard" BEFORE INSERT ON "club_invitations"
    FOR EACH ROW EXECUTE FUNCTION "club_active_intent_guard"();

CREATE FUNCTION "club_block_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."club_id" <> OLD."club_id" OR NEW."user_id" <> OLD."user_id"
        OR NEW."reason_code" <> OLD."reason_code" OR NEW."created_by_user_id" <> OLD."created_by_user_id"
        OR NEW."created_at" <> OLD."created_at" OR OLD."state" <> 'ACTIVE' OR NEW."state" <> 'LIFTED'
        OR NEW."revision" <> OLD."revision" + 1 THEN
        RAISE EXCEPTION 'club block can only transition once to lifted';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "club_blocks_transition_guard" BEFORE UPDATE ON "club_blocks"
    FOR EACH ROW EXECUTE FUNCTION "club_block_transition_guard"();

CREATE FUNCTION "club_venue_public_guard"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "clubs" WHERE "id" = NEW."club_id" AND "state" = 'ACTIVE') THEN
        RAISE EXCEPTION 'archived club rejects venue links';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "venues" WHERE "id" = NEW."venue_id"
        AND "publication_state" = 'PUBLISHED' AND "canonical_venue_id" IS NULL) THEN
        RAISE EXCEPTION 'club venue must be a public canonical venue';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "club_venues_public_guard" BEFORE INSERT OR UPDATE ON "club_venues"
    FOR EACH ROW EXECUTE FUNCTION "club_venue_public_guard"();

CREATE FUNCTION "club_resolve_local_instant"(
    local_day DATE,
    local_time TIME,
    zone_name TEXT,
    overlap_policy "recurring_dst_overlap_policy"
) RETURNS TIMESTAMPTZ AS $$
    WITH candidates AS (
        SELECT ((local_day + local_time) AT TIME ZONE 'UTC') - make_interval(mins => offset_minute) AS instant
        FROM generate_series(-840, 840) AS offset_minute
    ), valid AS (
        SELECT instant FROM candidates WHERE instant AT TIME ZONE zone_name = local_day + local_time
    )
    SELECT CASE WHEN overlap_policy = 'EARLIER_OFFSET' THEN min(instant) ELSE max(instant) END FROM valid;
$$ LANGUAGE SQL STABLE STRICT;

CREATE FUNCTION "recurring_occurrence_schedule_guard"() RETURNS trigger AS $$
DECLARE
    recurrence "recurring_match_rules"%ROWTYPE;
    resolved TIMESTAMPTZ;
BEGIN
    SELECT * INTO recurrence FROM "recurring_match_rules" WHERE "id" = NEW."rule_id" FOR UPDATE;
    IF recurrence."club_id" <> NEW."club_id" OR recurrence."local_start_time" <> NEW."local_start_time" THEN
        RAISE EXCEPTION 'occurrence must use its rule club and local wall time';
    END IF;
    IF recurrence."state" = 'ENDED'
        OR (recurrence."state" = 'PAUSED' AND NEW."state" <> 'SKIPPED_PAUSE') THEN
        RAISE EXCEPTION 'recurring occurrence is incompatible with rule state';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "clubs" WHERE "id" = NEW."club_id" AND "state" = 'ACTIVE')
        AND NEW."state" <> 'SKIPPED_PAUSE' THEN
        RAISE EXCEPTION 'archived club cannot materialize recurring matches';
    END IF;
    resolved := "club_resolve_local_instant"(
        NEW."local_date", NEW."local_start_time", recurrence."time_zone", recurrence."dst_overlap_policy"
    );
    IF NEW."state" = 'SKIPPED_DST_GAP' AND resolved IS NOT NULL THEN
        RAISE EXCEPTION 'only a nonexistent local DST time may be skipped as a gap';
    END IF;
    IF NEW."state" = 'MATERIALIZED' AND (
        resolved IS NULL OR NEW."starts_at" <> resolved
        OR NEW."utc_offset_minutes" <> extract(epoch FROM (
            NEW."local_date" + NEW."local_start_time" - (resolved AT TIME ZONE 'UTC')
        )) / 60
    ) THEN
        RAISE EXCEPTION 'occurrence UTC instant does not match explicit timezone and DST overlap policy';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "recurring_occurrences_schedule_guard" BEFORE INSERT ON "recurring_match_occurrences"
    FOR EACH ROW EXECUTE FUNCTION "recurring_occurrence_schedule_guard"();

CREATE FUNCTION "recurring_occurrence_immutable_guard"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'materialized recurring calendar positions are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "recurring_occurrences_no_update" BEFORE UPDATE OR DELETE ON "recurring_match_occurrences"
    FOR EACH ROW EXECUTE FUNCTION "recurring_occurrence_immutable_guard"();

CREATE FUNCTION "recurring_match_source_guard"() RETURNS trigger AS $$
DECLARE
    linked_occurrence "recurring_match_occurrences"%ROWTYPE;
BEGIN
    IF NEW."club_origin" = 'RECURRING_RULE' THEN
        SELECT * INTO linked_occurrence FROM "recurring_match_occurrences"
            WHERE "id" = NEW."recurring_occurrence_id";
        IF linked_occurrence."club_id" <> NEW."club_id"
            OR linked_occurrence."rule_id" <> NEW."recurring_rule_id"
            OR linked_occurrence."match_id" <> NEW."id" THEN
            RAISE EXCEPTION 'recurring match and occurrence source must be reciprocal';
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "matches_recurring_source_guard" AFTER INSERT OR UPDATE ON "matches"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "recurring_match_source_guard"();

CREATE FUNCTION "recurring_occurrence_match_guard"() RETURNS trigger AS $$
DECLARE
    linked_match "matches"%ROWTYPE;
BEGIN
    IF NEW."state" = 'MATERIALIZED' THEN
        SELECT * INTO linked_match FROM "matches" WHERE "id" = NEW."match_id";
        IF linked_match."club_origin" <> 'RECURRING_RULE'
            OR linked_match."club_id" <> NEW."club_id"
            OR linked_match."recurring_rule_id" <> NEW."rule_id"
            OR linked_match."recurring_occurrence_id" <> NEW."id" THEN
            RAISE EXCEPTION 'materialized occurrence and match source must be reciprocal';
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "recurring_occurrences_match_guard"
    AFTER INSERT ON "recurring_match_occurrences" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "recurring_occurrence_match_guard"();

CREATE FUNCTION "club_match_source_immutable_guard"() RETURNS trigger AS $$
BEGIN
    IF OLD."state" <> 'DRAFT' AND (
        NEW."club_id" IS DISTINCT FROM OLD."club_id"
        OR NEW."club_origin" IS DISTINCT FROM OLD."club_origin"
        OR NEW."recurring_rule_id" IS DISTINCT FROM OLD."recurring_rule_id"
        OR NEW."recurring_occurrence_id" IS DISTINCT FROM OLD."recurring_occurrence_id"
    ) THEN RAISE EXCEPTION 'published club attribution is immutable'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "matches_club_source_immutable_guard" BEFORE UPDATE ON "matches"
    FOR EACH ROW EXECUTE FUNCTION "club_match_source_immutable_guard"();

CREATE FUNCTION "club_rule_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."club_id" <> OLD."club_id" OR NEW."organizer_id" <> OLD."organizer_id"
        OR NEW."frequency" <> OLD."frequency" OR NEW."starts_on" <> OLD."starts_on"
        OR NEW."time_zone" <> OLD."time_zone" OR NEW."tzdata_version" <> OLD."tzdata_version"
        OR NEW."dst_gap_policy" <> OLD."dst_gap_policy"
        OR (OLD."generated_through" IS NOT NULL AND (
            NEW."generated_through" IS NULL OR NEW."generated_through" < OLD."generated_through"
        ))
        OR NEW."revision" <> OLD."revision" + 1 THEN
        RAISE EXCEPTION 'recurring rule identity is immutable and watermark is monotonic';
    END IF;
    IF OLD."state" = 'ENDED' OR (OLD."state" = 'PAUSED' AND NEW."state" = 'ACTIVE'
        AND NEW."generated_through" < CURRENT_DATE) THEN
        RAISE EXCEPTION 'ended rules are terminal and resumed rules cannot backfill';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "recurring_match_rules_transition_guard" BEFORE UPDATE ON "recurring_match_rules"
    FOR EACH ROW EXECUTE FUNCTION "club_rule_transition_guard"();

CREATE FUNCTION "club_rule_creation_guard"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "clubs" WHERE "id" = NEW."club_id" AND "state" = 'ACTIVE') THEN
        RAISE EXCEPTION 'archived club rejects recurring rules';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW."time_zone") THEN
        RAISE EXCEPTION 'recurring rule requires a recognized IANA timezone';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "recurring_match_rules_creation_guard" BEFORE INSERT OR UPDATE OF "time_zone" ON "recurring_match_rules"
    FOR EACH ROW EXECUTE FUNCTION "club_rule_creation_guard"();

CREATE TRIGGER "clubs_no_delete" BEFORE DELETE ON "clubs"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "club_memberships_no_delete" BEFORE DELETE ON "club_memberships"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "club_join_requests_no_delete" BEFORE DELETE ON "club_join_requests"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "club_invitations_no_delete" BEFORE DELETE ON "club_invitations"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "club_blocks_no_delete" BEFORE DELETE ON "club_blocks"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "club_governance_audits_no_update" BEFORE UPDATE OR DELETE ON "club_governance_audits"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();

REVOKE UPDATE, DELETE, TRUNCATE ON "club_governance_audits" FROM PUBLIC;
