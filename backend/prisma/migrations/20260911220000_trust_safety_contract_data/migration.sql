CREATE TYPE "safety_review_state" AS ENUM ('ACTIVE', 'WITHDRAWN', 'EXCLUDED');
CREATE TYPE "safety_review_revision_kind" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'TEXT_REDACTED');
CREATE TYPE "safety_signal_kind" AS ENUM ('NO_SHOW', 'SAFETY', 'CONTENT', 'VENUE', 'RESULT');
CREATE TYPE "safety_signal_state" AS ENUM ('RECEIVED', 'LINKED', 'UNDER_REVIEW', 'WITHDRAW_REQUESTED', 'RESOLVED');
CREATE TYPE "safety_no_show_reason" AS ENUM ('DID_NOT_ARRIVE', 'LEFT_BEFORE_PLAY', 'UNREACHABLE_AT_START');
CREATE TYPE "safety_report_source_kind" AS ENUM ('MATCH', 'CHAT_MESSAGE', 'PROFILE', 'VENUE', 'MATCH_RESULT');
CREATE TYPE "moderation_case_state" AS ENUM ('OPEN', 'TRIAGED', 'ASSIGNED', 'INVESTIGATING', 'DECIDED', 'CLOSED', 'REOPENED');
CREATE TYPE "moderation_case_priority" AS ENUM ('URGENT', 'HIGH', 'NORMAL');
CREATE TYPE "moderation_decision_outcome" AS ENUM (
    'NO_VIOLATION', 'CONTENT_RESTRICTED', 'WARNING', 'INTERACTION_RESTRICTED', 'ACCOUNT_RESTRICTED',
    'NO_SHOW_CONFIRMED', 'RESULT_CORRECTED', 'VENUE_ROUTED'
);
CREATE TYPE "moderation_effect_state" AS ENUM ('PENDING', 'APPLIED', 'RETRACTION_PENDING', 'RETRACTED', 'FAILED');
CREATE TYPE "moderation_appeal_state" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'CHANGED', 'REJECTED');
CREATE TYPE "safety_party_role" AS ENUM ('REPORTER', 'SUBJECT');
CREATE TYPE "safety_response_disposition" AS ENUM ('AGREE', 'DISPUTE', 'PROVIDE_CONTEXT');

CREATE TABLE "safety_reviews" (
    "id" UUID PRIMARY KEY,
    "author_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "subject_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "match_id" UUID NOT NULL REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "safety_review_state" NOT NULL DEFAULT 'ACTIVE',
    "current_revision" INTEGER NOT NULL DEFAULT 1,
    "eligibility_revision" BIGINT NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "editable_until" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safety_reviews_author_subject_match_key" UNIQUE ("author_id", "subject_id", "match_id"),
    CONSTRAINT "safety_reviews_distinct_players_check" CHECK ("author_id" <> "subject_id"),
    CONSTRAINT "safety_reviews_revision_check" CHECK ("current_revision" > 0 AND "eligibility_revision" > 0),
    CONSTRAINT "safety_reviews_policy_check" CHECK (length(btrim("policy_version")) > 0),
    CONSTRAINT "safety_reviews_window_check" CHECK (
        "editable_until" > "created_at" AND "editable_until" <= "created_at" + INTERVAL '14 days'
    )
);
CREATE INDEX "safety_reviews_subject_projection_idx" ON "safety_reviews"("subject_id", "state", "updated_at");

CREATE TABLE "safety_review_revisions" (
    "review_id" UUID NOT NULL REFERENCES "safety_reviews"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL,
    "kind" "safety_review_revision_kind" NOT NULL,
    "experience_rating" SMALLINT,
    "tags" TEXT[] NOT NULL,
    "text_ciphertext" BYTEA,
    "encryption_key_version" INTEGER,
    "payload_checksum" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safety_review_revisions_pkey" PRIMARY KEY ("review_id", "revision"),
    CONSTRAINT "safety_review_revisions_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "safety_review_revisions_checksum_check" CHECK ("payload_checksum" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "safety_review_revisions_tags_check" CHECK (
        "tags" <@ ARRAY['RESPECT', 'COMMUNICATION', 'FAIR_PLAY']::TEXT[]
        AND cardinality("tags") <= 3
    ),
    CONSTRAINT "safety_review_revisions_payload_check" CHECK (
        ("kind" = 'SUBMITTED' AND "experience_rating" BETWEEN 1 AND 5
            AND (("text_ciphertext" IS NULL AND "encryption_key_version" IS NULL)
                OR ("text_ciphertext" IS NOT NULL AND "encryption_key_version" > 0)))
        OR ("kind" IN ('WITHDRAWN', 'TEXT_REDACTED') AND "experience_rating" IS NULL
            AND cardinality("tags") = 0 AND "text_ciphertext" IS NULL AND "encryption_key_version" IS NULL)
    )
);

