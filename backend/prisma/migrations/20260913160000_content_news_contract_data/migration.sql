CREATE TYPE "content_source_state" AS ENUM ('PROPOSED', 'ENABLED', 'PAUSED', 'REVOKED');
CREATE TYPE "content_integration_kind" AS ENUM ('RSS', 'API');
CREATE TYPE "content_review_state" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "ingest_candidate_state" AS ENUM ('NEW', 'DUPLICATE', 'DISMISSED', 'SELECTED', 'RIGHTS_HOLD');
CREATE TYPE "content_duplicate_kind" AS ENUM ('CANONICAL_URL', 'PROVIDER_ID', 'FINGERPRINT', 'CROSS_SOURCE_SIMILARITY');
CREATE TYPE "content_article_state" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
CREATE TYPE "content_origin_kind" AS ENUM ('ORIGINAL', 'DERIVED');
CREATE TYPE "content_transformation_kind" AS ENUM ('ORIGINAL_EDITORIAL', 'RESEARCH_SUMMARY', 'TRANSLATION', 'ADAPTATION');
CREATE TYPE "content_decision_kind" AS ENUM ('SUBMIT_REVIEW', 'RETURN_TO_DRAFT', 'APPROVE', 'SCHEDULE', 'CANCEL_SCHEDULE', 'PUBLISH', 'UNPUBLISH', 'ARCHIVE');

CREATE TABLE "content_sources" (
    "id" UUID PRIMARY KEY,
    "version" BIGINT NOT NULL DEFAULT 0 CHECK ("version" >= 0),
    "state" "content_source_state" NOT NULL DEFAULT 'PROPOSED',
    "integration_kind" "content_integration_kind" NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL CHECK (char_length(btrim("legal_name")) > 0),
    "display_name" VARCHAR(120) NOT NULL CHECK (char_length(btrim("display_name")) > 0),
    "canonical_origin" VARCHAR(2048) NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "current_policy_id" UUID,
    "reviewed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_sources_https_check" CHECK ("canonical_origin" ~ '^https://' AND "endpoint" ~ '^https://'),
    CONSTRAINT "content_sources_enabled_review_check" CHECK ("state" <> 'ENABLED' OR "current_policy_id" IS NOT NULL),
    CONSTRAINT "content_sources_canonical_origin_key" UNIQUE ("canonical_origin"),
    CONSTRAINT "content_sources_endpoint_key" UNIQUE ("endpoint"),
    CONSTRAINT "content_sources_current_policy_key" UNIQUE ("current_policy_id")
);

