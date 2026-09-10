CREATE TYPE "match_format" AS ENUM ('SINGLES', 'DOUBLES');
CREATE TYPE "match_visibility" AS ENUM ('PUBLIC', 'UNLISTED');
CREATE TYPE "match_join_mode" AS ENUM ('AUTO', 'APPROVAL');
CREATE TYPE "match_state" AS ENUM (
    'DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'AWAITING_CONFIRMATION',
    'DISPUTED', 'CANCELLED', 'COMPLETED', 'VOIDED'
);
CREATE TYPE "match_team_code" AS ENUM ('TEAM_A', 'TEAM_B');
CREATE TYPE "match_team_choice" AS ENUM ('TEAM_A', 'TEAM_B', 'ANY');
CREATE TYPE "match_participant_state" AS ENUM ('ACTIVE', 'LEFT', 'CANCELLED', 'PLAYED');
CREATE TYPE "match_join_request_state" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');
CREATE TYPE "match_waitlist_state" AS ENUM ('WAITING', 'OFFERED', 'PROMOTED', 'WITHDRAWN', 'SKIPPED', 'EXPIRED');
CREATE TYPE "match_result_state" AS ENUM ('PROPOSED', 'SUPERSEDED', 'CONFIRMED', 'DISPUTED', 'VOIDED');
CREATE TYPE "match_result_mode" AS ENUM ('SCORED', 'PLAYED_WITHOUT_SCORE');
CREATE TYPE "match_series_format" AS ENUM ('BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5');
CREATE TYPE "result_confirmation_decision" AS ENUM ('CONFIRMED', 'DISPUTED');
CREATE TYPE "match_metric_type" AS ENUM ('CONFIRMED_MATCH');
CREATE TYPE "external_booking_state" AS ENUM ('UNKNOWN', 'NOT_BOOKED', 'BOOKED_EXTERNALLY');

CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "state" "match_state" NOT NULL DEFAULT 'DRAFT',
    "format" "match_format",
    "visibility" "match_visibility",
    "join_mode" "match_join_mode",
    "starts_at" TIMESTAMPTZ(3),
    "time_zone" VARCHAR(64),
    "venue_id" UUID,
    "venue_candidate_id" UUID,
    "skill_min" DECIMAL(2, 1),
    "skill_max" DECIMAL(2, 1),
    "description" VARCHAR(1000),
    "booking_state" "external_booking_state" NOT NULL DEFAULT 'UNKNOWN',
    "booking_note" VARCHAR(280),
    "policy_version" VARCHAR(64),
    "waitlist_sequence" BIGINT NOT NULL DEFAULT 0,
    "roster_completion_sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "matches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "matches_version_check" CHECK (
        "version" >= 0 AND "waitlist_sequence" >= 0 AND "roster_completion_sequence" >= 0
    ),
    CONSTRAINT "matches_venue_choice_check" CHECK (num_nonnulls("venue_id", "venue_candidate_id") <= 1),
    CONSTRAINT "matches_skill_range_check" CHECK (
        ("skill_min" IS NULL AND "skill_max" IS NULL) OR
        ("skill_min" BETWEEN 1.0 AND 5.0 AND "skill_max" BETWEEN 1.0 AND 5.0 AND
            "skill_min" <= "skill_max" AND
            mod(("skill_min" * 10)::INTEGER, 5) = 0 AND mod(("skill_max" * 10)::INTEGER, 5) = 0)
    ),
    CONSTRAINT "matches_text_check" CHECK (
        ("time_zone" IS NULL OR length(btrim("time_zone")) BETWEEN 1 AND 64) AND
        ("description" IS NULL OR length(btrim("description")) BETWEEN 1 AND 1000) AND
        ("booking_note" IS NULL OR length("booking_note") <= 280) AND
        ("policy_version" IS NULL OR length(btrim("policy_version")) BETWEEN 1 AND 64)
    ),
    CONSTRAINT "matches_booking_check" CHECK (
        ("booking_state" = 'BOOKED_EXTERNALLY') OR "booking_note" IS NULL
    ),
    CONSTRAINT "matches_publish_shape_check" CHECK (
        "state" = 'DRAFT' OR
        ("format" IS NOT NULL AND "visibility" IS NOT NULL AND "join_mode" IS NOT NULL AND
            "starts_at" IS NOT NULL AND "time_zone" IS NOT NULL AND
            num_nonnulls("venue_id", "venue_candidate_id") = 1 AND
            "skill_min" IS NOT NULL AND "skill_max" IS NOT NULL AND "description" IS NOT NULL AND
            "policy_version" IS NOT NULL AND "published_at" IS NOT NULL)
    ),
    CONSTRAINT "matches_timestamps_check" CHECK (
        "created_at" <= "updated_at" AND ("published_at" IS NULL OR "published_at" >= "created_at")
    )
);

