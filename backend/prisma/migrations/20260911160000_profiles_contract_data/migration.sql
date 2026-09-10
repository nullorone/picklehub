CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "profile_visibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "external_profile_provider" AS ENUM ('DUPR');
CREATE TYPE "profile_avatar_state" AS ENUM ('PENDING_UPLOAD', 'PENDING_SCAN', 'ACTIVE', 'REJECTED');
CREATE TYPE "profile_projection_generation_state" AS ENUM
    ('BUILDING', 'READY', 'ACTIVE', 'SUPERSEDED', 'FAILED');
CREATE TYPE "player_statistic_slice" AS ENUM ('ALL', 'SINGLES', 'DOUBLES');
CREATE TYPE "player_statistic_outcome" AS ENUM ('PLAYED_WITHOUT_SCORE', 'WON', 'LOST', 'EXCLUDED');
CREATE TYPE "player_reliability_contribution_kind" AS ENUM
    ('ORGANIZED_SUCCESS', 'ORGANIZED_FAILURE', 'CONFIRMED_NO_SHOW');

CREATE FUNCTION "profile_distinct_match_formats"(values_to_check "match_format"[]) RETURNS BOOLEAN AS $$
    SELECT cardinality(values_to_check) = cardinality(ARRAY(SELECT DISTINCT unnest(values_to_check)));
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE TABLE "player_profiles" (
    "user_id" UUID PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "visibility" "profile_visibility" NOT NULL DEFAULT 'PUBLIC',
    "display_name" VARCHAR(50) NOT NULL,
    "locality_id" UUID NOT NULL,
    "game_formats" "match_format"[] NOT NULL DEFAULT ARRAY[]::"match_format"[],
    "skill_self_assessment" DECIMAL(2, 1) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "active_avatar_asset_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_profiles_user_fkey" FOREIGN KEY ("user_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "player_profiles_locality_fkey" FOREIGN KEY ("locality_id")
        REFERENCES "onboarding_localities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "player_profiles_version_check" CHECK ("version" >= 0),
    CONSTRAINT "player_profiles_formats_check" CHECK (
        cardinality("game_formats") BETWEEN 1 AND 2
        AND "profile_distinct_match_formats"("game_formats")
    ),
    CONSTRAINT "player_profiles_skill_check" CHECK (
        "skill_self_assessment" BETWEEN 1.0 AND 5.0
        AND mod("skill_self_assessment" * 10, 5) = 0
    )
);

CREATE INDEX "player_profiles_public_idx"
    ON "player_profiles"("visibility", "updated_at", "user_id");

CREATE FUNCTION "profile_version_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."version" <> OLD."version" + 1 THEN
        RAISE EXCEPTION 'profile version must increase by exactly one';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "player_profiles_version_guard"
    BEFORE UPDATE ON "player_profiles" FOR EACH ROW EXECUTE FUNCTION "profile_version_guard"();

CREATE TABLE "external_profile_links" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "provider" "external_profile_provider" NOT NULL,
    "url_key" CHAR(64) NOT NULL,
    "url_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "outbound_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_profile_links_user_fkey" FOREIGN KEY ("user_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "external_profile_links_user_provider_key" UNIQUE ("user_id", "provider"),
    CONSTRAINT "external_profile_links_url_key_check" CHECK ("url_key" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "external_profile_links_encryption_key_check" CHECK ("encryption_key_version" > 0),
    CONSTRAINT "external_profile_links_policy_check" CHECK (length(btrim("policy_version")) > 0)
);

CREATE TABLE "profile_avatar_assets" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "state" "profile_avatar_state" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "media_type" VARCHAR(32) NOT NULL,
    "expected_bytes" INTEGER NOT NULL,
    "expected_sha256" CHAR(64) NOT NULL,
    "activated_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upload_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "retention_expires_at" TIMESTAMPTZ(3),
    CONSTRAINT "profile_avatar_assets_user_fkey" FOREIGN KEY ("user_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "profile_avatar_assets_object_key" UNIQUE ("object_key"),
    CONSTRAINT "profile_avatar_assets_media_type_check" CHECK ("media_type" IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT "profile_avatar_assets_size_check" CHECK ("expected_bytes" BETWEEN 1 AND 5242880),
    CONSTRAINT "profile_avatar_assets_sha_check" CHECK ("expected_sha256" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "profile_avatar_assets_upload_expiry_check" CHECK (
        "upload_expires_at" = "created_at" + INTERVAL '5 minutes'
    ),
    CONSTRAINT "profile_avatar_assets_state_time_check" CHECK (
        ("state" = 'ACTIVE' AND "activated_at" IS NOT NULL AND "rejected_at" IS NULL)
        OR ("state" = 'REJECTED' AND "rejected_at" IS NOT NULL AND "activated_at" IS NULL)
        OR ("state" IN ('PENDING_UPLOAD', 'PENDING_SCAN') AND "activated_at" IS NULL AND "rejected_at" IS NULL)
    )
);

CREATE INDEX "profile_avatar_assets_user_state_idx"
    ON "profile_avatar_assets"("user_id", "state", "created_at");
CREATE INDEX "profile_avatar_assets_upload_expiry_idx" ON "profile_avatar_assets"("upload_expires_at");

ALTER TABLE "player_profiles"
    ADD CONSTRAINT "player_profiles_active_avatar_fkey" FOREIGN KEY ("active_avatar_asset_id")
    REFERENCES "profile_avatar_assets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "profile_avatar_validate_key_and_owner"() RETURNS trigger AS $$
BEGIN
    IF NEW."object_key" <> 'profiles/' || NEW."user_id"::text || '/avatars/' || NEW."id"::text || '/original' THEN
        RAISE EXCEPTION 'avatar object key does not match its owner and asset';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "profile_avatar_assets_key_guard"
    BEFORE INSERT OR UPDATE OF "object_key", "user_id", "id" ON "profile_avatar_assets"
    FOR EACH ROW EXECUTE FUNCTION "profile_avatar_validate_key_and_owner"();

CREATE FUNCTION "profile_validate_active_avatar"() RETURNS trigger AS $$
BEGIN
    IF NEW."active_avatar_asset_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "profile_avatar_assets" a
        WHERE a."id" = NEW."active_avatar_asset_id"
          AND a."user_id" = NEW."user_id"
          AND a."state" = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'active avatar must be an ACTIVE asset owned by the profile';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "player_profiles_active_avatar_guard"
    AFTER INSERT OR UPDATE OF "active_avatar_asset_id" ON "player_profiles"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "profile_validate_active_avatar"();

CREATE TABLE "profile_projection_generations" (
    "id" UUID PRIMARY KEY,
    "state" "profile_projection_generation_state" NOT NULL DEFAULT 'BUILDING',
    "snapshot_cutoff" TIMESTAMPTZ(3) NOT NULL,
    "snapshot_revision" BIGINT NOT NULL,
    "contribution_count" BIGINT NOT NULL DEFAULT 0,
    "contribution_checksum" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure_code" VARCHAR(96),
    CONSTRAINT "profile_projection_generations_revision_check" CHECK ("snapshot_revision" >= 0),
    CONSTRAINT "profile_projection_generations_count_check" CHECK ("contribution_count" >= 0),
    CONSTRAINT "profile_projection_generations_checksum_check" CHECK ("contribution_checksum" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "profile_projection_generations_state_time_check" CHECK (
        ("state" = 'BUILDING' AND "ready_at" IS NULL AND "activated_at" IS NULL AND "failed_at" IS NULL)
        OR ("state" = 'READY' AND "ready_at" IS NOT NULL AND "activated_at" IS NULL AND "failed_at" IS NULL)
        OR ("state" IN ('ACTIVE', 'SUPERSEDED') AND "ready_at" IS NOT NULL AND "activated_at" IS NOT NULL AND "failed_at" IS NULL)
        OR ("state" = 'FAILED' AND "failed_at" IS NOT NULL AND "activated_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "profile_projection_generations_active_key"
    ON "profile_projection_generations" ((TRUE)) WHERE "state" = 'ACTIVE';
CREATE INDEX "profile_projection_generations_state_idx"
    ON "profile_projection_generations"("state", "created_at");

CREATE TABLE "player_statistic_contributions" (
    "generation_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "eligibility_revision" BIGINT NOT NULL,
    "marker_id" UUID,
    "format" "match_format" NOT NULL,
    "outcome" "player_statistic_outcome" NOT NULL,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "points_for" INTEGER NOT NULL DEFAULT 0,
    "points_against" INTEGER NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(3),
    "source_checksum" CHAR(64) NOT NULL,
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_statistic_contributions_pkey" PRIMARY KEY ("generation_id", "match_id", "player_id"),
    CONSTRAINT "player_statistic_contributions_generation_fkey" FOREIGN KEY ("generation_id")
        REFERENCES "profile_projection_generations"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "player_statistic_contributions_match_fkey" FOREIGN KEY ("match_id")
        REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "player_statistic_contributions_player_fkey" FOREIGN KEY ("player_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "player_statistic_contributions_revision_check" CHECK ("eligibility_revision" >= 0),
    CONSTRAINT "player_statistic_contributions_metrics_check" CHECK (
        "games_played" >= 0 AND "points_for" >= 0 AND "points_against" >= 0
        AND (
            ("outcome" = 'EXCLUDED' AND "marker_id" IS NULL AND "confirmed_at" IS NULL
                AND "games_played" = 0 AND "points_for" = 0 AND "points_against" = 0)
            OR ("outcome" = 'PLAYED_WITHOUT_SCORE' AND "marker_id" IS NOT NULL AND "confirmed_at" IS NOT NULL
                AND "games_played" = 0 AND "points_for" = 0 AND "points_against" = 0)
            OR ("outcome" IN ('WON', 'LOST') AND "marker_id" IS NOT NULL AND "confirmed_at" IS NOT NULL
                AND "games_played" > 0)
        )
    ),
    CONSTRAINT "player_statistic_contributions_checksum_check" CHECK ("source_checksum" ~ '^[a-f0-9]{64}$')
);

CREATE INDEX "player_statistic_contributions_aggregate_idx"
    ON "player_statistic_contributions"("generation_id", "player_id", "format");
CREATE INDEX "player_statistic_contributions_source_idx"
    ON "player_statistic_contributions"("match_id", "eligibility_revision");

CREATE FUNCTION "profile_contribution_revision_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."eligibility_revision" < OLD."eligibility_revision" THEN
        RAISE EXCEPTION 'eligibility revision cannot move backward';
    END IF;
    IF NEW."eligibility_revision" = OLD."eligibility_revision" AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'same eligibility revision cannot change a contribution';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "player_statistic_contributions_revision_guard"
    BEFORE UPDATE ON "player_statistic_contributions"
    FOR EACH ROW EXECUTE FUNCTION "profile_contribution_revision_guard"();

CREATE TABLE "player_statistic_aggregates" (
    "generation_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "slice" "player_statistic_slice" NOT NULL,
    "played" BIGINT NOT NULL DEFAULT 0,
    "wins" BIGINT NOT NULL DEFAULT 0,
    "losses" BIGINT NOT NULL DEFAULT 0,
    "games_played" BIGINT NOT NULL DEFAULT 0,
    "points_for" BIGINT NOT NULL DEFAULT 0,
    "points_against" BIGINT NOT NULL DEFAULT 0,
    "last_confirmed_at" TIMESTAMPTZ(3),
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_statistic_aggregates_pkey" PRIMARY KEY ("generation_id", "player_id", "slice"),
    CONSTRAINT "player_statistic_aggregates_generation_fkey" FOREIGN KEY ("generation_id")
        REFERENCES "profile_projection_generations"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "player_statistic_aggregates_player_fkey" FOREIGN KEY ("player_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "player_statistic_aggregates_totals_check" CHECK (
        "played" >= 0 AND "wins" >= 0 AND "losses" >= 0 AND "wins" + "losses" <= "played"
        AND "games_played" >= 0 AND "points_for" >= 0 AND "points_against" >= 0
    )
);

CREATE INDEX "player_statistic_aggregates_player_idx"
    ON "player_statistic_aggregates"("player_id", "generation_id");

CREATE FUNCTION "profile_validate_all_statistic_slice"() RETURNS trigger AS $$
DECLARE
    invalid_count INTEGER;
    affected_generation UUID;
    affected_player UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        affected_generation := OLD."generation_id";
        affected_player := OLD."player_id";
    ELSE
        affected_generation := NEW."generation_id";
        affected_player := NEW."player_id";
    END IF;
    SELECT count(*) INTO invalid_count
    FROM "player_statistic_aggregates" a
    LEFT JOIN "player_statistic_aggregates" s
        ON s."generation_id" = a."generation_id" AND s."player_id" = a."player_id" AND s."slice" = 'SINGLES'
    LEFT JOIN "player_statistic_aggregates" d
        ON d."generation_id" = a."generation_id" AND d."player_id" = a."player_id" AND d."slice" = 'DOUBLES'
    WHERE a."generation_id" = affected_generation AND a."player_id" = affected_player AND a."slice" = 'ALL'
      AND (s."player_id" IS NULL OR d."player_id" IS NULL
        OR a."played" <> s."played" + d."played"
        OR a."wins" <> s."wins" + d."wins"
        OR a."losses" <> s."losses" + d."losses"
        OR a."games_played" <> s."games_played" + d."games_played"
        OR a."points_for" <> s."points_for" + d."points_for"
        OR a."points_against" <> s."points_against" + d."points_against");
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'ALL statistic slice must equal SINGLES plus DOUBLES';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "player_statistic_aggregates_all_slice_guard"
    AFTER INSERT OR UPDATE OR DELETE ON "player_statistic_aggregates"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "profile_validate_all_statistic_slice"();

CREATE TABLE "player_reliability_contributions" (
    "generation_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "kind" "player_reliability_contribution_kind" NOT NULL,
    "eligibility_revision" BIGINT NOT NULL,
    "source_decision_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_reliability_contributions_pkey"
        PRIMARY KEY ("generation_id", "match_id", "player_id", "kind"),
    CONSTRAINT "player_reliability_contributions_generation_fkey" FOREIGN KEY ("generation_id")
        REFERENCES "profile_projection_generations"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "player_reliability_contributions_match_fkey" FOREIGN KEY ("match_id")
        REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "player_reliability_contributions_player_fkey" FOREIGN KEY ("player_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "player_reliability_contributions_revision_check" CHECK ("eligibility_revision" >= 0),
    CONSTRAINT "player_reliability_contributions_decision_check" CHECK (
        ("kind" = 'CONFIRMED_NO_SHOW' AND "source_decision_id" IS NOT NULL)
        OR ("kind" <> 'CONFIRMED_NO_SHOW' AND "source_decision_id" IS NULL)
    )
);

CREATE INDEX "player_reliability_contributions_aggregate_idx"
    ON "player_reliability_contributions"("generation_id", "player_id", "kind");
CREATE UNIQUE INDEX "player_reliability_contributions_organizer_outcome_key"
    ON "player_reliability_contributions"("generation_id", "match_id", "player_id")
    WHERE "kind" IN ('ORGANIZED_SUCCESS', 'ORGANIZED_FAILURE');

CREATE FUNCTION "profile_reliability_revision_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."eligibility_revision" < OLD."eligibility_revision" THEN
        RAISE EXCEPTION 'reliability eligibility revision cannot move backward';
    END IF;
    IF NEW."eligibility_revision" = OLD."eligibility_revision" AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'same eligibility revision cannot change a reliability contribution';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "player_reliability_contributions_revision_guard"
    BEFORE UPDATE ON "player_reliability_contributions"
    FOR EACH ROW EXECUTE FUNCTION "profile_reliability_revision_guard"();

CREATE TABLE "player_reliability_aggregates" (
    "generation_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "organized_successes" BIGINT NOT NULL DEFAULT 0,
    "organized_failures" BIGINT NOT NULL DEFAULT 0,
    "confirmed_no_shows" BIGINT NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_reliability_aggregates_pkey" PRIMARY KEY ("generation_id", "player_id"),
    CONSTRAINT "player_reliability_aggregates_generation_fkey" FOREIGN KEY ("generation_id")
        REFERENCES "profile_projection_generations"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "player_reliability_aggregates_player_fkey" FOREIGN KEY ("player_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "player_reliability_aggregates_totals_check" CHECK (
        "organized_successes" >= 0 AND "organized_failures" >= 0 AND "confirmed_no_shows" >= 0
    )
);

CREATE INDEX "player_reliability_aggregates_player_idx"
    ON "player_reliability_aggregates"("player_id", "generation_id");

CREATE TABLE "profile_projection_event_receipts" (
    "consumer_key" VARCHAR(80) NOT NULL,
    "event_id" UUID NOT NULL,
    "source_type" VARCHAR(160) NOT NULL,
    "source_id" UUID NOT NULL,
    "source_revision" BIGINT NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_projection_event_receipts_pkey" PRIMARY KEY ("consumer_key", "event_id"),
    CONSTRAINT "profile_projection_event_receipts_revision_check" CHECK ("source_revision" >= 0),
    CONSTRAINT "profile_projection_event_receipts_source_type_check" CHECK (
        "source_type" ~ '^[a-z][a-z0-9.]+\.v[1-9][0-9]*$'
    )
);

CREATE INDEX "profile_projection_receipts_source_idx"
    ON "profile_projection_event_receipts"("consumer_key", "source_type", "source_id", "source_revision");

CREATE TABLE "profile_idempotency_records" (
    "id" UUID PRIMARY KEY,
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
    CONSTRAINT "profile_idempotency_records_user_fkey" FOREIGN KEY ("user_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "profile_idempotency_scope_key" UNIQUE ("user_id", "method", "canonical_path", "idempotency_key"),
    CONSTRAINT "profile_idempotency_request_fingerprint_check" CHECK ("request_fingerprint" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "profile_idempotency_response_status_check" CHECK ("response_status" BETWEEN 200 AND 599),
    CONSTRAINT "profile_idempotency_key_version_check" CHECK ("encryption_key_version" > 0),
    CONSTRAINT "profile_idempotency_expiry_check" CHECK ("expires_at" = "created_at" + INTERVAL '24 hours')
);

CREATE INDEX "profile_idempotency_expiry_idx" ON "profile_idempotency_records"("expires_at");

CREATE FUNCTION "profile_generation_transition_guard"() RETURNS trigger AS $$
DECLARE
    actual_count BIGINT;
    actual_checksum TEXT;
BEGIN
    IF OLD."state" = 'BUILDING' AND NEW."state" NOT IN ('BUILDING', 'READY', 'FAILED') THEN
        RAISE EXCEPTION 'invalid profile generation transition';
    ELSIF OLD."state" = 'READY' AND NEW."state" NOT IN ('READY', 'ACTIVE', 'FAILED') THEN
        RAISE EXCEPTION 'invalid profile generation transition';
    ELSIF OLD."state" = 'ACTIVE' AND NEW."state" NOT IN ('ACTIVE', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'invalid profile generation transition';
    ELSIF OLD."state" IN ('SUPERSEDED', 'FAILED') AND NEW."state" <> OLD."state" THEN
        RAISE EXCEPTION 'terminal profile generation is immutable';
    END IF;

    IF NEW."state" IN ('READY', 'ACTIVE') AND OLD."state" IS DISTINCT FROM NEW."state" THEN
        SELECT count(*), encode(digest(coalesce(string_agg(
            c."match_id"::text || ':' || c."player_id"::text || ':' || c."eligibility_revision"::text || ':' ||
            c."source_checksum", ',' ORDER BY c."match_id", c."player_id"), ''), 'sha256'), 'hex')
        INTO actual_count, actual_checksum
        FROM "player_statistic_contributions" c
        WHERE c."generation_id" = NEW."id" AND c."outcome" <> 'EXCLUDED';

        IF actual_count <> NEW."contribution_count" OR actual_checksum <> NEW."contribution_checksum" THEN
            RAISE EXCEPTION 'profile generation count or checksum mismatch';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "profile_projection_generations_transition_guard"
    BEFORE UPDATE ON "profile_projection_generations"
    FOR EACH ROW EXECUTE FUNCTION "profile_generation_transition_guard"();

INSERT INTO "player_profiles" (
    "user_id", "version", "visibility", "display_name", "locality_id", "game_formats",
    "skill_self_assessment", "time_zone", "updated_at"
)
SELECT
    d."user_id", d."version", 'PUBLIC', d."display_name", d."locality_id",
    ARRAY(SELECT unnest(d."game_formats")::"match_format"), d."skill_self_assessment", d."time_zone", d."updated_at"
FROM "player_profile_drafts" d
JOIN "identity_users" u ON u."id" = d."user_id"
WHERE d."completed_at" IS NOT NULL
  AND u."status" = 'ACTIVE'
  AND d."display_name" IS NOT NULL
  AND d."locality_id" IS NOT NULL
  AND cardinality(d."game_formats") BETWEEN 1 AND 2
  AND d."skill_self_assessment" IS NOT NULL
  AND d."time_zone" IS NOT NULL
ON CONFLICT ("user_id") DO NOTHING;
