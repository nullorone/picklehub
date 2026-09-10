CREATE TYPE "venue_publication_state" AS ENUM ('PUBLISHED', 'PRIVACY_REVIEW', 'CLOSED', 'MERGED');
CREATE TYPE "venue_verification_state" AS ENUM (
    'IMPORTED_UNREVIEWED',
    'COMMUNITY_CONFIRMED',
    'MODERATOR_VERIFIED',
    'STALE'
);
CREATE TYPE "venue_access_mode" AS ENUM (
    'FREE',
    'PAID',
    'REGISTRATION_REQUIRED',
    'MEMBERS_ONLY',
    'UNKNOWN'
);
CREATE TYPE "venue_environment" AS ENUM ('INDOOR', 'OUTDOOR', 'MIXED', 'UNKNOWN');
CREATE TYPE "venue_amenity_state" AS ENUM ('YES', 'NO', 'UNKNOWN');
CREATE TYPE "venue_candidate_state" AS ENUM (
    'MATCH_ONLY',
    'AWAITING_MATCH_COMPLETION',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'MERGED',
    'WITHDRAWN'
);
CREATE TYPE "venue_contribution_state" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "venue_report_reason" AS ENUM ('PRIVATE_RESIDENCE', 'DUPLICATE', 'CLOSED');
CREATE TYPE "venue_report_state" AS ENUM ('PENDING_REVIEW', 'RESOLVED', 'REJECTED');
CREATE TYPE "venue_source_kind" AS ENUM ('OPENSTREETMAP', 'GEOCODER', 'COMMUNITY', 'MODERATOR');
CREATE TYPE "venue_moderation_subject" AS ENUM ('CANDIDATE', 'REVISION', 'REPORT', 'VENUE');
CREATE TYPE "venue_moderation_outcome" AS ENUM ('APPROVED', 'REJECTED', 'MERGED', 'WITHDRAWN');

CREATE TABLE "venues" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalized_address" VARCHAR(500) NOT NULL,
    "search_document" TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("normalized_address", '')), 'B')
    ) STORED,
    "locality" VARCHAR(160) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "longitude" DECIMAL(9, 6) NOT NULL,
    "latitude" DECIMAL(8, 6) NOT NULL,
    "location" geography(Point, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint("longitude"::DOUBLE PRECISION, "latitude"::DOUBLE PRECISION), 4326)::geography
    ) STORED,
    "publication_state" "venue_publication_state" NOT NULL DEFAULT 'PUBLISHED',
    "verification_state" "venue_verification_state" NOT NULL,
    "access_mode" "venue_access_mode" NOT NULL DEFAULT 'UNKNOWN',
    "environment" "venue_environment" NOT NULL DEFAULT 'UNKNOWN',
    "pickleball_court_count" SMALLINT,
    "surface_type" VARCHAR(120),
    "permanent_net" "venue_amenity_state" NOT NULL DEFAULT 'UNKNOWN',
    "lighting" "venue_amenity_state" NOT NULL DEFAULT 'UNKNOWN',
    "changing_room" "venue_amenity_state" NOT NULL DEFAULT 'UNKNOWN',
    "toilet" "venue_amenity_state" NOT NULL DEFAULT 'UNKNOWN',
    "drinking_water" "venue_amenity_state" NOT NULL DEFAULT 'UNKNOWN',
    "parking" "venue_amenity_state" NOT NULL DEFAULT 'UNKNOWN',
    "wheelchair_access" "venue_amenity_state" NOT NULL DEFAULT 'UNKNOWN',
    "opening_hours" JSONB,
    "seasonality" VARCHAR(500),
    "closed_until" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_verified_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canonical_venue_id" UUID,
    CONSTRAINT "venues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venues_coordinate_precision_check" CHECK (
        "longitude" BETWEEN -180 AND 180 AND
        "latitude" BETWEEN -90 AND 90 AND
        scale("longitude") <= 6 AND
        scale("latitude") <= 6
    ),
    CONSTRAINT "venues_content_check" CHECK (
        length(btrim("name")) BETWEEN 1 AND 160 AND
        length(btrim("normalized_address")) BETWEEN 1 AND 500 AND
        length(btrim("locality")) BETWEEN 1 AND 160 AND
        length("time_zone") BETWEEN 1 AND 64 AND
        "version" > 0 AND
        ("pickleball_court_count" IS NULL OR "pickleball_court_count" BETWEEN 1 AND 100) AND
        jsonb_typeof(coalesce("opening_hours", '[]'::JSONB)) = 'array' AND
        "last_verified_at" <= "updated_at" AND
        "updated_at" >= "created_at"
    ),
    CONSTRAINT "venues_merge_shape_check" CHECK (
        ("publication_state" = 'MERGED' AND "canonical_venue_id" IS NOT NULL AND "canonical_venue_id" <> "id") OR
        ("publication_state" <> 'MERGED' AND "canonical_venue_id" IS NULL)
    )
);

