-- Administration contract/data: fixed platform roles, isolated staff sessions, scoped break-glass,
-- versioned restrictions and idempotent coordination. Existing audit rows are never rewritten.

CREATE TYPE "platform_role" AS ENUM ('SUPERADMIN', 'MODERATOR', 'EDITOR', 'ADS_MANAGER');
CREATE TYPE "admin_mfa_method" AS ENUM ('WEBAUTHN', 'HARDWARE_KEY');
CREATE TYPE "admin_restriction_scope" AS ENUM ('DIRECT_INTERACTIONS', 'MATCH_CREATION', 'PLATFORM_ACCESS');
CREATE TYPE "admin_restriction_state" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

ALTER TABLE "audit_entries"
    ADD COLUMN "operation_id" UUID,
    ADD COLUMN "policy_version" VARCHAR(128);
CREATE UNIQUE INDEX "audit_entries_operation_key" ON "audit_entries"("operation_id");

-- NOT VALID preserves prior append-only history while applying the stricter shape to every new admin row.
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_admin_shape_check" CHECK (
    "source" <> 'administration' OR (
        "operation_id" IS NOT NULL
        AND "actor_type" IN ('ADMIN', 'SYSTEM')
        AND "target_id" IS NOT NULL
        AND "action" ~ '^[A-Z][A-Z0-9_]{1,95}$'
        AND "target_type" ~ '^[A-Z][A-Z0-9_]{1,95}$'
        AND "outcome" IN ('SUCCEEDED', 'DENIED', 'FAILED', 'CONFLICT')
        AND "reason_code" IS NOT NULL AND "reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'
        AND "policy_version" IS NOT NULL
        AND "policy_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
        AND "changed_fields" ? 'names'
        AND jsonb_typeof("changed_fields"->'names') = 'array'
        AND ("changed_fields" - 'names') = '{}'::jsonb
        AND jsonb_array_length("changed_fields"->'names') <= 32
    )
) NOT VALID;

CREATE TABLE "platform_role_grants" (
    "id" UUID PRIMARY KEY,
    "subject_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "role" "platform_role" NOT NULL,
    "granted_by_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "approved_by_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "reason_code" VARCHAR(96) NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "approval_reference" VARCHAR(160) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(3),
    "review_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revoke_reason_code" VARCHAR(96),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_role_grants_no_self_grant_check" CHECK (
        "subject_user_id" <> "granted_by_user_id"
        AND "subject_user_id" <> "approved_by_user_id"
        AND "granted_by_user_id" <> "approved_by_user_id"
    ),
    CONSTRAINT "platform_role_grants_reason_check" CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    CONSTRAINT "platform_role_grants_policy_check" CHECK (
        "policy_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    ),
    CONSTRAINT "platform_role_grants_reference_check" CHECK (length("approval_reference") BETWEEN 1 AND 160),
    CONSTRAINT "platform_role_grants_dates_check" CHECK (
        "revision" >= 0 AND "review_at" > "valid_from"
        AND ("valid_until" IS NULL OR "valid_until" > "valid_from")
        AND ("revoked_at" IS NULL OR "revoked_at" >= "valid_from")
        AND (("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL AND "revoke_reason_code" IS NULL)
            OR ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL AND "revoke_reason_code" IS NOT NULL))
    )
);
CREATE UNIQUE INDEX "platform_role_grants_active_key"
    ON "platform_role_grants"("subject_user_id", "role") WHERE "revoked_at" IS NULL;
CREATE INDEX "platform_role_grants_access_idx"
    ON "platform_role_grants"("subject_user_id", "role", "revoked_at", "valid_until");
CREATE INDEX "platform_role_grants_review_idx" ON "platform_role_grants"("review_at", "revoked_at");