CREATE TABLE "content_source_policies" (
    "id" UUID PRIMARY KEY,
    "source_id" UUID NOT NULL REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "version" VARCHAR(32) NOT NULL,
    "use_classes" VARCHAR(40)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(40)[],
    "maximum_excerpt_characters" SMALLINT NOT NULL DEFAULT 0,
    "full_text_license_evidence_id" UUID,
    "media_license_evidence_id" UUID,
    "terms_url" VARCHAR(2048) NOT NULL,
    "terms_version" VARCHAR(120) NOT NULL,
    "rights_basis" VARCHAR(500) NOT NULL,
    "attribution_template" VARCHAR(500) NOT NULL,
    "license_notice" VARCHAR(500),
    "territory" VARCHAR(120) NOT NULL,
    "languages" VARCHAR(35)[] NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "review_due_at" TIMESTAMPTZ(3) NOT NULL,
    "legal_review" "content_review_state" NOT NULL DEFAULT 'PENDING',
    "security_review" "content_review_state" NOT NULL DEFAULT 'PENDING',
    "privacy_review" "content_review_state" NOT NULL DEFAULT 'PENDING',
    "commercial_review" "content_review_state" NOT NULL DEFAULT 'PENDING',
    "evidence_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL CHECK ("encryption_key_version" > 0),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_source_policies_version_key" UNIQUE ("source_id", "version"),
    CONSTRAINT "content_source_policies_version_check" CHECK ("version" ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'),
    CONSTRAINT "content_source_policies_window_check" CHECK (
        "maximum_excerpt_characters" BETWEEN 0 AND 2000
        AND "review_due_at" > "valid_from"
        AND ("valid_until" IS NULL OR "valid_until" > "valid_from")
    ),
    CONSTRAINT "content_source_policies_https_check" CHECK ("terms_url" ~ '^https://'),
    CONSTRAINT "content_source_policies_full_text_license_check" CHECK (
        NOT ("use_classes" && ARRAY['STORE_FULL_TEXT', 'PUBLISH_FULL_TEXT']::VARCHAR(40)[])
        OR "full_text_license_evidence_id" IS NOT NULL
    ),
    CONSTRAINT "content_source_policies_media_license_check" CHECK (
        NOT ("use_classes" && ARRAY['STORE_MEDIA', 'PUBLISH_MEDIA']::VARCHAR(40)[])
        OR "media_license_evidence_id" IS NOT NULL
    ),
    CONSTRAINT "content_source_policies_use_class_check" CHECK (
        "use_classes" <@ ARRAY[
            'FETCH_METADATA', 'STORE_METADATA', 'STORE_EXCERPT', 'TRANSFORM', 'PUBLISH_ATTRIBUTION',
            'STORE_FULL_TEXT', 'PUBLISH_FULL_TEXT', 'STORE_MEDIA', 'PUBLISH_MEDIA', 'CACHE'
        ]::VARCHAR(40)[]
    )
);
CREATE INDEX "content_source_policies_validity_idx" ON "content_source_policies" ("source_id", "valid_from", "valid_until");
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_current_policy_fkey"
    FOREIGN KEY ("current_policy_id") REFERENCES "content_source_policies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "content_articles" (
    "id" UUID PRIMARY KEY,
    "version" BIGINT NOT NULL DEFAULT 0 CHECK ("version" >= 0),
    "state" "content_article_state" NOT NULL DEFAULT 'DRAFT',
    "origin_kind" "content_origin_kind" NOT NULL,
    "current_draft_revision_id" UUID,
    "approved_revision_id" UUID,
    "published_revision_id" UUID,
    "scheduled_revision_id" UUID,
    "scheduled_for" TIMESTAMPTZ(3),
    "first_published_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_articles_current_draft_revision_key" UNIQUE ("current_draft_revision_id"),
    CONSTRAINT "content_articles_approved_revision_key" UNIQUE ("approved_revision_id"),
    CONSTRAINT "content_articles_published_revision_key" UNIQUE ("published_revision_id"),
    CONSTRAINT "content_articles_scheduled_revision_key" UNIQUE ("scheduled_revision_id"),
    CONSTRAINT "content_articles_pointer_shape_check" CHECK (
        ("state" <> 'PUBLISHED' OR "published_revision_id" IS NOT NULL)
        AND ("state" <> 'SCHEDULED' OR ("scheduled_revision_id" IS NOT NULL AND "scheduled_for" IS NOT NULL))
        AND (("scheduled_revision_id" IS NULL AND "scheduled_for" IS NULL) OR ("scheduled_revision_id" IS NOT NULL AND "scheduled_for" IS NOT NULL))
    )
);
CREATE INDEX "articles_public_order_idx" ON "content_articles" ("state", "first_published_at" DESC, "id" DESC);

CREATE TABLE "content_categories" (
    "id" UUID PRIMARY KEY,
    "slug" VARCHAR(64) NOT NULL CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    "locale" VARCHAR(35) NOT NULL,
    "name" VARCHAR(80) NOT NULL CHECK (char_length(btrim("name")) > 0),
    "visible" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "content_categories_locale_slug_key" UNIQUE ("locale", "slug")
);

CREATE TABLE "content_tags" (
    "id" UUID PRIMARY KEY,
    "slug" VARCHAR(64) NOT NULL CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    "locale" VARCHAR(35) NOT NULL,
    "name" VARCHAR(50) NOT NULL CHECK (char_length(btrim("name")) > 0),
    "visible" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "content_tags_locale_slug_key" UNIQUE ("locale", "slug")
);