CREATE FUNCTION "safety_validate_review_tags"() RETURNS trigger AS $$
DECLARE distinct_count INTEGER;
BEGIN
    SELECT count(DISTINCT value) INTO distinct_count FROM unnest(NEW."tags") value;
    IF cardinality(NEW."tags") <> distinct_count THEN RAISE EXCEPTION 'review tags must be distinct'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "safety_review_revisions_tags_guard" BEFORE INSERT ON "safety_review_revisions"
    FOR EACH ROW EXECUTE FUNCTION "safety_validate_review_tags"();

CREATE TABLE "safety_signals" (
    "id" UUID PRIMARY KEY,
    "reporter_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "reporter_pseudonym" UUID,
    "subject_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "subject_pseudonym" UUID,
    "kind" "safety_signal_kind" NOT NULL,
    "state" "safety_signal_state" NOT NULL DEFAULT 'RECEIVED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "policy_version" VARCHAR(128) NOT NULL,
    "uniqueness_key" CHAR(64) NOT NULL,
    "receipt_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safety_signals_reporter_subject_key" UNIQUE ("reporter_id", "uniqueness_key"),
    CONSTRAINT "safety_signals_reporter_identity_check" CHECK (
        ("reporter_id" IS NOT NULL AND "reporter_pseudonym" IS NULL)
        OR ("reporter_id" IS NULL AND "reporter_pseudonym" IS NOT NULL)
    ),
    CONSTRAINT "safety_signals_subject_identity_check" CHECK (
        "subject_id" IS NULL OR "subject_pseudonym" IS NULL
    ),
    CONSTRAINT "safety_signals_distinct_players_check" CHECK ("subject_id" IS NULL OR "subject_id" <> "reporter_id"),
    CONSTRAINT "safety_signals_version_check" CHECK ("version" >= 0),
    CONSTRAINT "safety_signals_hash_check" CHECK ("uniqueness_key" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "safety_signals_policy_check" CHECK (length(btrim("policy_version")) > 0),
    CONSTRAINT "safety_signals_retention_check" CHECK ("receipt_expires_at" > "created_at"),
    CONSTRAINT "safety_signals_resolution_check" CHECK (("state" = 'RESOLVED') = ("resolved_at" IS NOT NULL))
);
CREATE INDEX "safety_signals_receipt_idx" ON "safety_signals"("reporter_id", "created_at" DESC, "id" DESC);
CREATE INDEX "safety_signals_state_idx" ON "safety_signals"("state", "created_at");
CREATE INDEX "safety_signals_retention_idx" ON "safety_signals"("receipt_expires_at");

CREATE TABLE "no_show_reports" (
    "signal_id" UUID PRIMARY KEY REFERENCES "safety_signals"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "match_id" UUID NOT NULL REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "subject_player_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "reason" "safety_no_show_reason" NOT NULL,
    "source_revision" BIGINT NOT NULL,
    "eligibility_ends" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "no_show_reports_revision_check" CHECK ("source_revision" > 0)
);
CREATE INDEX "no_show_reports_subject_match_idx" ON "no_show_reports"("match_id", "subject_player_id");

CREATE TABLE "safety_reports" (
    "signal_id" UUID PRIMARY KEY REFERENCES "safety_signals"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "source_kind" "safety_report_source_kind" NOT NULL,
    "source_id" UUID NOT NULL,
    "source_revision" BIGINT NOT NULL,
    "reason_code" VARCHAR(64) NOT NULL,
    "time_bucket" VARCHAR(32),
    CONSTRAINT "safety_reports_revision_check" CHECK ("source_revision" > 0),
    CONSTRAINT "safety_reports_reason_check" CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    CONSTRAINT "safety_reports_time_bucket_check" CHECK (
        "time_bucket" IS NULL OR "time_bucket" IN ('NOW', 'TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'OVER_30_DAYS')
    )
);
CREATE INDEX "safety_reports_source_idx" ON "safety_reports"("source_kind", "source_id", "source_revision");

CREATE TABLE "safety_evidence" (
    "signal_id" UUID PRIMARY KEY REFERENCES "safety_signals"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "aad_version" INTEGER NOT NULL,
    "content_checksum" CHAR(64) NOT NULL,
    "retention_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "cryptoshredded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safety_evidence_encryption_check" CHECK ("encryption_key_version" > 0 AND "aad_version" > 0),
    CONSTRAINT "safety_evidence_checksum_check" CHECK ("content_checksum" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "safety_evidence_retention_check" CHECK ("retention_expires_at" > "created_at"),
    CONSTRAINT "safety_evidence_shred_check" CHECK ("cryptoshredded_at" IS NULL OR "cryptoshredded_at" >= "created_at")
);
CREATE INDEX "safety_evidence_retention_idx" ON "safety_evidence"("retention_expires_at");

CREATE TABLE "moderation_cases" (
    "id" UUID PRIMARY KEY,
    "category" "safety_signal_kind" NOT NULL,
    "state" "moderation_case_state" NOT NULL DEFAULT 'OPEN',
    "priority" "moderation_case_priority" NOT NULL DEFAULT 'NORMAL',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "assigned_moderator_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "conflict_detected_at" TIMESTAMPTZ(3),
    "retention_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    CONSTRAINT "moderation_cases_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "moderation_cases_assignment_check" CHECK (
        ("state" IN ('ASSIGNED', 'INVESTIGATING', 'DECIDED', 'CLOSED') AND "assigned_moderator_id" IS NOT NULL)
        OR ("state" IN ('OPEN', 'TRIAGED', 'REOPENED'))
    ),
    CONSTRAINT "moderation_cases_closed_check" CHECK (("state" = 'CLOSED') = ("closed_at" IS NOT NULL)),
    CONSTRAINT "moderation_cases_retention_check" CHECK ("retention_expires_at" > "created_at")
);
CREATE INDEX "moderation_cases_queue_idx" ON "moderation_cases"("state", "priority", "created_at");
CREATE INDEX "moderation_cases_assignment_idx" ON "moderation_cases"("assigned_moderator_id", "state");
CREATE INDEX "moderation_cases_retention_idx" ON "moderation_cases"("retention_expires_at");

CREATE TABLE "moderation_case_signals" (
    "case_id" UUID NOT NULL REFERENCES "moderation_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "signal_id" UUID NOT NULL REFERENCES "safety_signals"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderation_case_signals_pkey" PRIMARY KEY ("case_id", "signal_id"),
    CONSTRAINT "moderation_case_signals_signal_key" UNIQUE ("signal_id")
);

CREATE TABLE "safety_case_responses" (
    "id" UUID PRIMARY KEY,
    "case_id" UUID NOT NULL REFERENCES "moderation_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "signal_id" UUID NOT NULL REFERENCES "safety_signals"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "author_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "party_role" "safety_party_role" NOT NULL,
    "disposition" "safety_response_disposition",
    "ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "aad_version" INTEGER NOT NULL,
    "retention_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safety_case_responses_encryption_check" CHECK ("encryption_key_version" > 0 AND "aad_version" > 0),
    CONSTRAINT "safety_case_responses_retention_check" CHECK ("retention_expires_at" > "created_at")
);
CREATE INDEX "safety_case_responses_case_idx" ON "safety_case_responses"("case_id", "created_at");
CREATE INDEX "safety_case_responses_retention_idx" ON "safety_case_responses"("retention_expires_at");

CREATE TABLE "moderation_decisions" (
    "id" UUID PRIMARY KEY,
    "case_id" UUID NOT NULL REFERENCES "moderation_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL,
    "supersedes_decision_id" UUID REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "reviewer_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "outcome" "moderation_decision_outcome" NOT NULL,
    "policy_code" VARCHAR(96) NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "scope_code" VARCHAR(96) NOT NULL,
    "basis_checksum" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "review_deadline" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderation_decisions_case_revision_key" UNIQUE ("case_id", "revision"),
    CONSTRAINT "moderation_decisions_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "moderation_decisions_policy_check" CHECK (
        "policy_code" ~ '^[A-Z][A-Z0-9_]{1,95}$' AND length(btrim("policy_version")) > 0
        AND "scope_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'
    ),
    CONSTRAINT "moderation_decisions_checksum_check" CHECK ("basis_checksum" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "moderation_decisions_temporary_check" CHECK (
        "expires_at" IS NULL OR ("review_deadline" IS NOT NULL
            AND "expires_at" <= "created_at" + INTERVAL '72 hours'
            AND "review_deadline" <= "created_at" + INTERVAL '72 hours')
    )
);
CREATE INDEX "moderation_decisions_expiry_idx" ON "moderation_decisions"("expires_at");

CREATE TABLE "moderation_effects" (
    "id" UUID PRIMARY KEY,
    "decision_id" UUID NOT NULL REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "kind" "moderation_decision_outcome" NOT NULL,
    "state" "moderation_effect_state" NOT NULL DEFAULT 'PENDING',
    "logical_key" CHAR(64) NOT NULL,
    "owner_reference_id" UUID NOT NULL,
    "no_show_match_id" UUID REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "no_show_subject_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "source_revision" BIGINT NOT NULL,
    "applied_at" TIMESTAMPTZ(3),
    "retracted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderation_effects_logical_key" UNIQUE ("logical_key"),
    CONSTRAINT "moderation_effects_hash_check" CHECK ("logical_key" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "moderation_effects_revision_check" CHECK ("source_revision" > 0),
    CONSTRAINT "moderation_effects_kind_check" CHECK ("kind" <> 'NO_VIOLATION'),
    CONSTRAINT "moderation_effects_no_show_check" CHECK (
        ("kind" = 'NO_SHOW_CONFIRMED' AND "no_show_match_id" IS NOT NULL AND "no_show_subject_id" IS NOT NULL)
        OR ("kind" <> 'NO_SHOW_CONFIRMED' AND "no_show_match_id" IS NULL AND "no_show_subject_id" IS NULL)
    ),
    CONSTRAINT "moderation_effects_state_time_check" CHECK (
        ("state" IN ('PENDING', 'FAILED') AND "applied_at" IS NULL AND "retracted_at" IS NULL)
        OR ("state" IN ('APPLIED', 'RETRACTION_PENDING') AND "applied_at" IS NOT NULL AND "retracted_at" IS NULL)
        OR ("state" = 'RETRACTED' AND "applied_at" IS NOT NULL AND "retracted_at" IS NOT NULL)
    )
);
CREATE INDEX "moderation_effects_dispatch_idx" ON "moderation_effects"("state", "created_at");
CREATE UNIQUE INDEX "moderation_effects_no_show_outcome_key"
    ON "moderation_effects"("no_show_match_id", "no_show_subject_id") WHERE "kind" = 'NO_SHOW_CONFIRMED';

CREATE TABLE "moderation_appeals" (
    "id" UUID PRIMARY KEY,
    "decision_id" UUID NOT NULL REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "appellant_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "reviewer_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "moderation_appeal_state" NOT NULL DEFAULT 'SUBMITTED',
    "reason_code" VARCHAR(64) NOT NULL,
    "text_ciphertext" BYTEA,
    "encryption_key_version" INTEGER,
    "retention_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderation_appeals_decision_appellant_key" UNIQUE ("decision_id", "appellant_id"),
    CONSTRAINT "moderation_appeals_reason_check" CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    CONSTRAINT "moderation_appeals_encryption_check" CHECK (
        ("text_ciphertext" IS NULL AND "encryption_key_version" IS NULL)
        OR ("text_ciphertext" IS NOT NULL AND "encryption_key_version" > 0)
    ),
    CONSTRAINT "moderation_appeals_retention_check" CHECK ("retention_expires_at" > "created_at")
);
CREATE INDEX "moderation_appeals_queue_idx" ON "moderation_appeals"("state", "created_at");
CREATE INDEX "moderation_appeals_retention_idx" ON "moderation_appeals"("retention_expires_at");

CREATE TABLE "review_reputation_contributions" (
    "review_id" UUID PRIMARY KEY REFERENCES "safety_reviews"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "subject_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "match_id" UUID NOT NULL REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "author_key" CHAR(64) NOT NULL,
    "review_revision" INTEGER NOT NULL,
    "rating" SMALLINT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "source_checksum" CHAR(64) NOT NULL,
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_reputation_distinct_source_key" UNIQUE ("subject_id", "match_id", "author_key"),
    CONSTRAINT "review_reputation_values_check" CHECK ("review_revision" > 0 AND "rating" BETWEEN 1 AND 5),
    CONSTRAINT "review_reputation_hashes_check" CHECK (
        "author_key" ~ '^[a-f0-9]{64}$' AND "source_checksum" ~ '^[a-f0-9]{64}$'
    )
);
CREATE INDEX "review_reputation_contributions_subject_idx"
    ON "review_reputation_contributions"("subject_id", "eligible");

CREATE TABLE "review_reputation_aggregates" (
    "subject_id" UUID PRIMARY KEY REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "rating_sum" BIGINT NOT NULL DEFAULT 0,
    "review_count" BIGINT NOT NULL DEFAULT 0,
    "source_digest" CHAR(64) NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_reputation_aggregates_values_check" CHECK (
        "review_count" >= 0 AND "rating_sum" BETWEEN "review_count" AND "review_count" * 5
    ),
    CONSTRAINT "review_reputation_aggregates_digest_check" CHECK ("source_digest" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "safety_legal_holds" (
    "id" UUID PRIMARY KEY,
    "case_id" UUID NOT NULL REFERENCES "moderation_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "record_scope" VARCHAR(96) NOT NULL,
    "reason_code" VARCHAR(96) NOT NULL,
    "owner_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "review_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safety_legal_holds_scope_check" CHECK ("record_scope" ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    CONSTRAINT "safety_legal_holds_reason_check" CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    CONSTRAINT "safety_legal_holds_dates_check" CHECK (
        "review_at" > "created_at" AND "expires_at" >= "review_at"
        AND ("released_at" IS NULL OR "released_at" >= "created_at")
    )
);
CREATE INDEX "safety_legal_holds_expiry_idx" ON "safety_legal_holds"("expires_at", "released_at");

CREATE TABLE "safety_idempotency_records" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "idempotency_key" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "canonical_path" VARCHAR(200) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT "safety_idempotency_scope_key" UNIQUE ("user_id", "method", "canonical_path", "idempotency_key"),
    CONSTRAINT "safety_idempotency_request_fingerprint_check" CHECK ("request_fingerprint" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "safety_idempotency_response_status_check" CHECK ("response_status" BETWEEN 200 AND 599),
    CONSTRAINT "safety_idempotency_key_version_check" CHECK ("encryption_key_version" > 0),
    CONSTRAINT "safety_idempotency_expiry_check" CHECK ("expires_at" = "created_at" + INTERVAL '24 hours')
);
CREATE INDEX "safety_idempotency_expiry_idx" ON "safety_idempotency_records"("expires_at");

CREATE FUNCTION "safety_forbid_mutation"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "safety_review_revisions_append_only" BEFORE UPDATE OR DELETE ON "safety_review_revisions"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "moderation_case_signals_append_only" BEFORE UPDATE OR DELETE ON "moderation_case_signals"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "safety_case_responses_append_only" BEFORE UPDATE OR DELETE ON "safety_case_responses"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "moderation_decisions_append_only" BEFORE UPDATE OR DELETE ON "moderation_decisions"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();
CREATE TRIGGER "audit_entries_immutable" BEFORE UPDATE OR DELETE ON "audit_entries"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();

CREATE FUNCTION "safety_signal_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF (OLD."reporter_id" IS NULL AND NEW."reporter_id" IS NOT NULL)
        OR (OLD."reporter_id" IS NOT NULL AND NEW."reporter_id" IS NOT NULL
            AND NEW."reporter_id" <> OLD."reporter_id")
        OR (OLD."reporter_pseudonym" IS NOT NULL AND NEW."reporter_pseudonym" <> OLD."reporter_pseudonym")
        OR (OLD."subject_id" IS NULL AND NEW."subject_id" IS NOT NULL)
        OR (OLD."subject_id" IS NOT NULL AND NEW."subject_id" IS NOT NULL AND NEW."subject_id" <> OLD."subject_id")
        OR (OLD."subject_pseudonym" IS NOT NULL AND NEW."subject_pseudonym" <> OLD."subject_pseudonym")
        OR NEW."kind" <> OLD."kind" OR NEW."policy_version" <> OLD."policy_version"
        OR NEW."uniqueness_key" <> OLD."uniqueness_key" OR NEW."created_at" <> OLD."created_at" THEN
        RAISE EXCEPTION 'accepted signal metadata is immutable';
    END IF;
    IF NEW."version" <> OLD."version" + 1 THEN RAISE EXCEPTION 'signal version must advance exactly once'; END IF;
    IF (OLD."state" = 'RECEIVED' AND NEW."state" NOT IN ('LINKED', 'UNDER_REVIEW', 'WITHDRAW_REQUESTED', 'RESOLVED'))
        OR (OLD."state" = 'LINKED' AND NEW."state" NOT IN ('UNDER_REVIEW', 'WITHDRAW_REQUESTED', 'RESOLVED'))
        OR (OLD."state" = 'UNDER_REVIEW' AND NEW."state" NOT IN ('WITHDRAW_REQUESTED', 'RESOLVED'))
        OR (OLD."state" = 'WITHDRAW_REQUESTED' AND NEW."state" NOT IN ('UNDER_REVIEW', 'RESOLVED'))
        OR (OLD."state" = 'RESOLVED') THEN
        RAISE EXCEPTION 'invalid safety signal transition';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "safety_signals_transition_guard" BEFORE UPDATE ON "safety_signals"
    FOR EACH ROW EXECUTE FUNCTION "safety_signal_transition_guard"();

CREATE FUNCTION "safety_review_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."author_id" <> OLD."author_id" OR NEW."subject_id" <> OLD."subject_id"
        OR NEW."match_id" <> OLD."match_id" OR NEW."policy_version" <> OLD."policy_version"
        OR NEW."eligibility_revision" <> OLD."eligibility_revision" OR NEW."editable_until" <> OLD."editable_until"
        OR NEW."created_at" <> OLD."created_at" THEN RAISE EXCEPTION 'review identity is immutable'; END IF;
    IF NEW."current_revision" <> OLD."current_revision" + 1 THEN
        RAISE EXCEPTION 'review revision must advance exactly once';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "safety_reviews_transition_guard" BEFORE UPDATE ON "safety_reviews"
    FOR EACH ROW EXECUTE FUNCTION "safety_review_transition_guard"();

CREATE FUNCTION "moderation_case_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."category" <> OLD."category" OR NEW."created_at" <> OLD."created_at" THEN
        RAISE EXCEPTION 'case identity is immutable';
    END IF;
    IF NEW."revision" <> OLD."revision" + 1 THEN RAISE EXCEPTION 'case revision must advance exactly once'; END IF;
    IF (OLD."state" = 'OPEN' AND NEW."state" NOT IN ('TRIAGED', 'ASSIGNED'))
        OR (OLD."state" = 'TRIAGED' AND NEW."state" <> 'ASSIGNED')
        OR (OLD."state" = 'ASSIGNED' AND NEW."state" <> 'INVESTIGATING')
        OR (OLD."state" = 'INVESTIGATING' AND NEW."state" <> 'DECIDED')
        OR (OLD."state" = 'DECIDED' AND NEW."state" <> 'CLOSED')
        OR (OLD."state" = 'CLOSED' AND NEW."state" <> 'REOPENED')
        OR (OLD."state" = 'REOPENED' AND NEW."state" <> 'ASSIGNED') THEN
        RAISE EXCEPTION 'invalid moderation case transition';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "moderation_cases_transition_guard" BEFORE UPDATE ON "moderation_cases"
    FOR EACH ROW EXECUTE FUNCTION "moderation_case_transition_guard"();

CREATE FUNCTION "safety_validate_signal_subtype"() RETURNS trigger AS $$
DECLARE signal_kind "safety_signal_kind";
BEGIN
    SELECT "kind" INTO signal_kind FROM "safety_signals" WHERE "id" = NEW."signal_id";
    IF TG_TABLE_NAME = 'no_show_reports' AND signal_kind <> 'NO_SHOW' THEN
        RAISE EXCEPTION 'no-show subtype requires NO_SHOW signal';
    ELSIF TG_TABLE_NAME = 'safety_reports' AND signal_kind = 'NO_SHOW' THEN
        RAISE EXCEPTION 'generic report cannot use NO_SHOW signal';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "no_show_reports_subtype_guard" BEFORE INSERT OR UPDATE ON "no_show_reports"
    FOR EACH ROW EXECUTE FUNCTION "safety_validate_signal_subtype"();
CREATE TRIGGER "safety_reports_subtype_guard" BEFORE INSERT OR UPDATE ON "safety_reports"
    FOR EACH ROW EXECUTE FUNCTION "safety_validate_signal_subtype"();

CREATE FUNCTION "safety_validate_signal_shape"() RETURNS trigger AS $$
DECLARE no_show_count INTEGER; report_count INTEGER;
BEGIN
    SELECT count(*) INTO no_show_count FROM "no_show_reports" WHERE "signal_id" = NEW."id";
    SELECT count(*) INTO report_count FROM "safety_reports" WHERE "signal_id" = NEW."id";
    IF (NEW."kind" = 'NO_SHOW' AND (no_show_count <> 1 OR report_count <> 0))
        OR (NEW."kind" <> 'NO_SHOW' AND (no_show_count <> 0 OR report_count <> 1)) THEN
        RAISE EXCEPTION 'signal requires exactly one matching subtype';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "safety_signals_shape_guard" AFTER INSERT OR UPDATE ON "safety_signals"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "safety_validate_signal_shape"();

CREATE FUNCTION "safety_validate_report_taxonomy"() RETURNS trigger AS $$
DECLARE signal_kind "safety_signal_kind";
BEGIN
    SELECT "kind" INTO signal_kind FROM "safety_signals" WHERE "id" = NEW."signal_id";
    IF (signal_kind = 'SAFETY' AND (NEW."reason_code" NOT IN (
            'THREAT', 'HARASSMENT', 'HATE_OR_DISCRIMINATION', 'STALKING', 'PHYSICAL_SAFETY', 'OTHER_SAFETY'
        ) OR NEW."time_bucket" IS NULL))
        OR (signal_kind = 'CONTENT' AND (NEW."source_kind" NOT IN ('CHAT_MESSAGE', 'MATCH', 'PROFILE')
            OR NEW."reason_code" NOT IN ('SPAM', 'HARASSMENT', 'HATE', 'THREAT', 'OTHER')
            OR NEW."time_bucket" IS NOT NULL))
        OR (signal_kind = 'VENUE' AND (NEW."source_kind" <> 'VENUE'
            OR NEW."reason_code" NOT IN ('PRIVATE_RESIDENCE', 'DUPLICATE', 'CLOSED')
            OR NEW."time_bucket" IS NOT NULL))
        OR (signal_kind = 'RESULT' AND (NEW."source_kind" <> 'MATCH_RESULT'
            OR NEW."reason_code" NOT IN ('WRONG_SCORE', 'WRONG_WINNER', 'MATCH_NOT_PLAYED', 'OTHER')
            OR NEW."time_bucket" IS NOT NULL)) THEN
        RAISE EXCEPTION 'report category, source and reason do not match';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "safety_reports_taxonomy_guard" BEFORE INSERT OR UPDATE ON "safety_reports"
    FOR EACH ROW EXECUTE FUNCTION "safety_validate_report_taxonomy"();

CREATE FUNCTION "safety_validate_review_head"() RETURNS trigger AS $$
DECLARE head "safety_review_revisions"%ROWTYPE;
BEGIN
    SELECT * INTO head FROM "safety_review_revisions"
        WHERE "review_id" = NEW."id" AND "revision" = NEW."current_revision";
    IF NOT FOUND OR (NEW."state" = 'ACTIVE' AND head."kind" <> 'SUBMITTED')
        OR (NEW."state" = 'WITHDRAWN' AND head."kind" <> 'WITHDRAWN') THEN
        RAISE EXCEPTION 'review head does not match current revision and state';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "safety_reviews_head_guard" AFTER INSERT OR UPDATE ON "safety_reviews"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "safety_validate_review_head"();

CREATE FUNCTION "safety_validate_case_signal"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "moderation_cases" c JOIN "safety_signals" s ON s."id" = NEW."signal_id"
        WHERE c."id" = NEW."case_id" AND c."category" = s."kind"
    ) THEN RAISE EXCEPTION 'case and signal category must match'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "moderation_case_signals_category_guard" BEFORE INSERT ON "moderation_case_signals"
    FOR EACH ROW EXECUTE FUNCTION "safety_validate_case_signal"();

CREATE FUNCTION "safety_validate_decision_reviewer"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "moderation_cases" c WHERE c."id" = NEW."case_id"
          AND c."assigned_moderator_id" = NEW."reviewer_id" AND c."conflict_detected_at" IS NULL
          AND c."state" IN ('INVESTIGATING', 'DECIDED')
    ) THEN RAISE EXCEPTION 'decision requires assigned conflict-free reviewer'; END IF;
    IF NEW."revision" = 1 AND NEW."supersedes_decision_id" IS NOT NULL THEN
        RAISE EXCEPTION 'initial decision cannot supersede another decision';
    ELSIF NEW."revision" > 1 AND NOT EXISTS (
        SELECT 1 FROM "moderation_decisions" d WHERE d."id" = NEW."supersedes_decision_id"
          AND d."case_id" = NEW."case_id" AND d."revision" = NEW."revision" - 1
    ) THEN RAISE EXCEPTION 'decision revisions must form a contiguous chain'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "moderation_decisions_reviewer_guard" BEFORE INSERT ON "moderation_decisions"
    FOR EACH ROW EXECUTE FUNCTION "safety_validate_decision_reviewer"();

CREATE FUNCTION "safety_validate_appeal_reviewer"() RETURNS trigger AS $$
BEGIN
    IF NEW."reviewer_id" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "moderation_decisions" d
        WHERE d."id" = NEW."decision_id" AND d."reviewer_id" = NEW."reviewer_id"
    ) THEN RAISE EXCEPTION 'appeal reviewer must differ from decision reviewer'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "moderation_appeals_reviewer_guard" BEFORE INSERT OR UPDATE OF "reviewer_id" ON "moderation_appeals"
    FOR EACH ROW EXECUTE FUNCTION "safety_validate_appeal_reviewer"();

CREATE FUNCTION "moderation_appeal_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."decision_id" <> OLD."decision_id" OR NEW."appellant_id" <> OLD."appellant_id"
        OR NEW."reason_code" <> OLD."reason_code" OR NEW."text_ciphertext" IS DISTINCT FROM OLD."text_ciphertext"
        OR NEW."encryption_key_version" IS DISTINCT FROM OLD."encryption_key_version"
        OR NEW."created_at" <> OLD."created_at" THEN RAISE EXCEPTION 'appeal submission is immutable'; END IF;
    IF (OLD."state" = 'SUBMITTED' AND NEW."state" <> 'UNDER_REVIEW')
        OR (OLD."state" = 'UNDER_REVIEW' AND NEW."state" NOT IN ('UPHELD', 'CHANGED', 'REJECTED'))
        OR OLD."state" IN ('UPHELD', 'CHANGED', 'REJECTED') THEN
        RAISE EXCEPTION 'invalid appeal transition';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "moderation_appeals_transition_guard" BEFORE UPDATE ON "moderation_appeals"
    FOR EACH ROW EXECUTE FUNCTION "moderation_appeal_transition_guard"();

CREATE FUNCTION "moderation_effect_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."decision_id" <> OLD."decision_id" OR NEW."kind" <> OLD."kind"
        OR NEW."logical_key" <> OLD."logical_key" OR NEW."owner_reference_id" <> OLD."owner_reference_id"
        OR NEW."no_show_match_id" IS DISTINCT FROM OLD."no_show_match_id"
        OR NEW."no_show_subject_id" IS DISTINCT FROM OLD."no_show_subject_id"
        OR NEW."source_revision" <> OLD."source_revision" OR NEW."created_at" <> OLD."created_at" THEN
        RAISE EXCEPTION 'effect identity is immutable';
    END IF;
    IF (OLD."state" = 'PENDING' AND NEW."state" NOT IN ('APPLIED', 'FAILED'))
        OR (OLD."state" = 'APPLIED' AND NEW."state" <> 'RETRACTION_PENDING')
        OR (OLD."state" = 'RETRACTION_PENDING' AND NEW."state" NOT IN ('RETRACTED', 'FAILED'))
        OR OLD."state" IN ('RETRACTED', 'FAILED') THEN
        RAISE EXCEPTION 'invalid moderation effect transition';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "moderation_effects_transition_guard" BEFORE UPDATE ON "moderation_effects"
    FOR EACH ROW EXECUTE FUNCTION "moderation_effect_transition_guard"();

COMMENT ON TABLE "safety_evidence" IS
    'Restricted authenticated ciphertext in approved Russian residency; cleanup is blocked only by an active case-scoped legal hold.';
COMMENT ON TABLE "review_reputation_aggregates" IS
    'Public API emits average and count only when review_count >= 5; pending reports, text, tags, blocks and sanctions are excluded.';
COMMENT ON TABLE "safety_legal_holds" IS
    'Addressed holds name one case and record scope with owner, review and expiry; no account-wide indefinite hold.';