CREATE INDEX "matches_public_search_idx"
    ON "matches" ("visibility", "state", "starts_at", "id")
    WHERE "visibility" = 'PUBLIC' AND "state" = 'PUBLISHED';
CREATE INDEX "matches_organizer_idx" ON "matches" ("organizer_id", "state", "updated_at");
ALTER TABLE "matches" ADD CONSTRAINT "matches_organizer_id_fkey"
    FOREIGN KEY ("organizer_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_candidate_id_fkey"
    FOREIGN KEY ("venue_candidate_id") REFERENCES "venue_candidates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_candidates" ADD CONSTRAINT "venue_candidates_source_match_id_fkey"
    FOREIGN KEY ("source_match_id") REFERENCES "matches" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE "match_teams" (
    "match_id" UUID NOT NULL,
    "code" "match_team_code" NOT NULL,
    "capacity" SMALLINT NOT NULL,
    CONSTRAINT "match_teams_pkey" PRIMARY KEY ("match_id", "code"),
    CONSTRAINT "match_teams_capacity_check" CHECK ("capacity" BETWEEN 1 AND 2),
    CONSTRAINT "match_teams_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE "match_participants" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "team" "match_team_code" NOT NULL,
    "state" "match_participant_state" NOT NULL DEFAULT 'ACTIVE',
    "is_organizer" BOOLEAN NOT NULL DEFAULT FALSE,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "match_participants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_participants_match_user_key" UNIQUE ("match_id", "user_id"),
    CONSTRAINT "match_participants_state_shape_check" CHECK (
        ("state" = 'ACTIVE') = ("resolved_at" IS NULL)
    ),
    CONSTRAINT "match_participants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "match_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "match_participants_team_fkey" FOREIGN KEY ("match_id", "team")
        REFERENCES "match_teams" ("match_id", "code") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "match_participants_organizer_key" ON "match_participants" ("match_id")
    WHERE "is_organizer";
CREATE INDEX "match_participants_roster_idx" ON "match_participants" ("match_id", "state", "team");

CREATE TABLE "match_guest_slots" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "team" "match_team_code" NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_guest_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_guest_slots_label_check" CHECK (
        length(btrim("label")) BETWEEN 1 AND 50 AND
        "label" !~ '[[:cntrl:]]' AND "label" !~* '(https?://|www\\.|@)'
    ),
    CONSTRAINT "match_guest_slots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "match_guest_slots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "identity_users" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "match_guest_slots_team_fkey" FOREIGN KEY ("match_id", "team")
        REFERENCES "match_teams" ("match_id", "code") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "match_guest_slots_team_idx" ON "match_guest_slots" ("match_id", "team");

CREATE TABLE "join_requests" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "team_choice" "match_team_choice" NOT NULL,
    "state" "match_join_request_state" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "join_requests_state_shape_check" CHECK (("state" = 'PENDING') = ("decided_at" IS NULL)),
    CONSTRAINT "join_requests_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "join_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "identity_users" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "join_requests_active_player_key" ON "join_requests" ("match_id", "requester_id")
    WHERE "state" = 'PENDING';
CREATE INDEX "join_requests_pending_idx" ON "join_requests" ("match_id", "state", "created_at", "id");

CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "team_choice" "match_team_choice" NOT NULL,
    "state" "match_waitlist_state" NOT NULL DEFAULT 'WAITING',
    "sequence" BIGINT NOT NULL,
    "offered_team" "match_team_code",
    "offered_at" TIMESTAMPTZ(3),
    "offer_expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "waitlist_entries_match_sequence_key" UNIQUE ("match_id", "sequence"),
    CONSTRAINT "waitlist_entries_sequence_check" CHECK ("sequence" > 0),
    CONSTRAINT "waitlist_entries_offer_shape_check" CHECK (
        ("state" = 'WAITING' AND "offered_team" IS NULL AND "offered_at" IS NULL AND
            "offer_expires_at" IS NULL AND "resolved_at" IS NULL) OR
        ("state" = 'OFFERED' AND "offered_team" IS NOT NULL AND "offered_at" IS NOT NULL AND
            "offer_expires_at" > "offered_at" AND "resolved_at" IS NULL) OR
        ("state" NOT IN ('WAITING', 'OFFERED') AND "resolved_at" IS NOT NULL)
    ),
    CONSTRAINT "waitlist_entries_team_choice_check" CHECK (
        "offered_team" IS NULL OR "team_choice" = 'ANY' OR "team_choice"::TEXT = "offered_team"::TEXT
    ),
    CONSTRAINT "waitlist_entries_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "waitlist_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "identity_users" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "waitlist_entries_active_player_key" ON "waitlist_entries" ("match_id", "player_id")
    WHERE "state" IN ('WAITING', 'OFFERED');
CREATE UNIQUE INDEX "waitlist_entries_active_offer_key" ON "waitlist_entries" ("match_id", "offered_team")
    WHERE "state" = 'OFFERED';
CREATE INDEX "waitlist_entries_fifo_idx" ON "waitlist_entries" ("match_id", "state", "sequence");

CREATE TABLE "match_invites" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "match_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_invites_match_version_key" UNIQUE ("match_id", "version"),
    CONSTRAINT "match_invites_token_hash_key" UNIQUE ("token_hash"),
    CONSTRAINT "match_invites_secret_shape_check" CHECK (
        "version" > 0 AND "key_version" > 0 AND "token_hash" ~ '^[0-9a-f]{64}$' AND
        "expires_at" > "created_at" AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    ),
    CONSTRAINT "match_invites_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "match_invites_active_key" ON "match_invites" ("match_id") WHERE "revoked_at" IS NULL;

CREATE TABLE "match_results" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "state" "match_result_state" NOT NULL DEFAULT 'PROPOSED',
    "mode" "match_result_mode" NOT NULL,
    "series_format" "match_series_format",
    "winning_team" "match_team_code",
    "proposed_by" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_results_match_version_key" UNIQUE ("match_id", "version"),
    CONSTRAINT "match_results_version_check" CHECK ("version" > 0),
    CONSTRAINT "match_results_mode_shape_check" CHECK (
        ("mode" = 'SCORED' AND "series_format" IS NOT NULL AND "winning_team" IS NOT NULL) OR
        ("mode" = 'PLAYED_WITHOUT_SCORE' AND "series_format" IS NULL AND "winning_team" IS NULL)
    ),
    CONSTRAINT "match_results_state_shape_check" CHECK (
        ("state" = 'PROPOSED' AND "resolved_at" IS NULL) OR
        ("state" <> 'PROPOSED' AND "resolved_at" IS NOT NULL)
    ),
    CONSTRAINT "match_results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "match_results_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "identity_users" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "match_results_current_key" ON "match_results" ("match_id")
    WHERE "state" IN ('PROPOSED', 'DISPUTED', 'CONFIRMED');
CREATE INDEX "match_results_current_idx" ON "match_results" ("match_id", "state");

CREATE TABLE "game_scores" (
    "result_id" UUID NOT NULL,
    "game_number" SMALLINT NOT NULL,
    "team_a_points" SMALLINT NOT NULL,
    "team_b_points" SMALLINT NOT NULL,
    CONSTRAINT "game_scores_pkey" PRIMARY KEY ("result_id", "game_number"),
    CONSTRAINT "game_scores_number_check" CHECK ("game_number" BETWEEN 1 AND 5),
    CONSTRAINT "game_scores_points_check" CHECK (
        "team_a_points" BETWEEN 0 AND 99 AND "team_b_points" BETWEEN 0 AND 99 AND
        greatest("team_a_points", "team_b_points") >= 11 AND
        abs("team_a_points" - "team_b_points") >= 2
    ),
    CONSTRAINT "game_scores_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "match_results" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE "result_confirmations" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "decision" "result_confirmation_decision" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "result_confirmations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "result_confirmations_result_player_key" UNIQUE ("result_id", "player_id"),
    CONSTRAINT "result_confirmations_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "match_results" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "result_confirmations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "identity_users" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "match_metric_markers" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "metric_type" "match_metric_type" NOT NULL,
    "confirmation_path" VARCHAR(16) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "match_metric_markers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_metric_markers_effective_key" UNIQUE ("match_id", "metric_type"),
    CONSTRAINT "match_metric_markers_result_key" UNIQUE ("result_id", "metric_type"),
    CONSTRAINT "match_metric_markers_path_check" CHECK ("confirmation_path" IN ('PLAYER', 'MODERATOR')),
    CONSTRAINT "match_metric_markers_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "match_metric_markers_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "match_results" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "match_idempotency_records" (
    "id" UUID NOT NULL,
    "match_id" UUID,
    "user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "canonical_path" VARCHAR(200) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT "match_idempotency_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_idempotency_scope_key" UNIQUE ("user_id", "method", "canonical_path", "idempotency_key"),
    CONSTRAINT "match_idempotency_expiry_check" CHECK ("expires_at" = "created_at" + INTERVAL '24 hours'),
    CONSTRAINT "match_idempotency_shape_check" CHECK (
        "method" IN ('POST', 'PATCH', 'DELETE') AND "request_fingerprint" ~ '^[0-9a-f]{64}$' AND
        "response_status" BETWEEN 200 AND 599 AND "encryption_key_version" > 0
    ),
    CONSTRAINT "match_idempotency_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "match_idempotency_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "match_idempotency_expiry_idx" ON "match_idempotency_records" ("expires_at");

CREATE FUNCTION match_lock_aggregate(target_match_id UUID) RETURNS VOID AS $$
BEGIN
    PERFORM 1 FROM "matches" WHERE "id" = target_match_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'match aggregate does not exist' USING ERRCODE = '23503';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION match_check_teams() RETURNS TRIGGER AS $$
DECLARE
    target_id UUID;
    target_format "match_format";
    team_count INTEGER;
    invalid_count INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'matches' THEN
        target_id := COALESCE(NEW."id", OLD."id");
    ELSE
        target_id := COALESCE(NEW."match_id", OLD."match_id");
    END IF;
    SELECT "format" INTO target_format FROM "matches" WHERE "id" = target_id;
    IF target_format IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT count(*), count(*) FILTER (WHERE "capacity" <> CASE target_format WHEN 'SINGLES' THEN 1 ELSE 2 END)
        INTO team_count, invalid_count FROM "match_teams" WHERE "match_id" = target_id;
    IF team_count <> 2 OR invalid_count <> 0 OR
        NOT EXISTS (SELECT 1 FROM "match_teams" WHERE "match_id" = target_id AND "code" = 'TEAM_A') OR
        NOT EXISTS (SELECT 1 FROM "match_teams" WHERE "match_id" = target_id AND "code" = 'TEAM_B') OR
        NOT EXISTS (
            SELECT 1 FROM "matches" m JOIN "match_participants" p
                ON p."match_id" = m."id" AND p."user_id" = m."organizer_id"
            WHERE m."id" = target_id AND p."team" = 'TEAM_A' AND p."is_organizer" AND (
                (m."state" = 'CANCELLED' AND p."state" = 'CANCELLED') OR
                (m."state" = 'COMPLETED' AND p."state" = 'PLAYED') OR
                (m."state" NOT IN ('CANCELLED', 'COMPLETED') AND p."state" = 'ACTIVE')
            )
        ) THEN
        RAISE EXCEPTION 'match must have exactly two correctly sized teams' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER matches_teams_guard
    AFTER INSERT OR UPDATE OF "format", "state" ON "matches"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION match_check_teams();
CREATE CONSTRAINT TRIGGER match_teams_shape_guard
    AFTER INSERT OR UPDATE OR DELETE ON "match_teams"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION match_check_teams();
CREATE CONSTRAINT TRIGGER match_participants_organizer_guard
    AFTER INSERT OR UPDATE OR DELETE ON "match_participants"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION match_check_teams();

CREATE FUNCTION match_check_capacity_and_involvement() RETURNS TRIGGER AS $$
DECLARE
    target_id UUID := COALESCE(NEW."match_id", OLD."match_id");
    capacity_row RECORD;
    duplicate_count INTEGER;
BEGIN
    PERFORM match_lock_aggregate(target_id);
    FOR capacity_row IN
        SELECT t."code", t."capacity",
            (SELECT count(*) FROM "match_participants" p
                WHERE p."match_id" = target_id AND p."team" = t."code" AND p."state" = 'ACTIVE') +
            (SELECT count(*) FROM "match_guest_slots" g
                WHERE g."match_id" = target_id AND g."team" = t."code") +
            (SELECT count(*) FROM "waitlist_entries" w
                WHERE w."match_id" = target_id AND w."offered_team" = t."code" AND w."state" = 'OFFERED') AS occupied
        FROM "match_teams" t WHERE t."match_id" = target_id
    LOOP
        IF capacity_row.occupied > capacity_row.capacity THEN
            RAISE EXCEPTION 'match team capacity exceeded' USING ERRCODE = '23514';
        END IF;
    END LOOP;

    SELECT count(*) INTO duplicate_count FROM (
        SELECT "user_id" AS player_id FROM "match_participants"
            WHERE "match_id" = target_id AND "state" = 'ACTIVE'
        UNION ALL
        SELECT "requester_id" FROM "join_requests"
            WHERE "match_id" = target_id AND "state" = 'PENDING'
        UNION ALL
        SELECT "player_id" FROM "waitlist_entries"
            WHERE "match_id" = target_id AND "state" IN ('WAITING', 'OFFERED')
    ) active GROUP BY player_id HAVING count(*) > 1 LIMIT 1;
    IF duplicate_count IS NOT NULL THEN
        RAISE EXCEPTION 'player has more than one active match involvement' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER match_participants_capacity_guard
    AFTER INSERT OR UPDATE OR DELETE ON "match_participants"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION match_check_capacity_and_involvement();
CREATE CONSTRAINT TRIGGER match_guests_capacity_guard
    AFTER INSERT OR UPDATE OR DELETE ON "match_guest_slots"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION match_check_capacity_and_involvement();
CREATE CONSTRAINT TRIGGER join_requests_involvement_guard
    AFTER INSERT OR UPDATE OR DELETE ON "join_requests"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION match_check_capacity_and_involvement();
CREATE CONSTRAINT TRIGGER waitlist_capacity_guard
    AFTER INSERT OR UPDATE OR DELETE ON "waitlist_entries"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION match_check_capacity_and_involvement();

CREATE FUNCTION match_protect_transition() RETURNS TRIGGER AS $$
BEGIN
    IF NEW."organizer_id" <> OLD."organizer_id" OR NEW."created_at" <> OLD."created_at" OR
        NEW."version" <> OLD."version" + 1 THEN
        RAISE EXCEPTION 'immutable match identity or non-monotonic version' USING ERRCODE = '23514';
    END IF;
    IF OLD."state" <> NEW."state" AND NOT (
        (OLD."state" = 'DRAFT' AND NEW."state" IN ('PUBLISHED', 'CANCELLED')) OR
        (OLD."state" = 'PUBLISHED' AND NEW."state" IN ('IN_PROGRESS', 'CANCELLED')) OR
        (OLD."state" = 'IN_PROGRESS' AND NEW."state" = 'AWAITING_CONFIRMATION') OR
        (OLD."state" = 'AWAITING_CONFIRMATION' AND NEW."state" IN ('COMPLETED', 'DISPUTED')) OR
        (OLD."state" = 'DISPUTED' AND NEW."state" IN ('COMPLETED', 'VOIDED'))
    ) THEN
        RAISE EXCEPTION 'invalid match state transition' USING ERRCODE = '23514';
    END IF;
    IF OLD."state" <> 'DRAFT' AND (
        NEW."format" IS DISTINCT FROM OLD."format" OR NEW."visibility" IS DISTINCT FROM OLD."visibility" OR
        NEW."join_mode" IS DISTINCT FROM OLD."join_mode" OR NEW."skill_min" IS DISTINCT FROM OLD."skill_min" OR
        NEW."skill_max" IS DISTINCT FROM OLD."skill_max"
    ) THEN
        RAISE EXCEPTION 'published match rules are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER matches_protect_transition BEFORE UPDATE ON "matches"
    FOR EACH ROW EXECUTE FUNCTION match_protect_transition();

CREATE FUNCTION match_protect_child_transition() RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'match_participants' THEN
        IF OLD."match_id" <> NEW."match_id" OR OLD."user_id" <> NEW."user_id" OR OLD."team" <> NEW."team" OR
            OLD."state" <> NEW."state" AND NOT (OLD."state" = 'ACTIVE' AND NEW."state" IN ('LEFT', 'CANCELLED', 'PLAYED')) THEN
            RAISE EXCEPTION 'invalid participant transition' USING ERRCODE = '23514';
        END IF;
    ELSIF TG_TABLE_NAME = 'join_requests' THEN
        IF OLD."match_id" <> NEW."match_id" OR OLD."requester_id" <> NEW."requester_id" OR
            OLD."team_choice" <> NEW."team_choice" OR OLD."state" <> 'PENDING' OR
            NEW."state" NOT IN ('APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED') THEN
            RAISE EXCEPTION 'invalid join request transition' USING ERRCODE = '23514';
        END IF;
    ELSIF TG_TABLE_NAME = 'waitlist_entries' THEN
        IF OLD."match_id" <> NEW."match_id" OR OLD."player_id" <> NEW."player_id" OR
            OLD."team_choice" <> NEW."team_choice" OR OLD."sequence" <> NEW."sequence" OR NOT (
                (OLD."state" = 'WAITING' AND NEW."state" IN ('OFFERED', 'PROMOTED', 'WITHDRAWN', 'SKIPPED', 'EXPIRED')) OR
                (OLD."state" = 'OFFERED' AND NEW."state" IN ('PROMOTED', 'SKIPPED', 'EXPIRED', 'WITHDRAWN'))
            ) THEN
            RAISE EXCEPTION 'invalid waitlist transition' USING ERRCODE = '23514';
        END IF;
    ELSIF TG_TABLE_NAME = 'match_results' THEN
        IF OLD."match_id" <> NEW."match_id" OR OLD."version" <> NEW."version" OR OLD."mode" <> NEW."mode" OR
            OLD."series_format" IS DISTINCT FROM NEW."series_format" OR
            OLD."winning_team" IS DISTINCT FROM NEW."winning_team" OR OLD."proposed_by" <> NEW."proposed_by" OR NOT (
                (OLD."state" = 'PROPOSED' AND NEW."state" IN ('SUPERSEDED', 'CONFIRMED', 'DISPUTED')) OR
                (OLD."state" = 'DISPUTED' AND NEW."state" IN ('CONFIRMED', 'VOIDED'))
            ) THEN
            RAISE EXCEPTION 'invalid or mutable result transition' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER match_participants_protect_transition BEFORE UPDATE ON "match_participants"
    FOR EACH ROW EXECUTE FUNCTION match_protect_child_transition();
CREATE TRIGGER join_requests_protect_transition BEFORE UPDATE ON "join_requests"
    FOR EACH ROW EXECUTE FUNCTION match_protect_child_transition();
CREATE TRIGGER waitlist_entries_protect_transition BEFORE UPDATE ON "waitlist_entries"
    FOR EACH ROW EXECUTE FUNCTION match_protect_child_transition();
CREATE TRIGGER match_results_protect_transition BEFORE UPDATE ON "match_results"
    FOR EACH ROW EXECUTE FUNCTION match_protect_child_transition();

CREATE FUNCTION match_check_fifo() RETURNS TRIGGER AS $$
DECLARE
    root_sequence BIGINT;
BEGIN
    PERFORM match_lock_aggregate(NEW."match_id");
    SELECT "waitlist_sequence" INTO root_sequence FROM "matches" WHERE "id" = NEW."match_id";
    IF NEW."sequence" > root_sequence THEN
        RAISE EXCEPTION 'waitlist sequence was not allocated by aggregate' USING ERRCODE = '23514';
    END IF;
    IF NEW."state" IN ('OFFERED', 'PROMOTED') AND EXISTS (
        SELECT 1 FROM "waitlist_entries" earlier
        WHERE earlier."match_id" = NEW."match_id" AND earlier."sequence" < NEW."sequence"
          AND earlier."state" IN ('WAITING', 'OFFERED')
          AND (earlier."team_choice" = 'ANY' OR NEW."offered_team" IS NULL OR
               earlier."team_choice"::TEXT = NEW."offered_team"::TEXT)
    ) THEN
        RAISE EXCEPTION 'waitlist FIFO order violated' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER waitlist_entries_fifo_guard AFTER INSERT OR UPDATE ON "waitlist_entries"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION match_check_fifo();

CREATE FUNCTION match_check_score_series(target_result_id UUID) RETURNS VOID AS $$
DECLARE
    current_result RECORD;
    games_count INTEGER;
    wins_a INTEGER;
    wins_b INTEGER;
    target_wins INTEGER;
BEGIN
    SELECT * INTO current_result FROM "match_results" WHERE "id" = target_result_id;
    SELECT count(*), count(*) FILTER (WHERE "team_a_points" > "team_b_points"),
        count(*) FILTER (WHERE "team_b_points" > "team_a_points")
        INTO games_count, wins_a, wins_b FROM "game_scores" WHERE "result_id" = target_result_id;
    IF current_result."mode" = 'PLAYED_WITHOUT_SCORE' THEN
        IF games_count <> 0 THEN
            RAISE EXCEPTION 'unscored result cannot contain games' USING ERRCODE = '23514';
        END IF;
        RETURN;
    END IF;
    target_wins := CASE current_result."series_format" WHEN 'BEST_OF_1' THEN 1 WHEN 'BEST_OF_3' THEN 2 ELSE 3 END;
    IF games_count < target_wins OR games_count > target_wins * 2 - 1 OR
        greatest(wins_a, wins_b) <> target_wins OR least(wins_a, wins_b) >= target_wins OR
        (current_result."winning_team" = 'TEAM_A' AND wins_a <> target_wins) OR
        (current_result."winning_team" = 'TEAM_B' AND wins_b <> target_wins) OR
        EXISTS (SELECT 1 FROM "game_scores" WHERE "result_id" = target_result_id AND "game_number" > games_count) THEN
        RAISE EXCEPTION 'invalid completed best-of score series' USING ERRCODE = '23514';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION match_score_series_trigger() RETURNS TRIGGER AS $$
DECLARE
    target_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'game_scores' THEN
        target_id := COALESCE(NEW."result_id", OLD."result_id");
    ELSE
        target_id := COALESCE(NEW."id", OLD."id");
    END IF;
    PERFORM match_check_score_series(target_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER game_scores_series_guard AFTER INSERT OR UPDATE OR DELETE ON "game_scores"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION match_score_series_trigger();
CREATE CONSTRAINT TRIGGER match_results_series_guard AFTER INSERT OR UPDATE ON "match_results"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION match_score_series_trigger();

CREATE FUNCTION match_check_result_confirmation() RETURNS TRIGGER AS $$
DECLARE
    result_row RECORD;
    confirmer_team "match_team_code";
    proposer_team "match_team_code";
BEGIN
    SELECT r."match_id", r."version", r."state", r."proposed_by" INTO result_row
        FROM "match_results" r WHERE r."id" = NEW."result_id" FOR UPDATE;
    SELECT "team" INTO confirmer_team FROM "match_participants"
        WHERE "match_id" = result_row."match_id" AND "user_id" = NEW."player_id" AND "state" = 'ACTIVE';
    SELECT "team" INTO proposer_team FROM "match_participants"
        WHERE "match_id" = result_row."match_id" AND "user_id" = result_row."proposed_by";
    IF confirmer_team IS NULL OR proposer_team IS NULL OR confirmer_team = proposer_team OR
        result_row."state" NOT IN ('PROPOSED', 'CONFIRMED', 'DISPUTED') THEN
        RAISE EXCEPTION 'result confirmation requires an active opposite-team player' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER result_confirmations_eligibility_guard BEFORE INSERT ON "result_confirmations"
    FOR EACH ROW EXECUTE FUNCTION match_check_result_confirmation();

CREATE FUNCTION match_check_result_alignment() RETURNS TRIGGER AS $$
DECLARE
    target_id UUID;
    match_status "match_state";
    effective_status "match_result_state";
BEGIN
    IF TG_TABLE_NAME = 'matches' THEN
        target_id := COALESCE(NEW."id", OLD."id");
    ELSE
        target_id := COALESCE(NEW."match_id", OLD."match_id");
    END IF;
    PERFORM match_lock_aggregate(target_id);
    SELECT "state" INTO match_status FROM "matches" WHERE "id" = target_id;
    SELECT "state" INTO effective_status FROM "match_results"
        WHERE "match_id" = target_id AND "state" IN ('PROPOSED', 'DISPUTED', 'CONFIRMED') LIMIT 1;
    IF (match_status = 'AWAITING_CONFIRMATION' AND effective_status IS DISTINCT FROM 'PROPOSED') OR
       (match_status = 'DISPUTED' AND effective_status IS DISTINCT FROM 'DISPUTED') OR
       (match_status = 'COMPLETED' AND effective_status IS DISTINCT FROM 'CONFIRMED') OR
       (match_status = 'VOIDED' AND EXISTS (SELECT 1 FROM "match_results" WHERE "match_id" = target_id AND "state" <> 'VOIDED')) OR
       (match_status NOT IN ('AWAITING_CONFIRMATION', 'DISPUTED', 'COMPLETED', 'VOIDED') AND effective_status IS NOT NULL) THEN
        RAISE EXCEPTION 'match and effective result states are inconsistent' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER matches_result_alignment_guard AFTER INSERT OR UPDATE ON "matches"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION match_check_result_alignment();
CREATE CONSTRAINT TRIGGER match_results_alignment_guard AFTER INSERT OR UPDATE OR DELETE ON "match_results"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION match_check_result_alignment();

CREATE FUNCTION match_check_metric_marker() RETURNS TRIGGER AS $$
BEGIN
    PERFORM match_lock_aggregate(NEW."match_id");
    IF NOT EXISTS (
        SELECT 1 FROM "matches" m JOIN "match_results" r ON r."match_id" = m."id"
        WHERE m."id" = NEW."match_id" AND m."state" = 'COMPLETED' AND
            r."id" = NEW."result_id" AND r."state" = 'CONFIRMED'
    ) THEN
        RAISE EXCEPTION 'metric marker requires the confirmed effective result' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER match_metric_markers_effective_guard BEFORE INSERT ON "match_metric_markers"
    FOR EACH ROW EXECUTE FUNCTION match_check_metric_marker();

CREATE FUNCTION match_reject_immutable_change() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'confirmed outcome records are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER match_metric_markers_reject_update BEFORE UPDATE OR DELETE ON "match_metric_markers"
    FOR EACH ROW EXECUTE FUNCTION match_reject_immutable_change();
CREATE TRIGGER result_confirmations_reject_update BEFORE UPDATE OR DELETE ON "result_confirmations"
    FOR EACH ROW EXECUTE FUNCTION match_reject_immutable_change();
