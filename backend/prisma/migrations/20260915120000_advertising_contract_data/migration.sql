CREATE TYPE "ad_campaign_state" AS ENUM (
    'DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'EXHAUSTED', 'COMPLETED', 'REJECTED'
);
CREATE TYPE "ad_creative_format" AS ENUM ('STATIC_IMAGE', 'TEXT_IMAGE_CARD');
CREATE TYPE "ad_billing_model" AS ENUM ('CPM', 'CPC', 'FIXED_SPONSORSHIP');
CREATE TYPE "ad_priority_tier" AS ENUM ('HOUSE_EMERGENCY', 'GUARANTEED_DIRECT', 'STANDARD_DIRECT');
CREATE TYPE "ad_target_dimension" AS ENUM (
    'SURFACE', 'CLIENT_KIND', 'LOCALE', 'FORM_FACTOR', 'OBJECT_CLASS', 'CONTENT_CATEGORY',
    'COUNTRY', 'REGION', 'CITY', 'CONNECTIVITY'
);
CREATE TYPE "ad_target_operator" AS ENUM ('INCLUDE', 'EXCLUDE');
CREATE TYPE "ad_delivery_source" AS ENUM ('DIRECT', 'EXTERNAL_FALLBACK', 'HOUSE');
CREATE TYPE "ad_delivery_event_kind" AS ENUM (
    'ISSUED', 'VIEWABLE_IMPRESSION', 'VALID_CLICK', 'INVALID_CLICK', 'RESERVATION_RELEASED'
);
CREATE TYPE "ad_campaign_decision_kind" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'PAUSE', 'RESUME');

CREATE TABLE "campaigns" (
    "id" UUID PRIMARY KEY,
    "version" BIGINT NOT NULL DEFAULT 0 CHECK ("version" >= 0),
    "state" "ad_campaign_state" NOT NULL DEFAULT 'DRAFT',
    "advertiser_name" VARCHAR(160) NOT NULL CHECK (char_length(btrim("advertiser_name")) BETWEEN 1 AND 160),
    "advertiser_legal_id" VARCHAR(120) NOT NULL CHECK (char_length(btrim("advertiser_legal_id")) BETWEEN 1 AND 120),
    "timezone" VARCHAR(64) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "currency" CHAR(3) NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'),
    "budget_minor" BIGINT NOT NULL CHECK ("budget_minor" > 0),
    "reserved_minor" BIGINT NOT NULL DEFAULT 0,
    "spent_minor" BIGINT NOT NULL DEFAULT 0,
    "current_revision_id" UUID,
    "approved_revision_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaigns_schedule_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "campaigns_budget_guard" CHECK (
        "reserved_minor" >= 0 AND "spent_minor" >= 0
        AND "reserved_minor" + "spent_minor" <= "budget_minor"
    ),
    CONSTRAINT "campaigns_current_revision_key" UNIQUE ("current_revision_id"),
    CONSTRAINT "campaigns_approved_revision_key" UNIQUE ("approved_revision_id")
);
CREATE INDEX "campaigns_delivery_idx" ON "campaigns" ("state", "starts_at", "ends_at");