CREATE OR REPLACE FUNCTION "content_safe_rich_text_v1"(document JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    block JSONB;
    inline_node JSONB;
    list_item JSONB;
BEGIN
    IF jsonb_typeof(document) <> 'object'
        OR document->>'format' <> 'SAFE_RICH_TEXT_V1'
        OR (document - ARRAY['format', 'blocks']) <> '{}'::JSONB
        OR jsonb_typeof(document->'blocks') <> 'array'
        OR jsonb_array_length(document->'blocks') NOT BETWEEN 1 AND 300
        OR octet_length(document::TEXT) > 500000 THEN
        RETURN FALSE;
    END IF;
    FOR block IN SELECT value FROM jsonb_array_elements(document->'blocks') LOOP
        IF jsonb_typeof(block) <> 'object'
            OR block->>'kind' NOT IN ('PARAGRAPH', 'HEADING', 'BULLETED_LIST', 'NUMBERED_LIST', 'QUOTE')
            OR (block - ARRAY['kind', 'headingLevel', 'inlines', 'items']) <> '{}'::JSONB THEN
            RETURN FALSE;
        END IF;
        IF (block->>'kind' = 'HEADING') <> (block ? 'headingLevel')
            OR (block ? 'headingLevel' AND (block->>'headingLevel')::INTEGER NOT IN (2, 3)) THEN
            RETURN FALSE;
        END IF;
        IF block->>'kind' IN ('BULLETED_LIST', 'NUMBERED_LIST') THEN
            IF NOT block ? 'items' OR block ? 'inlines' OR jsonb_typeof(block->'items') <> 'array'
                OR jsonb_array_length(block->'items') NOT BETWEEN 1 AND 50 THEN RETURN FALSE; END IF;
            FOR list_item IN SELECT value FROM jsonb_array_elements(block->'items') LOOP
                IF jsonb_typeof(list_item) <> 'array' OR jsonb_array_length(list_item) NOT BETWEEN 1 AND 100 THEN RETURN FALSE; END IF;
                FOR inline_node IN SELECT value FROM jsonb_array_elements(list_item) LOOP
                    IF jsonb_typeof(inline_node) <> 'object'
                        OR (inline_node - ARRAY['text', 'marks', 'href']) <> '{}'::JSONB
                        OR char_length(inline_node->>'text') NOT BETWEEN 1 AND 4000
                        OR (inline_node ? 'href' AND inline_node->>'href' !~ '^https://')
                        OR (inline_node ? 'marks' AND (jsonb_typeof(inline_node->'marks') <> 'array'
                            OR jsonb_array_length(inline_node->'marks') > 3
                            OR NOT (inline_node->'marks' <@ '["STRONG","EMPHASIS","CODE"]'::JSONB)))
                    THEN RETURN FALSE; END IF;
                END LOOP;
            END LOOP;
        ELSE
            IF NOT block ? 'inlines' OR block ? 'items' OR jsonb_typeof(block->'inlines') <> 'array'
                OR jsonb_array_length(block->'inlines') NOT BETWEEN 1 AND 100 THEN RETURN FALSE; END IF;
            FOR inline_node IN SELECT value FROM jsonb_array_elements(block->'inlines') LOOP
                IF jsonb_typeof(inline_node) <> 'object'
                    OR (inline_node - ARRAY['text', 'marks', 'href']) <> '{}'::JSONB
                    OR char_length(inline_node->>'text') NOT BETWEEN 1 AND 4000
                    OR (inline_node ? 'href' AND inline_node->>'href' !~ '^https://')
                    OR (inline_node ? 'marks' AND (jsonb_typeof(inline_node->'marks') <> 'array'
                        OR jsonb_array_length(inline_node->'marks') > 3
                        OR NOT (inline_node->'marks' <@ '["STRONG","EMPHASIS","CODE"]'::JSONB)))
                THEN RETURN FALSE; END IF;
            END LOOP;
        END IF;
    END LOOP;
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

CREATE TABLE "article_revisions" (
    "id" UUID PRIMARY KEY,
    "article_id" UUID NOT NULL REFERENCES "content_articles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" BIGINT NOT NULL CHECK ("revision" > 0),
    "locale" VARCHAR(35) NOT NULL,
    "slug" VARCHAR(96) NOT NULL CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    "title" VARCHAR(300) NOT NULL CHECK (char_length(btrim("title")) > 0),
    "subtitle" VARCHAR(300),
    "summary" VARCHAR(600) NOT NULL CHECK (char_length(btrim("summary")) > 0),
    "body" JSONB NOT NULL CONSTRAINT "article_revisions_safe_body_check" CHECK ("content_safe_rich_text_v1"("body")),
    "body_hash" CHAR(64) NOT NULL CHECK ("body_hash" ~ '^[0-9a-f]{64}$'),
    "category_id" UUID NOT NULL REFERENCES "content_categories"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "origin_kind" "content_origin_kind" NOT NULL,
    "seo_title" VARCHAR(70) NOT NULL,
    "seo_description" VARCHAR(170) NOT NULL,
    "canonical_url" VARCHAR(2048) NOT NULL CHECK ("canonical_url" ~ '^https://'),
    "correction_note" VARCHAR(1000),
    "translation_of_revision_id" UUID REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "changed_fields" VARCHAR(40)[] NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_revisions_revision_key" UNIQUE ("article_id", "revision")
);
CREATE INDEX "article_revisions_slug_idx" ON "article_revisions" ("locale", "slug");

ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_current_draft_revision_fkey"
    FOREIGN KEY ("current_draft_revision_id") REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_approved_revision_fkey"
    FOREIGN KEY ("approved_revision_id") REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_published_revision_fkey"
    FOREIGN KEY ("published_revision_id") REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_scheduled_revision_fkey"
    FOREIGN KEY ("scheduled_revision_id") REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "ingest_candidates" (
    "id" UUID PRIMARY KEY,
    "source_id" UUID NOT NULL REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "state" "ingest_candidate_state" NOT NULL DEFAULT 'NEW',
    "version" BIGINT NOT NULL DEFAULT 0 CHECK ("version" >= 0),
    "current_revision_id" UUID,
    "duplicate_group_id" UUID,
    "duplicate_kind" "content_duplicate_kind",
    "selected_article_id" UUID REFERENCES "content_articles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingest_candidates_current_revision_key" UNIQUE ("current_revision_id"),
    CONSTRAINT "ingest_candidates_duplicate_shape_check" CHECK (
        ("state" = 'DUPLICATE') = ("duplicate_group_id" IS NOT NULL AND "duplicate_kind" IS NOT NULL)
    ),
    CONSTRAINT "ingest_candidates_selected_shape_check" CHECK (("state" = 'SELECTED') = ("selected_article_id" IS NOT NULL))
);
CREATE INDEX "ingest_candidates_queue_idx" ON "ingest_candidates" ("source_id", "state", "created_at", "id");
CREATE INDEX "ingest_candidates_duplicate_group_idx" ON "ingest_candidates" ("duplicate_group_id");

CREATE TABLE "ingest_candidate_revisions" (
    "id" UUID PRIMARY KEY,
    "candidate_id" UUID NOT NULL REFERENCES "ingest_candidates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revision" BIGINT NOT NULL CHECK ("revision" > 0),
    "source_policy_id" UUID NOT NULL REFERENCES "content_source_policies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "provider_id" VARCHAR(500),
    "canonical_url" VARCHAR(2048) NOT NULL CHECK ("canonical_url" ~ '^https://'),
    "canonical_url_hash" CHAR(64) NOT NULL CHECK ("canonical_url_hash" ~ '^[0-9a-f]{64}$'),
    "title" VARCHAR(300) NOT NULL,
    "author" VARCHAR(200),
    "publisher" VARCHAR(200),
    "excerpt" VARCHAR(2000),
    "originally_published_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
    "source_hash" CHAR(64) NOT NULL CHECK ("source_hash" ~ '^[0-9a-f]{64}$'),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingest_candidate_revisions_revision_key" UNIQUE ("candidate_id", "revision"),
    CONSTRAINT "ingest_candidate_revisions_source_hash_key" UNIQUE ("candidate_id", "source_hash")
);
CREATE INDEX "ingest_candidate_revisions_source_url_hash_idx" ON "ingest_candidate_revisions" ("source_policy_id", "canonical_url_hash");
CREATE INDEX "ingest_candidate_revisions_source_provider_idx" ON "ingest_candidate_revisions" ("source_policy_id", "provider_id") WHERE "provider_id" IS NOT NULL;
CREATE INDEX "ingest_candidate_revisions_fingerprint_idx" ON "ingest_candidate_revisions" ("fingerprint");
ALTER TABLE "ingest_candidates" ADD CONSTRAINT "ingest_candidates_current_revision_fkey"
    FOREIGN KEY ("current_revision_id") REFERENCES "ingest_candidate_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "article_origins" (
    "id" UUID PRIMARY KEY,
    "article_revision_id" UUID NOT NULL REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "source_id" UUID NOT NULL REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "source_policy_id" UUID NOT NULL REFERENCES "content_source_policies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "candidate_revision_id" UUID REFERENCES "ingest_candidate_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "original_title" VARCHAR(300) NOT NULL,
    "original_author" VARCHAR(200),
    "original_publisher" VARCHAR(200),
    "canonical_url" VARCHAR(2048) NOT NULL CHECK ("canonical_url" ~ '^https://'),
    "canonical_url_hash" CHAR(64) NOT NULL CHECK ("canonical_url_hash" ~ '^[0-9a-f]{64}$'),
    "originally_published_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "transformation_kind" "content_transformation_kind" NOT NULL,
    "rights_basis" VARCHAR(500) NOT NULL,
    "attribution_text" VARCHAR(500) NOT NULL,
    "license_notice" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_origins_revision_source_url_key" UNIQUE ("article_revision_id", "source_id", "canonical_url_hash")
);