ALTER TABLE "venues" ADD CONSTRAINT "venues_canonical_venue_id_fkey"
    FOREIGN KEY ("canonical_venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "venues_location_gist_idx" ON "venues" USING GIST ("location");
CREATE INDEX "venues_search_document_gin_idx" ON "venues" USING GIN ("search_document");
CREATE INDEX "venues_catalogue_sort_idx" ON "venues" ("publication_state", "name", "id");
CREATE INDEX "venues_staleness_idx" ON "venues" ("publication_state", "last_verified_at");

CREATE TABLE "venue_candidates" (
    "id" UUID NOT NULL,
    "source_match_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalized_address" VARCHAR(500) NOT NULL,
    "locality" VARCHAR(160) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "longitude" DECIMAL(9, 6) NOT NULL,
    "latitude" DECIMAL(8, 6) NOT NULL,
    "location" geography(Point, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint("longitude"::DOUBLE PRECISION, "latitude"::DOUBLE PRECISION), 4326)::geography
    ) STORED,
    "state" "venue_candidate_state" NOT NULL DEFAULT 'AWAITING_MATCH_COMPLETION',
    "qualified_at" TIMESTAMPTZ(3),
    "canonical_venue_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    CONSTRAINT "venue_candidates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_candidates_coordinate_precision_check" CHECK (
        "longitude" BETWEEN -180 AND 180 AND
        "latitude" BETWEEN -90 AND 90 AND
        scale("longitude") <= 6 AND
        scale("latitude") <= 6
    ),
    CONSTRAINT "venue_candidates_content_check" CHECK (
        length(btrim("name")) BETWEEN 1 AND 160 AND
        length(btrim("normalized_address")) BETWEEN 1 AND 500 AND
        length(btrim("locality")) BETWEEN 1 AND 160 AND
        length("time_zone") BETWEEN 1 AND 64
    ),
    CONSTRAINT "venue_candidates_state_check" CHECK (
        ("state" IN ('MATCH_ONLY', 'AWAITING_MATCH_COMPLETION') AND
            "qualified_at" IS NULL AND "decided_at" IS NULL AND "canonical_venue_id" IS NULL) OR
        ("state" = 'PENDING_REVIEW' AND
            "qualified_at" IS NOT NULL AND "decided_at" IS NULL AND "canonical_venue_id" IS NULL) OR
        ("state" IN ('APPROVED', 'MERGED') AND
            "qualified_at" IS NOT NULL AND "decided_at" IS NOT NULL AND "canonical_venue_id" IS NOT NULL) OR
        ("state" IN ('REJECTED', 'WITHDRAWN') AND
            "qualified_at" IS NOT NULL AND "decided_at" IS NOT NULL AND "canonical_venue_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "venue_candidates_source_match_key" ON "venue_candidates" ("source_match_id");
CREATE INDEX "venue_candidates_location_gist_idx" ON "venue_candidates" USING GIST ("location");
CREATE INDEX "venue_candidates_review_idx" ON "venue_candidates" ("state", "qualified_at", "id");

ALTER TABLE "venue_candidates" ADD CONSTRAINT "venue_candidates_contributor_id_fkey"
    FOREIGN KEY ("contributor_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_candidates" ADD CONSTRAINT "venue_candidates_canonical_venue_id_fkey"
    FOREIGN KEY ("canonical_venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "venue_revisions" (
    "id" UUID NOT NULL,
    "venue_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "base_version" INTEGER NOT NULL,
    "proposed_data" JSONB NOT NULL,
    "changed_fields" TEXT[] NOT NULL,
    "state" "venue_contribution_state" NOT NULL DEFAULT 'PENDING_REVIEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    CONSTRAINT "venue_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_revisions_shape_check" CHECK (
        "base_version" > 0 AND
        jsonb_typeof("proposed_data") = 'object' AND
        cardinality("changed_fields") BETWEEN 1 AND 20 AND
        ("state" = 'PENDING_REVIEW') = ("decided_at" IS NULL)
    )
);

CREATE INDEX "venue_revisions_review_idx" ON "venue_revisions" ("venue_id", "state", "created_at", "id");
ALTER TABLE "venue_revisions" ADD CONSTRAINT "venue_revisions_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_revisions" ADD CONSTRAINT "venue_revisions_contributor_id_fkey"
    FOREIGN KEY ("contributor_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "venue_reports" (
    "id" UUID NOT NULL,
    "venue_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "venue_report_reason" NOT NULL,
    "state" "venue_report_state" NOT NULL DEFAULT 'PENDING_REVIEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "venue_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_reports_state_check" CHECK (("state" = 'PENDING_REVIEW') = ("resolved_at" IS NULL))
);

CREATE UNIQUE INDEX "venue_reports_open_key"
    ON "venue_reports" ("venue_id", "reporter_id", "reason") WHERE "state" = 'PENDING_REVIEW';
CREATE INDEX "venue_reports_review_idx" ON "venue_reports" ("venue_id", "state", "created_at", "id");
ALTER TABLE "venue_reports" ADD CONSTRAINT "venue_reports_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_reports" ADD CONSTRAINT "venue_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "venue_sources" (
    "id" UUID NOT NULL,
    "venue_id" UUID,
    "candidate_id" UUID,
    "revision_id" UUID,
    "kind" "venue_source_kind" NOT NULL,
    "provider_key" VARCHAR(80),
    "external_source_id" VARCHAR(300),
    "external_source_version" VARCHAR(160),
    "import_batch_id" UUID,
    "contributor_id" UUID,
    "contributor_agreement" VARCHAR(128),
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "license" VARCHAR(160) NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "storage_allowed" BOOLEAN NOT NULL,
    "allowed_fields" TEXT[] NOT NULL,
    "attribution_text" VARCHAR(300) NOT NULL,
    "attribution_link" VARCHAR(2048),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_sources_owner_check" CHECK (
        num_nonnulls("venue_id", "candidate_id", "revision_id") = 1
    ),
    CONSTRAINT "venue_sources_storage_check" CHECK (
        "storage_allowed" AND cardinality("allowed_fields") BETWEEN 1 AND 30 AND
        length(btrim("license")) > 0 AND length(btrim("policy_version")) > 0 AND
        length(btrim("attribution_text")) > 0 AND "observed_at" <= "created_at"
    ),
    CONSTRAINT "venue_sources_origin_check" CHECK (
        ("kind" = 'COMMUNITY' AND "contributor_id" IS NOT NULL AND "contributor_agreement" IS NOT NULL AND
            "provider_key" IS NULL AND "external_source_id" IS NULL) OR
        ("kind" <> 'COMMUNITY' AND "contributor_id" IS NULL AND "contributor_agreement" IS NULL AND
            "provider_key" IS NOT NULL AND "external_source_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "venue_sources_canonical_external_key"
    ON "venue_sources" ("provider_key", "external_source_id")
    WHERE "venue_id" IS NOT NULL AND "kind" <> 'COMMUNITY';
CREATE INDEX "venue_sources_venue_idx" ON "venue_sources" ("venue_id", "observed_at");
CREATE INDEX "venue_sources_candidate_idx" ON "venue_sources" ("candidate_id", "observed_at");
CREATE INDEX "venue_sources_revision_idx" ON "venue_sources" ("revision_id", "observed_at");
ALTER TABLE "venue_sources" ADD CONSTRAINT "venue_sources_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_sources" ADD CONSTRAINT "venue_sources_candidate_id_fkey"
    FOREIGN KEY ("candidate_id") REFERENCES "venue_candidates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_sources" ADD CONSTRAINT "venue_sources_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "venue_revisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_sources" ADD CONSTRAINT "venue_sources_contributor_id_fkey"
    FOREIGN KEY ("contributor_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "venue_moderation_decisions" (
    "id" UUID NOT NULL,
    "subject" "venue_moderation_subject" NOT NULL,
    "candidate_id" UUID,
    "revision_id" UUID,
    "report_id" UUID,
    "venue_id" UUID,
    "moderator_id" UUID NOT NULL,
    "outcome" "venue_moderation_outcome" NOT NULL,
    "reason_code" VARCHAR(96) NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_moderation_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_moderation_decisions_subject_check" CHECK (
        num_nonnulls("candidate_id", "revision_id", "report_id", "venue_id") = 1 AND
        ("subject" = 'CANDIDATE') = ("candidate_id" IS NOT NULL) AND
        ("subject" = 'REVISION') = ("revision_id" IS NOT NULL) AND
        ("subject" = 'REPORT') = ("report_id" IS NOT NULL) AND
        ("subject" = 'VENUE') = ("venue_id" IS NOT NULL) AND
        "reason_code" ~ '^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$'
    )
);

CREATE UNIQUE INDEX "venue_decisions_candidate_key"
    ON "venue_moderation_decisions" ("candidate_id") WHERE "candidate_id" IS NOT NULL;
CREATE UNIQUE INDEX "venue_decisions_revision_key"
    ON "venue_moderation_decisions" ("revision_id") WHERE "revision_id" IS NOT NULL;
CREATE UNIQUE INDEX "venue_decisions_report_key"
    ON "venue_moderation_decisions" ("report_id") WHERE "report_id" IS NOT NULL;
ALTER TABLE "venue_moderation_decisions" ADD CONSTRAINT "venue_decisions_candidate_id_fkey"
    FOREIGN KEY ("candidate_id") REFERENCES "venue_candidates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_moderation_decisions" ADD CONSTRAINT "venue_decisions_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "venue_revisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_moderation_decisions" ADD CONSTRAINT "venue_decisions_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "venue_reports" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_moderation_decisions" ADD CONSTRAINT "venue_decisions_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_moderation_decisions" ADD CONSTRAINT "venue_decisions_moderator_id_fkey"
    FOREIGN KEY ("moderator_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "venue_merges" (
    "id" UUID NOT NULL,
    "previous_venue_id" UUID NOT NULL,
    "canonical_venue_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "reason_code" VARCHAR(96) NOT NULL,
    "merged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_merges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_merges_distinct_check" CHECK ("previous_venue_id" <> "canonical_venue_id")
);

CREATE UNIQUE INDEX "venue_merges_decision_key" ON "venue_merges" ("decision_id");
CREATE UNIQUE INDEX "venue_merges_pair_key" ON "venue_merges" ("previous_venue_id", "canonical_venue_id");
CREATE INDEX "venue_merges_canonical_idx" ON "venue_merges" ("canonical_venue_id", "merged_at");
ALTER TABLE "venue_merges" ADD CONSTRAINT "venue_merges_previous_venue_id_fkey"
    FOREIGN KEY ("previous_venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_merges" ADD CONSTRAINT "venue_merges_canonical_venue_id_fkey"
    FOREIGN KEY ("canonical_venue_id") REFERENCES "venues" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_merges" ADD CONSTRAINT "venue_merges_decision_id_fkey"
    FOREIGN KEY ("decision_id") REFERENCES "venue_moderation_decisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "venue_idempotency_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "canonical_path" VARCHAR(160) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT "venue_idempotency_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_idempotency_records_shape_check" CHECK (
        "method" = 'POST' AND "canonical_path" LIKE '/v1/venues%' AND
        "request_fingerprint" ~ '^[a-f0-9]{64}$' AND "response_status" BETWEEN 200 AND 599 AND
        octet_length("response_ciphertext") > 0 AND "encryption_key_version" > 0 AND
        "expires_at" = "created_at" + INTERVAL '24 hours'
    )
);

CREATE UNIQUE INDEX "venue_idempotency_scope_key"
    ON "venue_idempotency_records" ("user_id", "method", "canonical_path", "idempotency_key");
CREATE INDEX "venue_idempotency_expiry_idx" ON "venue_idempotency_records" ("expires_at");
ALTER TABLE "venue_idempotency_records" ADD CONSTRAINT "venue_idempotency_records_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The geography operand is the indexed column. ST_DWithin and ST_Intersects therefore produce index scans for
-- radius and map queries; callers must apply the contract's 50 km and 100 x 100 km limits before these functions.
CREATE FUNCTION search_venues_nearby(
    search_longitude DOUBLE PRECISION,
    search_latitude DOUBLE PRECISION,
    search_radius_metres INTEGER
) RETURNS TABLE (venue_id UUID, distance_metres DOUBLE PRECISION) AS $$
    SELECT v.id, ST_Distance(v.location, origin.point)
    FROM venues AS v
    CROSS JOIN (
        SELECT ST_SetSRID(ST_MakePoint(search_longitude, search_latitude), 4326)::geography AS point
    ) AS origin
    WHERE v.publication_state = 'PUBLISHED'
      AND ST_DWithin(v.location, origin.point, search_radius_metres)
    ORDER BY ST_Distance(v.location, origin.point), v.id;
$$ LANGUAGE SQL STABLE PARALLEL SAFE;

CREATE FUNCTION search_venues_in_bounds(bounds geography)
RETURNS TABLE (venue_id UUID) AS $$
    SELECT v.id
    FROM venues AS v
    WHERE v.publication_state = 'PUBLISHED'
      AND ST_Intersects(v.location, bounds)
    ORDER BY v.name, v.id;
$$ LANGUAGE SQL STABLE PARALLEL SAFE;

CREATE FUNCTION resolve_canonical_venue_id(requested_venue_id UUID) RETURNS UUID AS $$
    SELECT CASE WHEN v.publication_state = 'MERGED' THEN v.canonical_venue_id ELSE v.id END
    FROM venues AS v
    WHERE v.id = requested_venue_id;
$$ LANGUAGE SQL STABLE PARALLEL SAFE;

-- A merged row stays present forever, so existing and future match foreign keys remain valid. The alias points
-- directly to a published survivor; chains and cycles are rejected before the merge becomes visible.
CREATE FUNCTION validate_venue_merge_target() RETURNS trigger AS $$
DECLARE
    target_state venue_publication_state;
BEGIN
    IF NEW.publication_state <> 'PUBLISHED' AND
       EXISTS (SELECT 1 FROM venues WHERE canonical_venue_id = NEW.id) THEN
        RAISE EXCEPTION 'a canonical survivor referenced by aliases must remain published' USING ERRCODE = '23514';
    END IF;
    IF NEW.publication_state = 'MERGED' THEN
        SELECT publication_state INTO target_state FROM venues WHERE id = NEW.canonical_venue_id FOR UPDATE;
        IF target_state IS DISTINCT FROM 'PUBLISHED' THEN
            RAISE EXCEPTION 'merged venue must point directly to a published survivor' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER venues_validate_merge_target
    BEFORE INSERT OR UPDATE OF publication_state, canonical_venue_id ON venues
    FOR EACH ROW EXECUTE FUNCTION validate_venue_merge_target();

CREATE FUNCTION validate_venue_merge_record() RETURNS trigger AS $$
DECLARE
    previous_target UUID;
    decision_outcome venue_moderation_outcome;
BEGIN
    SELECT canonical_venue_id INTO previous_target
    FROM venues
    WHERE id = NEW.previous_venue_id AND publication_state = 'MERGED'
    FOR UPDATE;
    SELECT outcome INTO decision_outcome
    FROM venue_moderation_decisions
    WHERE id = NEW.decision_id;
    IF previous_target IS DISTINCT FROM NEW.canonical_venue_id OR decision_outcome IS DISTINCT FROM 'MERGED' THEN
        RAISE EXCEPTION 'merge history must match the alias and moderation decision' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER venue_merges_validate_record
    BEFORE INSERT ON venue_merges FOR EACH ROW EXECUTE FUNCTION validate_venue_merge_record();

CREATE FUNCTION reject_venue_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'venue identifiers and match references are permanent' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER venues_reject_delete BEFORE DELETE ON venues FOR EACH ROW EXECUTE FUNCTION reject_venue_delete();

CREATE FUNCTION reject_venue_immutable_record_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER venue_sources_reject_update
    BEFORE UPDATE ON venue_sources FOR EACH ROW EXECUTE FUNCTION reject_venue_immutable_record_mutation();
CREATE TRIGGER venue_sources_reject_delete
    BEFORE DELETE ON venue_sources FOR EACH ROW EXECUTE FUNCTION reject_venue_immutable_record_mutation();
CREATE TRIGGER venue_decisions_reject_update
    BEFORE UPDATE ON venue_moderation_decisions FOR EACH ROW EXECUTE FUNCTION reject_venue_immutable_record_mutation();
CREATE TRIGGER venue_decisions_reject_delete
    BEFORE DELETE ON venue_moderation_decisions FOR EACH ROW EXECUTE FUNCTION reject_venue_immutable_record_mutation();
CREATE TRIGGER venue_merges_reject_update
    BEFORE UPDATE ON venue_merges FOR EACH ROW EXECUTE FUNCTION reject_venue_immutable_record_mutation();
CREATE TRIGGER venue_merges_reject_delete
    BEFORE DELETE ON venue_merges FOR EACH ROW EXECUTE FUNCTION reject_venue_immutable_record_mutation();
CREATE TRIGGER venue_idempotency_records_reject_update
    BEFORE UPDATE ON venue_idempotency_records FOR EACH ROW EXECUTE FUNCTION reject_venue_immutable_record_mutation();

CREATE FUNCTION protect_venue_candidate_transition() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW.id, NEW.source_match_id, NEW.contributor_id, NEW.name, NEW.normalized_address, NEW.locality,
           NEW.time_zone, NEW.longitude, NEW.latitude, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.source_match_id, OLD.contributor_id, OLD.name, OLD.normalized_address,
           OLD.locality, OLD.time_zone, OLD.longitude, OLD.latitude, OLD.created_at) OR
       NOT ((OLD.state = NEW.state) OR
            (OLD.state IN ('MATCH_ONLY', 'AWAITING_MATCH_COMPLETION') AND NEW.state = 'PENDING_REVIEW') OR
            (OLD.state = 'PENDING_REVIEW' AND NEW.state IN ('APPROVED', 'REJECTED', 'MERGED', 'WITHDRAWN'))) OR
       (OLD.qualified_at IS NOT NULL AND NEW.qualified_at IS DISTINCT FROM OLD.qualified_at) OR
       (OLD.decided_at IS NOT NULL AND NEW.decided_at IS DISTINCT FROM OLD.decided_at) OR
       (OLD.canonical_venue_id IS NOT NULL AND NEW.canonical_venue_id IS DISTINCT FROM OLD.canonical_venue_id) THEN
        RAISE EXCEPTION 'invalid venue candidate transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER venue_candidates_protect_transition
    BEFORE UPDATE ON venue_candidates FOR EACH ROW EXECUTE FUNCTION protect_venue_candidate_transition();

CREATE FUNCTION protect_venue_revision_content() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW.id, NEW.venue_id, NEW.contributor_id, NEW.base_version, NEW.proposed_data,
           NEW.changed_fields, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.venue_id, OLD.contributor_id, OLD.base_version, OLD.proposed_data,
           OLD.changed_fields, OLD.created_at) OR
       (OLD.state <> 'PENDING_REVIEW' AND NEW.state IS DISTINCT FROM OLD.state) OR
       (OLD.decided_at IS NOT NULL AND NEW.decided_at IS DISTINCT FROM OLD.decided_at) THEN
        RAISE EXCEPTION 'venue revision content and terminal state are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER venue_revisions_protect_content
    BEFORE UPDATE ON venue_revisions FOR EACH ROW EXECUTE FUNCTION protect_venue_revision_content();