CREATE TABLE "campaign_revisions" (
    "id" UUID PRIMARY KEY,
    "campaign_id" UUID NOT NULL REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL CHECK ("revision" > 0),
    "advertiser_name" VARCHAR(160) NOT NULL CHECK (char_length(btrim("advertiser_name")) BETWEEN 1 AND 160),
    "advertiser_legal_id" VARCHAR(120) NOT NULL CHECK (char_length(btrim("advertiser_legal_id")) BETWEEN 1 AND 120),
    "timezone" VARCHAR(64) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "currency" CHAR(3) NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'),
    "budget_minor" BIGINT NOT NULL CHECK ("budget_minor" > 0),
    "billing_model" "ad_billing_model" NOT NULL,
    "rate_minor" BIGINT NOT NULL CHECK ("rate_minor" >= 0),
    "priority_tier" "ad_priority_tier" NOT NULL,
    "cap_24_hours" SMALLINT NOT NULL CHECK ("cap_24_hours" BETWEEN 1 AND 3),
    "cap_7_days" SMALLINT NOT NULL CHECK ("cap_7_days" BETWEEN "cap_24_hours" AND 10),
    "placement_ids" UUID[] NOT NULL,
    "creative_ids" UUID[] NOT NULL,
    "legal_label" VARCHAR(40) NOT NULL CHECK ("legal_label" = 'Реклама'),
    "legal_disclosure" VARCHAR(500),
    "registration_token" VARCHAR(160),
    "policy_version" VARCHAR(32) NOT NULL CHECK ("policy_version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'),
    "snapshot_hash" CHAR(64) NOT NULL CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$'),
    "submitted_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_revisions_revision_key" UNIQUE ("campaign_id", "revision"),
    CONSTRAINT "campaign_revisions_schedule_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "campaign_revisions_review_separation_check" CHECK (
        "approved_at" IS NULL OR ("reviewed_by_user_id" IS NOT NULL AND "reviewed_by_user_id" <> "submitted_by_user_id")
    ),
    CONSTRAINT "campaign_revisions_inventory_check" CHECK (
        cardinality("placement_ids") BETWEEN 1 AND 100 AND cardinality("creative_ids") BETWEEN 1 AND 100
    )
);
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_current_revision_fkey"
    FOREIGN KEY ("current_revision_id") REFERENCES "campaign_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_revision_fkey"
    FOREIGN KEY ("approved_revision_id") REFERENCES "campaign_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "creatives" (
    "id" UUID PRIMARY KEY,
    "campaign_id" UUID NOT NULL REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" INTEGER NOT NULL CHECK ("revision" > 0),
    "format" "ad_creative_format" NOT NULL,
    "asset_id" UUID NOT NULL,
    "media_type" VARCHAR(40) NOT NULL CHECK ("media_type" IN ('image/avif', 'image/jpeg', 'image/png', 'image/webp')),
    "byte_length" BIGINT NOT NULL CHECK ("byte_length" BETWEEN 1 AND 1048576),
    "sha256" CHAR(64) NOT NULL CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    "alt_text" VARCHAR(500) NOT NULL CHECK (char_length(btrim("alt_text")) BETWEEN 1 AND 500),
    "headline" VARCHAR(120),
    "body" VARCHAR(300),
    "landing_url" VARCHAR(2048) NOT NULL CHECK ("landing_url" ~ '^https://'),
    "approved_redirect_hosts" VARCHAR(253)[] NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "creatives_campaign_revision_key" UNIQUE ("campaign_id", "revision"),
    CONSTRAINT "creatives_card_shape_check" CHECK (
        ("format" = 'STATIC_IMAGE' AND "headline" IS NULL AND "body" IS NULL)
        OR ("format" = 'TEXT_IMAGE_CARD' AND char_length(btrim("headline")) BETWEEN 1 AND 120)
    ),
    CONSTRAINT "creatives_redirect_hosts_check" CHECK (cardinality("approved_redirect_hosts") BETWEEN 1 AND 10)
);