CREATE TABLE "admin_sessions" (
    "id" UUID PRIMARY KEY,
    "staff_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "role_grant_id" UUID NOT NULL REFERENCES "platform_role_grants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "audience" VARCHAR(32) NOT NULL DEFAULT 'picklehub-admin',
    "credential_hash" CHAR(64) NOT NULL,
    "mfa_method" "admin_mfa_method" NOT NULL,
    "mfa_verified_at" TIMESTAMPTZ(3) NOT NULL,
    "reauthenticated_at" TIMESTAMPTZ(3),
    "security_epoch" INTEGER NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason_code" VARCHAR(96),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_sessions_credential_hash_key" UNIQUE ("credential_hash"),
    CONSTRAINT "admin_sessions_audience_check" CHECK ("audience" = 'picklehub-admin'),
    CONSTRAINT "admin_sessions_hash_check" CHECK ("credential_hash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "admin_sessions_epoch_check" CHECK ("security_epoch" >= 0),
    CONSTRAINT "admin_sessions_time_bounds_check" CHECK (
        "mfa_verified_at" <= "created_at"
        AND ("reauthenticated_at" IS NULL OR "reauthenticated_at" BETWEEN "created_at" AND "absolute_expires_at")
        AND "idle_expires_at" <= "last_seen_at" + INTERVAL '15 minutes'
        AND "absolute_expires_at" <= "created_at" + INTERVAL '8 hours'
        AND "idle_expires_at" > "last_seen_at"
        AND "absolute_expires_at" > "created_at"
        AND (("revoked_at" IS NULL AND "revoke_reason_code" IS NULL)
            OR ("revoked_at" IS NOT NULL AND "revoke_reason_code" IS NOT NULL))
    )
);
CREATE INDEX "admin_sessions_staff_access_idx"
    ON "admin_sessions"("staff_user_id", "revoked_at", "absolute_expires_at");
CREATE INDEX "admin_sessions_expiry_idx" ON "admin_sessions"("idle_expires_at", "absolute_expires_at");

CREATE TABLE "break_glass_grants" (
    "id" UUID PRIMARY KEY,
    "actor_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "case_id" UUID NOT NULL REFERENCES "moderation_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "incident_reference" VARCHAR(160) NOT NULL,
    "reason_code" VARCHAR(96) NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "justification_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revoke_reason_code" VARCHAR(96),
    CONSTRAINT "break_glass_grants_reason_check" CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    CONSTRAINT "break_glass_grants_reference_check" CHECK (length("incident_reference") BETWEEN 1 AND 160),
    CONSTRAINT "break_glass_grants_bounds_check" CHECK (
        "encryption_key_version" > 0 AND "revision" >= 0
        AND "expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '30 minutes'
        AND (("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL AND "revoke_reason_code" IS NULL)
            OR ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL AND "revoke_reason_code" IS NOT NULL))
    )
);
CREATE UNIQUE INDEX "break_glass_grants_active_case_key"
    ON "break_glass_grants"("actor_user_id", "case_id") WHERE "revoked_at" IS NULL;
CREATE INDEX "break_glass_grants_access_idx"
    ON "break_glass_grants"("actor_user_id", "case_id", "expires_at", "revoked_at");
CREATE INDEX "break_glass_grants_expiry_idx" ON "break_glass_grants"("expires_at", "revoked_at");

CREATE TABLE "admin_operation_receipts" (
    "id" UUID PRIMARY KEY,
    "actor_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "idempotency_key" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "canonical_path" VARCHAR(200) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "target_type" VARCHAR(96) NOT NULL,
    "target_id" UUID,
    "expected_revision" INTEGER NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "audit_entry_id" UUID REFERENCES "audit_entries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    CONSTRAINT "admin_operation_receipts_scope_key" UNIQUE (
        "actor_user_id", "method", "canonical_path", "idempotency_key"
    ),
    CONSTRAINT "admin_operation_receipts_audit_key" UNIQUE ("audit_entry_id"),
    CONSTRAINT "admin_operation_receipts_fingerprint_check" CHECK ("request_fingerprint" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "admin_operation_receipts_method_check" CHECK ("method" IN ('POST', 'PUT', 'PATCH', 'DELETE')),
    CONSTRAINT "admin_operation_receipts_target_check" CHECK ("target_type" ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    CONSTRAINT "admin_operation_receipts_bounds_check" CHECK (
        "expected_revision" >= 0 AND "response_status" BETWEEN 200 AND 599
        AND "encryption_key_version" > 0 AND "expires_at" = "created_at" + INTERVAL '24 hours'
    )
);
CREATE INDEX "admin_operation_receipts_expiry_idx" ON "admin_operation_receipts"("expires_at");

CREATE TABLE "user_restrictions" (
    "id" UUID PRIMARY KEY,
    "user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "decision_id" UUID NOT NULL REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "scope" "admin_restriction_scope" NOT NULL,
    "state" "admin_restriction_state" NOT NULL DEFAULT 'ACTIVE',
    "reason_code" VARCHAR(96) NOT NULL,
    "policy_version" VARCHAR(128) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    "revoke_reason_code" VARCHAR(96),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_restrictions_decision_scope_key" UNIQUE ("decision_id", "scope"),
    CONSTRAINT "user_restrictions_reason_check" CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{1,95}$'),
    CONSTRAINT "user_restrictions_bounds_check" CHECK (
        "revision" >= 0 AND ("expires_at" IS NULL OR "expires_at" > "created_at")
        AND (("state" = 'ACTIVE' AND "revoked_at" IS NULL AND "revoked_by_user_id" IS NULL AND "revoke_reason_code" IS NULL)
            OR ("state" = 'REVOKED' AND "revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL
                AND "revoke_reason_code" IS NOT NULL)
            OR ("state" = 'EXPIRED' AND "expires_at" IS NOT NULL AND "revoked_at" IS NULL))
    )
);
CREATE UNIQUE INDEX "user_restrictions_active_scope_key"
    ON "user_restrictions"("user_id", "scope") WHERE "state" = 'ACTIVE';
CREATE INDEX "user_restrictions_effective_idx" ON "user_restrictions"("user_id", "state", "expires_at");

CREATE FUNCTION "admin_session_grant_guard"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "platform_role_grants" g
        WHERE g."id" = NEW."role_grant_id" AND g."subject_user_id" = NEW."staff_user_id"
          AND g."revoked_at" IS NULL AND g."valid_from" <= NEW."created_at"
          AND (g."valid_until" IS NULL OR g."valid_until" > NEW."created_at")
    ) THEN RAISE EXCEPTION 'admin session requires an active role grant for the staff user'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "admin_sessions_grant_guard" BEFORE INSERT OR UPDATE OF "role_grant_id" ON "admin_sessions"
    FOR EACH ROW EXECUTE FUNCTION "admin_session_grant_guard"();

CREATE FUNCTION "admin_role_grant_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."subject_user_id" <> OLD."subject_user_id" OR NEW."role" <> OLD."role"
        OR NEW."granted_by_user_id" <> OLD."granted_by_user_id"
        OR NEW."approved_by_user_id" <> OLD."approved_by_user_id"
        OR NEW."reason_code" <> OLD."reason_code" OR NEW."policy_version" <> OLD."policy_version"
        OR NEW."approval_reference" <> OLD."approval_reference" OR NEW."valid_from" <> OLD."valid_from"
        OR NEW."valid_until" IS DISTINCT FROM OLD."valid_until" OR NEW."review_at" <> OLD."review_at"
        OR NEW."created_at" <> OLD."created_at" THEN RAISE EXCEPTION 'role grant identity is immutable'; END IF;
    IF OLD."revoked_at" IS NOT NULL OR NEW."revoked_at" IS NULL OR NEW."revision" <> OLD."revision" + 1 THEN
        RAISE EXCEPTION 'role grant can only transition once to revoked';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "platform_role_grants_transition_guard" BEFORE UPDATE ON "platform_role_grants"
    FOR EACH ROW EXECUTE FUNCTION "admin_role_grant_transition_guard"();
CREATE TRIGGER "platform_role_grants_no_delete" BEFORE DELETE ON "platform_role_grants"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();

CREATE FUNCTION "break_glass_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."actor_user_id" <> OLD."actor_user_id" OR NEW."case_id" <> OLD."case_id"
        OR NEW."incident_reference" <> OLD."incident_reference" OR NEW."reason_code" <> OLD."reason_code"
        OR NEW."policy_version" <> OLD."policy_version"
        OR NEW."justification_ciphertext" <> OLD."justification_ciphertext"
        OR NEW."encryption_key_version" <> OLD."encryption_key_version"
        OR NEW."created_at" <> OLD."created_at" OR NEW."expires_at" <> OLD."expires_at" THEN
        RAISE EXCEPTION 'break-glass scope and expiry are immutable';
    END IF;
    IF OLD."revoked_at" IS NOT NULL OR NEW."revoked_at" IS NULL OR NEW."revision" <> OLD."revision" + 1 THEN
        RAISE EXCEPTION 'break-glass grant can only transition once to revoked';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "break_glass_grants_transition_guard" BEFORE UPDATE ON "break_glass_grants"
    FOR EACH ROW EXECUTE FUNCTION "break_glass_transition_guard"();
CREATE TRIGGER "break_glass_grants_no_delete" BEFORE DELETE ON "break_glass_grants"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();

CREATE FUNCTION "user_restriction_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."user_id" <> OLD."user_id" OR NEW."decision_id" <> OLD."decision_id" OR NEW."scope" <> OLD."scope"
        OR NEW."reason_code" <> OLD."reason_code" OR NEW."policy_version" <> OLD."policy_version"
        OR NEW."created_by_user_id" <> OLD."created_by_user_id" OR NEW."created_at" <> OLD."created_at"
        OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" THEN RAISE EXCEPTION 'restriction identity is immutable'; END IF;
    IF OLD."state" <> 'ACTIVE' OR NEW."state" NOT IN ('REVOKED', 'EXPIRED')
        OR NEW."revision" <> OLD."revision" + 1 THEN RAISE EXCEPTION 'invalid restriction transition'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "user_restrictions_transition_guard" BEFORE UPDATE ON "user_restrictions"
    FOR EACH ROW EXECUTE FUNCTION "user_restriction_transition_guard"();
CREATE TRIGGER "user_restrictions_no_delete" BEFORE DELETE ON "user_restrictions"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();

CREATE TRIGGER "admin_operation_receipts_immutable" BEFORE UPDATE OR DELETE ON "admin_operation_receipts"
    FOR EACH ROW EXECUTE FUNCTION "safety_forbid_mutation"();

-- Database ownership still applies; these grants ensure a generic runtime role can never mutate audit history.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_entries" FROM PUBLIC;

COMMENT ON TABLE "platform_role_grants" IS
    'Only four code-defined roles; capabilities are not rows and no wildcard/custom permission store exists.';
COMMENT ON TABLE "break_glass_grants" IS
    'One actor and one moderation case for at most 30 minutes; no queue, export or decision capability.';
COMMENT ON TABLE "admin_operation_receipts" IS
    'Encrypted 24-hour idempotency receipts; raw lookup keys, narrative and credentials are forbidden.';
COMMENT ON TABLE "audit_entries" IS
    'Append-only security record. Administration adds operation and policy identifiers without rewriting prior rows.';