CREATE TABLE "article_revision_tags" (
    "article_revision_id" UUID NOT NULL REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "tag_id" UUID NOT NULL REFERENCES "content_tags"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    PRIMARY KEY ("article_revision_id", "tag_id")
);

CREATE TABLE "content_media" (
    "id" UUID PRIMARY KEY,
    "article_revision_id" UUID NOT NULL REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "object_key" VARCHAR(240) NOT NULL CONSTRAINT "content_media_object_key" UNIQUE,
    "media_type" VARCHAR(40) NOT NULL CHECK ("media_type" IN ('image/avif', 'image/jpeg', 'image/png', 'image/webp')),
    "byte_length" BIGINT NOT NULL CHECK ("byte_length" BETWEEN 1 AND 10485760),
    "sha256" CHAR(64) NOT NULL CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    "rights_policy_version" VARCHAR(32) NOT NULL,
    "rights_evidence_id" UUID NOT NULL,
    "alt_text" VARCHAR(500) NOT NULL,
    "approved_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_media_key_shape_check" CHECK ("object_key" ~ '^content/[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9._-]+$')
);

CREATE OR REPLACE FUNCTION "content_assert_revision_shape"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_revision_id UUID;
DECLARE revision_row "article_revisions"%ROWTYPE;
BEGIN
    IF TG_TABLE_NAME = 'article_revisions' THEN target_revision_id := NEW."id";
    ELSE target_revision_id := NEW."article_revision_id";
    END IF;
    SELECT * INTO revision_row FROM "article_revisions" WHERE "id" = target_revision_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "content_articles" a
        JOIN "content_categories" c ON c."id" = revision_row."category_id"
        WHERE a."id" = revision_row."article_id" AND a."origin_kind" = revision_row."origin_kind"
          AND c."locale" = revision_row."locale"
    ) THEN RAISE EXCEPTION 'revision origin kind and category locale must match article'; END IF;
    IF (revision_row."origin_kind" = 'DERIVED') <> EXISTS (
        SELECT 1 FROM "article_origins" o WHERE o."article_revision_id" = target_revision_id
    ) THEN RAISE EXCEPTION 'derived revision requires origins and original revision forbids external origins'; END IF;
    IF EXISTS (
        SELECT 1 FROM "article_revision_tags" rt JOIN "content_tags" t ON t."id" = rt."tag_id"
        WHERE rt."article_revision_id" = target_revision_id AND t."locale" <> revision_row."locale"
    ) OR (SELECT count(*) FROM "article_revision_tags" rt WHERE rt."article_revision_id" = target_revision_id) > 20
    THEN RAISE EXCEPTION 'revision tags must match locale and remain bounded'; END IF;
    IF (SELECT count(*) FROM "content_media" m WHERE m."article_revision_id" = target_revision_id) > 20
    THEN RAISE EXCEPTION 'revision media must remain bounded'; END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "article_revisions_shape_guard" AFTER INSERT ON "article_revisions"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_revision_shape"();