CREATE TABLE "ad_campaign_decisions" (
    "id" UUID PRIMARY KEY,
    "campaign_id" UUID NOT NULL REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "campaign_revision_id" UUID NOT NULL REFERENCES "campaign_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "campaign_version" BIGINT NOT NULL CHECK ("campaign_version" >= 0),
    "kind" "ad_campaign_decision_kind" NOT NULL,
    "reason_code" VARCHAR(40) NOT NULL,
    "checklist_version" VARCHAR(32),
    "actor_user_id" UUID NOT NULL,
    "reviewer_user_id" UUID,
    "operation_id" UUID NOT NULL CONSTRAINT "ad_campaign_decisions_operation_key" UNIQUE,
    "committed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ad_campaign_decisions_version_key" UNIQUE ("campaign_id", "campaign_version"),
    CONSTRAINT "ad_campaign_decisions_review_check" CHECK (
        ("kind" = 'APPROVE' AND "reviewer_user_id" = "actor_user_id"
            AND "checklist_version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$')
        OR ("kind" <> 'APPROVE' AND "reviewer_user_id" IS NULL)
    )
);

CREATE TABLE "placements" (
    "id" UUID PRIMARY KEY,
    "version" BIGINT NOT NULL DEFAULT 0 CHECK ("version" >= 0),
    "code" VARCHAR(80) NOT NULL CONSTRAINT "placements_code_key" UNIQUE CHECK ("code" ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
    "surface" VARCHAR(80) NOT NULL CHECK ("surface" ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
    "format" "ad_creative_format" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "fallback_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "minimum_width" SMALLINT NOT NULL CHECK ("minimum_width" BETWEEN 1 AND 4096),
    "minimum_height" SMALLINT NOT NULL CHECK ("minimum_height" BETWEEN 1 AND 4096),
    "paused_reason" VARCHAR(40),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "placements_pause_shape_check" CHECK ("enabled" OR "paused_reason" IS NOT NULL),
    CONSTRAINT "placements_fallback_gate_check" CHECK (NOT "fallback_enabled" OR "enabled")
);

CREATE TABLE "target_rules" (
    "id" UUID PRIMARY KEY,
    "campaign_revision_id" UUID NOT NULL REFERENCES "campaign_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "dimension" "ad_target_dimension" NOT NULL,
    "operator" "ad_target_operator" NOT NULL,
    "values" VARCHAR(120)[] NOT NULL CHECK (cardinality("values") BETWEEN 1 AND 100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "target_rules_revision_dimension_key" UNIQUE ("campaign_revision_id", "dimension", "operator")
);

CREATE TABLE "delivery_counters" (
    "id" UUID PRIMARY KEY,
    "campaign_id" UUID NOT NULL REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "cap_subject_hash" CHAR(64) NOT NULL CHECK ("cap_subject_hash" ~ '^[0-9a-f]{64}$'),
    "window_24_started_at" TIMESTAMPTZ(3) NOT NULL,
    "window_7_started_at" TIMESTAMPTZ(3) NOT NULL,
    "viewable_24_count" SMALLINT NOT NULL DEFAULT 0 CHECK ("viewable_24_count" BETWEEN 0 AND 3),
    "viewable_7_count" SMALLINT NOT NULL DEFAULT 0 CHECK ("viewable_7_count" BETWEEN 0 AND 10),
    "session_viewable_count" SMALLINT NOT NULL DEFAULT 0 CHECK ("session_viewable_count" BETWEEN 0 AND 1),
    "last_viewable_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_counters_campaign_subject_key" UNIQUE ("campaign_id", "cap_subject_hash"),
    CONSTRAINT "delivery_counters_expiry_check" CHECK (
        "expires_at" <= COALESCE("last_viewable_at", "updated_at") + INTERVAL '8 days'
    )
);
CREATE INDEX "delivery_counters_expiry_idx" ON "delivery_counters" ("expires_at");

CREATE TABLE "ad_delivery_events" (
    "id" UUID PRIMARY KEY,
    "delivery_id" UUID NOT NULL,
    "kind" "ad_delivery_event_kind" NOT NULL,
    "source" "ad_delivery_source" NOT NULL,
    "campaign_id" UUID NOT NULL REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "campaign_revision_id" UUID NOT NULL REFERENCES "campaign_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "creative_id" UUID NOT NULL REFERENCES "creatives"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "placement_id" UUID NOT NULL REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "delivery_counter_id" UUID REFERENCES "delivery_counters"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "delivery_token_hash" CHAR(64),
    "click_token_hash" CHAR(64),
    "token_expires_at" TIMESTAMPTZ(3),
    "reserved_minor" BIGINT NOT NULL DEFAULT 0 CHECK ("reserved_minor" >= 0),
    "finalized_minor" BIGINT NOT NULL DEFAULT 0 CHECK ("finalized_minor" >= 0),
    "invalid_reason" VARCHAR(40),
    "timing_bucket" VARCHAR(24) NOT NULL,
    "policy_version" VARCHAR(32) NOT NULL CHECK ("policy_version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ad_delivery_events_delivery_kind_key" UNIQUE ("delivery_id", "kind"),
    CONSTRAINT "ad_delivery_events_token_shape_check" CHECK (
        ("kind" = 'ISSUED' AND "delivery_token_hash" ~ '^[0-9a-f]{64}$' AND "click_token_hash" ~ '^[0-9a-f]{64}$'
            AND "token_expires_at" > "occurred_at" AND "token_expires_at" <= "occurred_at" + INTERVAL '15 minutes')
        OR ("kind" <> 'ISSUED' AND "delivery_token_hash" IS NULL AND "click_token_hash" IS NULL
            AND "token_expires_at" IS NULL)
    ),
    CONSTRAINT "ad_delivery_events_invalid_shape_check" CHECK (("kind" = 'INVALID_CLICK') = ("invalid_reason" IS NOT NULL)),
    CONSTRAINT "ad_delivery_events_retention_check" CHECK ("expires_at" <= "occurred_at" + INTERVAL '30 days'),
    CONSTRAINT "ad_delivery_events_money_shape_check" CHECK (
        ("kind" = 'ISSUED' AND "finalized_minor" = 0)
        OR ("kind" IN ('VIEWABLE_IMPRESSION', 'VALID_CLICK') AND "reserved_minor" = 0)
        OR ("kind" IN ('INVALID_CLICK', 'RESERVATION_RELEASED') AND "reserved_minor" = 0 AND "finalized_minor" = 0)
    )
);
CREATE UNIQUE INDEX "ad_delivery_events_delivery_token_key" ON "ad_delivery_events" ("delivery_token_hash")
    WHERE "delivery_token_hash" IS NOT NULL;
CREATE UNIQUE INDEX "ad_delivery_events_click_token_key" ON "ad_delivery_events" ("click_token_hash")
    WHERE "click_token_hash" IS NOT NULL;
CREATE INDEX "ad_delivery_events_expiry_idx" ON "ad_delivery_events" ("expires_at");

CREATE TABLE "ad_report_daily" (
    "day" DATE NOT NULL,
    "campaign_id" UUID NOT NULL REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "creative_id" UUID NOT NULL REFERENCES "creatives"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "placement_id" UUID NOT NULL REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "eligible" BIGINT NOT NULL DEFAULT 0 CHECK ("eligible" >= 0),
    "served" BIGINT NOT NULL DEFAULT 0 CHECK ("served" >= 0),
    "viewable" BIGINT NOT NULL DEFAULT 0 CHECK ("viewable" >= 0),
    "valid_clicks" BIGINT NOT NULL DEFAULT 0 CHECK ("valid_clicks" >= 0),
    "invalid_events" BIGINT NOT NULL DEFAULT 0 CHECK ("invalid_events" >= 0),
    "spend_minor" BIGINT NOT NULL DEFAULT 0 CHECK ("spend_minor" >= 0),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("day", "campaign_id", "creative_id", "placement_id"),
    CONSTRAINT "ad_report_daily_funnel_check" CHECK ("viewable" <= "served" AND "valid_clicks" <= "served")
);

CREATE TABLE "ad_provider_policies" (
    "id" UUID PRIMARY KEY,
    "code" VARCHAR(80) NOT NULL CHECK ("code" ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
    "version" INTEGER NOT NULL CHECK ("version" > 0),
    "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "legal_review" "content_review_state" NOT NULL,
    "security_review" "content_review_state" NOT NULL,
    "privacy_review" "content_review_state" NOT NULL,
    "commercial_review" "content_review_state" NOT NULL,
    "terms_url" VARCHAR(2048) NOT NULL CHECK ("terms_url" ~ '^https://'),
    "terms_version" VARCHAR(120) NOT NULL,
    "allowed_fields" VARCHAR(40)[] NOT NULL,
    "review_due_at" TIMESTAMPTZ(3) NOT NULL,
    "evidence_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL CHECK ("encryption_key_version" > 0),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ad_provider_policies_code_version_key" UNIQUE ("code", "version"),
    CONSTRAINT "ad_provider_policies_enable_gate_check" CHECK (
        NOT "enabled" OR (
            "legal_review" = 'APPROVED' AND "security_review" = 'APPROVED'
            AND "privacy_review" = 'APPROVED' AND "commercial_review" = 'APPROVED'
        )
    ),
    CONSTRAINT "ad_provider_policies_allowlist_check" CHECK (
        "allowed_fields" <@ ARRAY[
            'SURFACE', 'CLIENT_KIND', 'LOCALE', 'FORM_FACTOR', 'OBJECT_CLASS', 'CONTENT_CATEGORY',
            'COUNTRY', 'REGION', 'CITY', 'CONNECTIVITY'
        ]::VARCHAR(40)[]
    )
);

CREATE TABLE "advertising_operation_receipts" (
    "id" UUID PRIMARY KEY,
    "actor_scope_hash" CHAR(64) NOT NULL CHECK ("actor_scope_hash" ~ '^[0-9a-f]{64}$'),
    "idempotency_key" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "canonical_path" VARCHAR(240) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
    "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL CHECK ("encryption_key_version" > 0),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    CONSTRAINT "advertising_operation_receipts_scope_key" UNIQUE (
        "actor_scope_hash", "method", "canonical_path", "idempotency_key"
    ),
    CONSTRAINT "advertising_operation_receipts_retention_check" CHECK ("expires_at" <= "created_at" + INTERVAL '30 days')
);
CREATE INDEX "advertising_operation_receipts_expiry_idx" ON "advertising_operation_receipts" ("expires_at");

CREATE FUNCTION "advertising_immutable_row"() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is immutable', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "campaign_revisions_immutable" BEFORE UPDATE OR DELETE ON "campaign_revisions"
    FOR EACH ROW EXECUTE FUNCTION "advertising_immutable_row"();
CREATE TRIGGER "creatives_immutable" BEFORE UPDATE OR DELETE ON "creatives"
    FOR EACH ROW EXECUTE FUNCTION "advertising_immutable_row"();
CREATE TRIGGER "target_rules_immutable" BEFORE UPDATE OR DELETE ON "target_rules"
    FOR EACH ROW EXECUTE FUNCTION "advertising_immutable_row"();
CREATE TRIGGER "ad_campaign_decisions_append_only" BEFORE UPDATE OR DELETE ON "ad_campaign_decisions"
    FOR EACH ROW EXECUTE FUNCTION "advertising_immutable_row"();
CREATE TRIGGER "ad_provider_policies_immutable" BEFORE UPDATE OR DELETE ON "ad_provider_policies"
    FOR EACH ROW EXECUTE FUNCTION "advertising_immutable_row"();
CREATE TRIGGER "ad_delivery_events_append_only" BEFORE UPDATE OR DELETE ON "ad_delivery_events"
    FOR EACH ROW EXECUTE FUNCTION "advertising_immutable_row"();

CREATE FUNCTION "advertising_campaign_decision_guard"() RETURNS TRIGGER AS $$
DECLARE
    revision_row campaign_revisions%ROWTYPE;
BEGIN
    SELECT * INTO revision_row FROM campaign_revisions WHERE id = NEW.campaign_revision_id;
    IF revision_row.campaign_id IS DISTINCT FROM NEW.campaign_id THEN
        RAISE EXCEPTION 'campaign decision revision must belong to campaign' USING ERRCODE = '23514';
    END IF;
    IF NEW.kind = 'APPROVE' AND revision_row.submitted_by_user_id = NEW.actor_user_id THEN
        RAISE EXCEPTION 'campaign approval requires independent reviewer' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ad_campaign_decisions_guard" BEFORE INSERT ON "ad_campaign_decisions"
    FOR EACH ROW EXECUTE FUNCTION "advertising_campaign_decision_guard"();

CREATE FUNCTION "advertising_campaign_pointer_guard"() RETURNS TRIGGER AS $$
DECLARE
    current_owner UUID;
    approved_owner UUID;
    approved_snapshot campaign_revisions%ROWTYPE;
BEGIN
    IF NEW.current_revision_id IS NOT NULL THEN
        SELECT campaign_id INTO current_owner FROM campaign_revisions WHERE id = NEW.current_revision_id;
        IF current_owner IS DISTINCT FROM NEW.id THEN
            RAISE EXCEPTION 'campaign current revision must belong to campaign' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.approved_revision_id IS NOT NULL THEN
        SELECT * INTO approved_snapshot FROM campaign_revisions
            WHERE id = NEW.approved_revision_id AND approved_at IS NOT NULL;
        approved_owner := approved_snapshot.campaign_id;
        IF approved_owner IS DISTINCT FROM NEW.id THEN
            RAISE EXCEPTION 'campaign approved revision must be reviewed and belong to campaign' USING ERRCODE = '23514';
        END IF;
        IF (NEW.advertiser_name, NEW.advertiser_legal_id, NEW.timezone, NEW.starts_at, NEW.ends_at, NEW.currency,
            NEW.budget_minor) IS DISTINCT FROM
           (approved_snapshot.advertiser_name, approved_snapshot.advertiser_legal_id, approved_snapshot.timezone,
            approved_snapshot.starts_at, approved_snapshot.ends_at, approved_snapshot.currency,
            approved_snapshot.budget_minor) THEN
            RAISE EXCEPTION 'campaign delivery fields must match immutable approved snapshot' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.state IN ('APPROVED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'EXHAUSTED', 'COMPLETED')
        AND NEW.approved_revision_id IS NULL THEN
        RAISE EXCEPTION 'deliverable campaign requires immutable approved revision' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "campaigns_revision_pointer_guard" AFTER INSERT OR UPDATE ON "campaigns"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "advertising_campaign_pointer_guard"();

CREATE FUNCTION "advertising_campaign_state_machine"() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.state <> 'DRAFT' THEN
        RAISE EXCEPTION 'new campaign must start as draft' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.state <> OLD.state AND NOT (
        (OLD.state = 'DRAFT' AND NEW.state = 'IN_REVIEW')
        OR (OLD.state = 'IN_REVIEW' AND NEW.state IN ('DRAFT', 'APPROVED', 'REJECTED'))
        OR (OLD.state = 'APPROVED' AND NEW.state IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'))
        OR (OLD.state = 'SCHEDULED' AND NEW.state IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'))
        OR (OLD.state = 'ACTIVE' AND NEW.state IN ('PAUSED', 'EXHAUSTED', 'COMPLETED'))
        OR (OLD.state = 'PAUSED' AND NEW.state IN ('DRAFT', 'ACTIVE', 'COMPLETED'))
        OR (OLD.state = 'REJECTED' AND NEW.state = 'DRAFT')
    ) THEN
        RAISE EXCEPTION 'invalid campaign state transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "campaigns_state_machine" BEFORE INSERT OR UPDATE OF "state" ON "campaigns"
    FOR EACH ROW EXECUTE FUNCTION "advertising_campaign_state_machine"();

CREATE FUNCTION "advertising_delivery_guard"() RETURNS TRIGGER AS $$
DECLARE
    campaign_row campaigns%ROWTYPE;
    revision_row campaign_revisions%ROWTYPE;
    counter_row delivery_counters%ROWTYPE;
    issued_row ad_delivery_events%ROWTYPE;
    rolling_24_count INTEGER;
    rolling_7_count INTEGER;
    inventory_valid BOOLEAN;
BEGIN
    SELECT * INTO campaign_row FROM campaigns WHERE id = NEW.campaign_id FOR UPDATE;
    SELECT * INTO revision_row FROM campaign_revisions WHERE id = NEW.campaign_revision_id;
    IF revision_row.campaign_id IS DISTINCT FROM NEW.campaign_id
        OR campaign_row.approved_revision_id IS DISTINCT FROM NEW.campaign_revision_id THEN
        RAISE EXCEPTION 'delivery must use exact approved campaign revision' USING ERRCODE = '23514';
    END IF;

    IF NEW.kind = 'ISSUED' THEN
        IF campaign_row.state <> 'ACTIVE' OR NEW.occurred_at < campaign_row.starts_at OR NEW.occurred_at >= campaign_row.ends_at THEN
            RAISE EXCEPTION 'delivery requires active campaign in UTC schedule' USING ERRCODE = '23514';
        END IF;
        SELECT EXISTS (
            SELECT 1 FROM creatives cr JOIN placements pl ON pl.id = NEW.placement_id
            WHERE cr.id = NEW.creative_id AND cr.campaign_id = NEW.campaign_id
                AND cr.format = pl.format AND pl.enabled
                AND NEW.creative_id = ANY(revision_row.creative_ids)
                AND NEW.placement_id = ANY(revision_row.placement_ids)
        ) INTO inventory_valid;
        IF NOT inventory_valid THEN
            RAISE EXCEPTION 'delivery inventory must match approved creative and placement' USING ERRCODE = '23514';
        END IF;
        UPDATE campaigns SET reserved_minor = reserved_minor + NEW.reserved_minor
            WHERE id = NEW.campaign_id AND reserved_minor + spent_minor + NEW.reserved_minor <= budget_minor;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'campaign hard budget exhausted' USING ERRCODE = '23514';
        END IF;
    ELSE
        SELECT * INTO issued_row FROM ad_delivery_events
            WHERE delivery_id = NEW.delivery_id AND kind = 'ISSUED' FOR UPDATE;
        IF NOT FOUND OR issued_row.source <> NEW.source OR issued_row.campaign_id <> NEW.campaign_id
            OR issued_row.campaign_revision_id <> NEW.campaign_revision_id
            OR issued_row.creative_id <> NEW.creative_id OR issued_row.placement_id <> NEW.placement_id THEN
            RAISE EXCEPTION 'measurement must reference its issued delivery' USING ERRCODE = '23514';
        END IF;
        IF NEW.occurred_at >= issued_row.token_expires_at THEN
            RAISE EXCEPTION 'delivery token expired' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.kind = 'VIEWABLE_IMPRESSION' THEN
        IF NEW.delivery_counter_id IS NULL OR NEW.delivery_counter_id IS DISTINCT FROM issued_row.delivery_counter_id THEN
            RAISE EXCEPTION 'viewable impression requires issued purpose-bound counter' USING ERRCODE = '23514';
        END IF;
        SELECT * INTO counter_row FROM delivery_counters WHERE id = NEW.delivery_counter_id FOR UPDATE;
        SELECT count(*) FILTER (WHERE occurred_at > NEW.occurred_at - INTERVAL '24 hours'), count(*)
            INTO rolling_24_count, rolling_7_count
            FROM ad_delivery_events
            WHERE delivery_counter_id = NEW.delivery_counter_id AND kind = 'VIEWABLE_IMPRESSION'
                AND occurred_at > NEW.occurred_at - INTERVAL '7 days';
        IF counter_row.campaign_id <> NEW.campaign_id
            OR rolling_24_count >= revision_row.cap_24_hours
            OR rolling_7_count >= revision_row.cap_7_days THEN
            RAISE EXCEPTION 'cross-session campaign frequency cap reached' USING ERRCODE = '23514';
        END IF;
        IF counter_row.last_viewable_at IS NOT NULL
            AND NEW.occurred_at < counter_row.last_viewable_at + INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'placement refresh interval has not elapsed' USING ERRCODE = '23514';
        END IF;
        UPDATE delivery_counters SET
            viewable_24_count = rolling_24_count + 1,
            viewable_7_count = rolling_7_count + 1,
            session_viewable_count = LEAST(session_viewable_count + 1, 1),
            last_viewable_at = NEW.occurred_at,
            expires_at = NEW.occurred_at + INTERVAL '8 days',
            updated_at = NEW.occurred_at
        WHERE id = NEW.delivery_counter_id;
    END IF;

    IF NEW.finalized_minor > 0 THEN
        IF NEW.finalized_minor > issued_row.reserved_minor
            OR NOT ((revision_row.billing_model = 'CPM' AND NEW.kind = 'VIEWABLE_IMPRESSION')
                OR (revision_row.billing_model = 'CPC' AND NEW.kind = 'VALID_CLICK')) THEN
            RAISE EXCEPTION 'finalization must match approved billing model and reservation' USING ERRCODE = '23514';
        END IF;
        UPDATE campaigns SET
            reserved_minor = reserved_minor - LEAST(reserved_minor, issued_row.reserved_minor),
            spent_minor = spent_minor + NEW.finalized_minor
        WHERE id = NEW.campaign_id
            AND spent_minor + NEW.finalized_minor <= budget_minor
            AND reserved_minor >= issued_row.reserved_minor;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'campaign finalization exceeds reservation or hard budget' USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.kind = 'RESERVATION_RELEASED' THEN
        UPDATE campaigns SET reserved_minor = reserved_minor - issued_row.reserved_minor
            WHERE id = NEW.campaign_id AND reserved_minor >= issued_row.reserved_minor;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'reservation already finalized or released' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ad_delivery_events_budget_frequency_guard" BEFORE INSERT ON "ad_delivery_events"
    FOR EACH ROW EXECUTE FUNCTION "advertising_delivery_guard"();

COMMENT ON TABLE "delivery_counters" IS
    'Purpose-bound frequency state only; forbidden for targeting, segmentation, reporting and export. Delete within 8 days.';
COMMENT ON TABLE "ad_delivery_events" IS
    'Short-lived issuance, viewability and click facts only; no IP, coordinates, user/device/ad ID, URL, query or history.';
COMMENT ON TABLE "ad_report_daily" IS
    'Aggregates only. API suppresses cohorts below 20 and never exposes raw delivery rows.';