CREATE CONSTRAINT TRIGGER "article_origins_revision_shape_guard" AFTER INSERT ON "article_origins"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_revision_shape"();
CREATE CONSTRAINT TRIGGER "article_revision_tags_shape_guard" AFTER INSERT ON "article_revision_tags"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_revision_shape"();
CREATE CONSTRAINT TRIGGER "content_media_revision_shape_guard" AFTER INSERT ON "content_media"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_revision_shape"();

CREATE TABLE "content_canonical_slugs" (
    "id" UUID PRIMARY KEY,
    "article_id" UUID NOT NULL REFERENCES "content_articles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "locale" VARCHAR(35) NOT NULL,
    "slug" VARCHAR(96) NOT NULL CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "replaced_by_id" UUID REFERENCES "content_canonical_slugs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_canonical_slugs_locale_slug_key" UNIQUE ("locale", "slug"),
    CONSTRAINT "content_canonical_slugs_redirect_check" CHECK (("active" AND "replaced_by_id" IS NULL) OR (NOT "active" AND "replaced_by_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "content_canonical_slugs_active_article_locale_key" ON "content_canonical_slugs" ("article_id", "locale") WHERE "active";

CREATE TABLE "content_publication_decisions" (
    "id" UUID PRIMARY KEY,
    "article_id" UUID NOT NULL REFERENCES "content_articles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "article_revision_id" UUID NOT NULL REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "article_version" BIGINT NOT NULL CHECK ("article_version" > 0),
    "decision" "content_decision_kind" NOT NULL,
    "reason_code" VARCHAR(96) NOT NULL,
    "checklist_version" VARCHAR(32),
    "checklist" JSONB,
    "actor_user_id" UUID NOT NULL,
    "reviewer_user_id" UUID,
    "self_review" BOOLEAN NOT NULL DEFAULT FALSE,
    "scheduled_for" TIMESTAMPTZ(3),
    "operation_id" UUID NOT NULL CONSTRAINT "content_publication_decisions_operation_key" UNIQUE,
    "committed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_publication_decisions_checklist_check" CHECK (
        "decision" NOT IN ('APPROVE', 'SCHEDULE', 'PUBLISH')
        OR ("checklist_version" IS NOT NULL AND "checklist" @> '{"factsChecked":true,"textRightsChecked":true,"mediaRightsChecked":true,"attributionChecked":true,"privacyChecked":true,"accessibilityChecked":true,"languageChecked":true}'::JSONB)
    ),
    CONSTRAINT "content_publication_decisions_schedule_check" CHECK (("decision" = 'SCHEDULE') = ("scheduled_for" IS NOT NULL)),
    CONSTRAINT "content_publication_decisions_self_review_check" CHECK (NOT "self_review" OR "reviewer_user_id" = "actor_user_id")
);
CREATE INDEX "content_publication_decisions_history_idx" ON "content_publication_decisions" ("article_id", "committed_at", "id");

CREATE TABLE "content_public_projections" (
    "article_id" UUID PRIMARY KEY REFERENCES "content_articles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "article_revision_id" UUID NOT NULL CONSTRAINT "content_public_projections_revision_key" UNIQUE REFERENCES "article_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "publication_decision_id" UUID NOT NULL CONSTRAINT "content_public_projections_decision_key" UNIQUE REFERENCES "content_publication_decisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "locale" VARCHAR(35) NOT NULL,
    "slug" VARCHAR(96) NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search_document" TSVECTOR NOT NULL,
    CONSTRAINT "content_public_projections_locale_slug_key" UNIQUE ("locale", "slug")
);
CREATE INDEX "content_public_projections_feed_idx" ON "content_public_projections" ("published_at" DESC, "article_id" DESC);
CREATE INDEX "content_public_projections_search_idx" ON "content_public_projections" USING GIN ("search_document");

CREATE TABLE "content_bookmarks" (
    "user_id" UUID NOT NULL,
    "article_id" UUID NOT NULL REFERENCES "content_articles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookmarks_owner_article_key" PRIMARY KEY ("user_id", "article_id")
);
CREATE INDEX "bookmarks_owner_page_idx" ON "content_bookmarks" ("user_id", "created_at" DESC, "article_id" DESC);

CREATE TABLE "content_operation_receipts" (
    "id" UUID PRIMARY KEY,
    "actor_user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "canonical_path" VARCHAR(240) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL CHECK ("encryption_key_version" > 0),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT "content_operation_receipts_scope_key" UNIQUE ("actor_user_id", "method", "canonical_path", "idempotency_key"),
    CONSTRAINT "content_operation_receipts_expiry_check" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '24 hours')
);
CREATE INDEX "content_operation_receipts_expiry_idx" ON "content_operation_receipts" ("expires_at");

CREATE OR REPLACE FUNCTION "content_assert_revision_owner"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    pointer UUID;
BEGIN
    FOREACH pointer IN ARRAY ARRAY[NEW."current_draft_revision_id", NEW."approved_revision_id", NEW."published_revision_id", NEW."scheduled_revision_id"] LOOP
        IF pointer IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "article_revisions" r WHERE r."id" = pointer AND r."article_id" = NEW."id"
        ) THEN RAISE EXCEPTION 'article revision pointer must belong to article'; END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "content_articles_revision_owner_guard" AFTER INSERT OR UPDATE ON "content_articles"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_revision_owner"();

CREATE OR REPLACE FUNCTION "content_assert_public_projection"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "content_articles" a
        JOIN "content_publication_decisions" d ON d."id" = NEW."publication_decision_id"
        JOIN "article_revisions" r ON r."id" = NEW."article_revision_id"
        WHERE a."id" = NEW."article_id" AND a."state" = 'PUBLISHED'
          AND a."published_revision_id" = NEW."article_revision_id"
          AND d."article_id" = a."id" AND d."article_revision_id" = r."id" AND d."decision" = 'PUBLISH'
          AND r."article_id" = a."id" AND r."locale" = NEW."locale" AND r."slug" = NEW."slug"
          AND (r."origin_kind" = 'ORIGINAL' OR (
              EXISTS (SELECT 1 FROM "article_origins" o WHERE o."article_revision_id" = r."id")
              AND NOT EXISTS (
                  SELECT 1 FROM "article_origins" o
                  LEFT JOIN "content_source_policies" p ON p."id" = o."source_policy_id" AND p."source_id" = o."source_id"
                  LEFT JOIN "content_sources" s ON s."id" = o."source_id"
                  WHERE o."article_revision_id" = r."id" AND (
                      p."id" IS NULL OR s."state" <> 'ENABLED' OR s."current_policy_id" <> p."id"
                      OR p."legal_review" <> 'APPROVED' OR p."privacy_review" <> 'APPROVED'
                      OR p."security_review" <> 'APPROVED' OR p."commercial_review" <> 'APPROVED'
                      OR p."review_due_at" <= NEW."published_at" OR p."valid_from" > NEW."published_at"
                      OR (p."valid_until" IS NOT NULL AND p."valid_until" <= NEW."published_at")
                  )
              )
          ))
    ) THEN RAISE EXCEPTION 'public projection requires exact committed published revision and current origin rights'; END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "content_public_projection_published_only_guard" AFTER INSERT OR UPDATE ON "content_public_projections"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_public_projection"();

CREATE OR REPLACE FUNCTION "content_assert_article_visibility"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_article_id UUID;
DECLARE published BOOLEAN;
DECLARE projected BOOLEAN;
BEGIN
    IF TG_TABLE_NAME = 'content_articles' THEN
        target_article_id := COALESCE(NEW."id", OLD."id");
    ELSE
        target_article_id := COALESCE(NEW."article_id", OLD."article_id");
    END IF;
    SELECT a."state" = 'PUBLISHED' INTO published FROM "content_articles" a WHERE a."id" = target_article_id;
    IF NOT FOUND THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    SELECT EXISTS (SELECT 1 FROM "content_public_projections" p WHERE p."article_id" = target_article_id) INTO projected;
    IF published <> projected THEN
        RAISE EXCEPTION 'PUBLISHED article and public projection must exist or disappear atomically';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE CONSTRAINT TRIGGER "content_articles_visibility_guard" AFTER INSERT OR UPDATE ON "content_articles"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_article_visibility"();
CREATE CONSTRAINT TRIGGER "content_public_projections_visibility_guard" AFTER INSERT OR UPDATE OR DELETE ON "content_public_projections"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_article_visibility"();

CREATE OR REPLACE FUNCTION "content_assert_revoked_source_visibility"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" = 'REVOKED' AND EXISTS (
        SELECT 1 FROM "content_public_projections" pp
        JOIN "article_origins" o ON o."article_revision_id" = pp."article_revision_id"
        WHERE o."source_id" = NEW."id"
    ) THEN RAISE EXCEPTION 'revoked source and dependent public projections must be removed atomically'; END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "content_sources_revoked_visibility_guard" AFTER INSERT OR UPDATE ON "content_sources"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_assert_revoked_source_visibility"();

CREATE OR REPLACE FUNCTION "content_assert_article_state_transition"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."state" = NEW."state" THEN RETURN NEW; END IF;
    IF NOT (
        (OLD."state" = 'DRAFT' AND NEW."state" = 'IN_REVIEW')
        OR (OLD."state" = 'IN_REVIEW' AND NEW."state" IN ('DRAFT', 'APPROVED'))
        OR (OLD."state" = 'APPROVED' AND NEW."state" IN ('SCHEDULED', 'PUBLISHED', 'DRAFT'))
        OR (OLD."state" = 'SCHEDULED' AND NEW."state" IN ('APPROVED', 'PUBLISHED', 'UNPUBLISHED'))
        OR (OLD."state" = 'PUBLISHED' AND NEW."state" = 'UNPUBLISHED')
        OR (OLD."state" = 'UNPUBLISHED' AND NEW."state" IN ('DRAFT', 'ARCHIVED'))
        OR (OLD."state" = 'ARCHIVED' AND NEW."state" = 'DRAFT')
    ) THEN RAISE EXCEPTION 'invalid content article state transition'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "content_articles_state_machine" BEFORE UPDATE OF "state" ON "content_articles"
    FOR EACH ROW EXECUTE FUNCTION "content_assert_article_state_transition"();

CREATE OR REPLACE FUNCTION "content_immutable_record"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% records are immutable; create a new version', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER "content_source_policies_immutable" BEFORE UPDATE OR DELETE ON "content_source_policies"
    FOR EACH ROW EXECUTE FUNCTION "content_immutable_record"();
CREATE TRIGGER "ingest_candidate_revisions_immutable" BEFORE UPDATE OR DELETE ON "ingest_candidate_revisions"
    FOR EACH ROW EXECUTE FUNCTION "content_immutable_record"();
CREATE TRIGGER "article_revisions_immutable" BEFORE UPDATE OR DELETE ON "article_revisions"
    FOR EACH ROW EXECUTE FUNCTION "content_immutable_record"();
CREATE TRIGGER "article_origins_immutable" BEFORE UPDATE OR DELETE ON "article_origins"
    FOR EACH ROW EXECUTE FUNCTION "content_immutable_record"();
CREATE TRIGGER "content_publication_decisions_append_only" BEFORE UPDATE OR DELETE ON "content_publication_decisions"
    FOR EACH ROW EXECUTE FUNCTION "content_immutable_record"();

CREATE OR REPLACE FUNCTION "content_origin_source_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "content_source_policies" p
        WHERE p."id" = NEW."source_policy_id" AND p."source_id" = NEW."source_id"
    ) OR (NEW."candidate_revision_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "ingest_candidate_revisions" cr
        WHERE cr."id" = NEW."candidate_revision_id" AND cr."source_policy_id" = NEW."source_policy_id"
    )) THEN RAISE EXCEPTION 'origin source, policy and candidate revision must be reciprocal'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "article_origins_source_guard" BEFORE INSERT ON "article_origins"
    FOR EACH ROW EXECUTE FUNCTION "content_origin_source_guard"();

CREATE OR REPLACE FUNCTION "content_decision_revision_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "article_revisions" r
        WHERE r."id" = NEW."article_revision_id" AND r."article_id" = NEW."article_id"
    ) THEN RAISE EXCEPTION 'publication decision revision must belong to article'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "content_publication_decisions_revision_guard" BEFORE INSERT ON "content_publication_decisions"
    FOR EACH ROW EXECUTE FUNCTION "content_decision_revision_guard"();

CREATE OR REPLACE FUNCTION "content_source_state_transition_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."state" = NEW."state" THEN RETURN NEW; END IF;
    IF NOT (
        (OLD."state" = 'PROPOSED' AND NEW."state" IN ('ENABLED', 'PAUSED', 'REVOKED'))
        OR (OLD."state" = 'ENABLED' AND NEW."state" IN ('PAUSED', 'REVOKED'))
        OR (OLD."state" = 'PAUSED' AND NEW."state" IN ('ENABLED', 'REVOKED'))
    ) THEN RAISE EXCEPTION 'invalid content source state transition'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "content_sources_state_machine" BEFORE UPDATE OF "state" ON "content_sources"
    FOR EACH ROW EXECUTE FUNCTION "content_source_state_transition_guard"();

CREATE OR REPLACE FUNCTION "content_source_enable_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy_row "content_source_policies"%ROWTYPE;
BEGIN
    IF NEW."state" = 'ENABLED' THEN
        SELECT * INTO policy_row FROM "content_source_policies" WHERE "id" = NEW."current_policy_id" AND "source_id" = NEW."id";
        IF NOT FOUND OR policy_row."legal_review" <> 'APPROVED' OR policy_row."security_review" <> 'APPROVED'
            OR policy_row."privacy_review" <> 'APPROVED' OR policy_row."commercial_review" <> 'APPROVED'
            OR policy_row."reviewed_at" IS NULL OR policy_row."review_due_at" <= CURRENT_TIMESTAMP
            OR policy_row."valid_from" > CURRENT_TIMESTAMP OR (policy_row."valid_until" IS NOT NULL AND policy_row."valid_until" <= CURRENT_TIMESTAMP)
        THEN RAISE EXCEPTION 'source enable requires current approved policy and evidence'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "content_sources_enable_guard" AFTER INSERT OR UPDATE ON "content_sources"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "content_source_enable_guard"();

CREATE OR REPLACE FUNCTION "content_candidate_source_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "ingest_candidates" c
        JOIN "content_source_policies" p ON p."id" = NEW."source_policy_id"
        JOIN "content_sources" s ON s."id" = c."source_id"
        WHERE c."id" = NEW."candidate_id" AND p."source_id" = s."id" AND s."state" = 'ENABLED'
          AND s."current_policy_id" = p."id" AND 'FETCH_METADATA' = ANY(p."use_classes")
          AND char_length(COALESCE(NEW."excerpt", '')) <= p."maximum_excerpt_characters"
    ) THEN RAISE EXCEPTION 'candidate fetch requires enabled allowlisted current source policy'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "ingest_candidate_revisions_source_guard" BEFORE INSERT ON "ingest_candidate_revisions"
    FOR EACH ROW EXECUTE FUNCTION "content_candidate_source_guard"();
