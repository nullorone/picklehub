-- Identity/onboarding data contract; application use cases are implemented in the next prompt.

CREATE TYPE "identity_provider" AS ENUM ('TELEGRAM', 'EMAIL');

CREATE TYPE "identity_user_status" AS ENUM ('ACTIVE', 'DELETION_PENDING', 'DELETED');

CREATE TYPE "consent_purpose" AS ENUM ('TERMS', 'PERSONAL_DATA', 'ANALYTICS', 'MARKETING');

CREATE TYPE "consent_action" AS ENUM ('ACCEPTED', 'WITHDRAWN');

CREATE TABLE "identity_users" (
    "id" UUID NOT NULL,
    "status" "identity_user_status" NOT NULL DEFAULT 'ACTIVE',
    "auth_epoch" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "deletion_requested_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "identity_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "identity_provider" NOT NULL,
    "subject_key" CHAR(64) NOT NULL,
    "subject_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identities_provider_subject_key" ON "identities" ("provider", "subject_key");

CREATE UNIQUE INDEX "identities_user_provider_key" ON "identities" ("user_id", "provider");

CREATE TABLE "identity_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "auth_epoch" INTEGER NOT NULL,
    "platform" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "identity_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "identity_sessions_user_idx" ON "identity_sessions" ("user_id", "revoked_at");

CREATE TABLE "refresh_credentials" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(3),
    CONSTRAINT "refresh_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_credentials_token_hash_key" ON "refresh_credentials" ("token_hash");

CREATE TABLE "access_credentials" (
    "token_hash" CHAR(64) NOT NULL,
    "session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "access_credentials_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX "access_credentials_expiry_idx" ON "access_credentials" ("expires_at");

CREATE TABLE "identity_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "target_provider" "identity_provider",
    "target_identity_id" UUID,
    "current_subject_key" CHAR(64),
    "current_provider" "identity_provider",
    "current_proof_expires_at" TIMESTAMPTZ(3),
    "target_subject_key" CHAR(64),
    "target_subject_ciphertext" BYTEA,
    "target_encryption_key_version" INTEGER,
    "target_proof_expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "identity_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "identity_attempts_user_expiry_idx" ON "identity_attempts" ("user_id", "expires_at");

CREATE TABLE "magic_links" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "attempt_id" UUID,
    "purpose" VARCHAR(16) NOT NULL,
    "side" VARCHAR(8),
    "scope_key" CHAR(64) NOT NULL,
    "subject_key" CHAR(64) NOT NULL,
    "subject_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "magic_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "magic_links_token_hash_key" ON "magic_links" ("token_hash");

CREATE INDEX "magic_links_expiry_idx" ON "magic_links" ("expires_at");

CREATE TABLE "telegram_proof_replays" (
    "fingerprint" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "telegram_proof_replays_pkey" PRIMARY KEY ("fingerprint")
);

CREATE INDEX "telegram_proof_replays_expiry_idx" ON "telegram_proof_replays" ("expires_at");

CREATE TABLE "consent_documents" (
    "purpose" "consent_purpose" NOT NULL,
    "version" VARCHAR(128) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "text" TEXT NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "consent_documents_pkey" PRIMARY KEY ("purpose", "version")
);

CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "consent_purpose" NOT NULL,
    "version" VARCHAR(128) NOT NULL,
    "action" "consent_action" NOT NULL,
    "platform" VARCHAR(8) NOT NULL,
    "operation_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consents_user_operation_key" ON "consents" ("user_id", "operation_id");

CREATE INDEX "consents_user_history_idx" ON "consents" ("user_id", "occurred_at", "id");

CREATE TABLE "onboarding_localities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "region" VARCHAR(120) NOT NULL,
    "catalogue_version" INTEGER NOT NULL,
    CONSTRAINT "onboarding_localities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_profile_drafts" (
    "user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "display_name" VARCHAR(50),
    "time_zone" VARCHAR(64),
    "locality_id" UUID,
    "game_formats" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "skill_self_assessment" DECIMAL(2, 1),
    "dupr_profile_url" VARCHAR(2048),
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_profile_drafts_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "identity_idempotency_records" (
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
    CONSTRAINT "identity_idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_idempotency_scope_key"
    ON "identity_idempotency_records" ("user_id", "method", "canonical_path", "idempotency_key");

CREATE INDEX "identity_idempotency_expiry_idx" ON "identity_idempotency_records" ("expires_at");

ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "identity_sessions" ADD CONSTRAINT "identity_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "refresh_credentials" ADD CONSTRAINT "refresh_credentials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "identity_sessions" ("id") ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "access_credentials" ADD CONSTRAINT "access_credentials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "identity_sessions" ("id") ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "identity_attempts" ADD CONSTRAINT "identity_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "identity_attempts" ADD CONSTRAINT "identity_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "identity_sessions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "identity_attempts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "consents" ADD CONSTRAINT "consents_purpose_version_fkey" FOREIGN KEY ("purpose", "version") REFERENCES "consent_documents" ("purpose", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "player_profile_drafts" ADD CONSTRAINT "player_profile_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "player_profile_drafts" ADD CONSTRAINT "player_profile_drafts_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "onboarding_localities" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "identity_idempotency_records" ADD CONSTRAINT "identity_idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Partial indexes are deliberately maintained in SQL (not representable in Prisma 6).
CREATE UNIQUE INDEX refresh_credentials_current_key ON refresh_credentials(session_id) WHERE rotated_at IS NULL;
CREATE UNIQUE INDEX magic_links_pending_scope_key ON magic_links(scope_key) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX consent_documents_current_key ON consent_documents(purpose) WHERE is_current;

ALTER TABLE identity_users ADD CONSTRAINT identity_users_state_check CHECK (
    auth_epoch >= 0 AND
    last_login_at >= created_at AND (completed_at IS NULL OR completed_at >= created_at) AND
    (deletion_requested_at IS NULL OR deletion_requested_at >= created_at) AND
    ((status = 'ACTIVE' AND deletion_requested_at IS NULL AND deleted_at IS NULL) OR
     (status = 'DELETION_PENDING' AND deletion_requested_at IS NOT NULL AND deleted_at IS NULL) OR
     (status = 'DELETED' AND deletion_requested_at IS NOT NULL AND deleted_at >= deletion_requested_at))
);
ALTER TABLE identities ADD CONSTRAINT identities_subject_check CHECK (
    subject_key ~ '^[a-f0-9]{64}$' AND octet_length(subject_ciphertext) > 0 AND encryption_key_version > 0
);
ALTER TABLE identity_sessions ADD CONSTRAINT identity_sessions_lifetime_check CHECK (
    auth_epoch >= 0 AND platform IN ('WEB', 'TMA') AND
    created_at < idle_expires_at AND idle_expires_at <= absolute_expires_at AND
    absolute_expires_at <= created_at + INTERVAL '30 days' AND (revoked_at IS NULL OR revoked_at >= created_at)
);
ALTER TABLE refresh_credentials ADD CONSTRAINT refresh_credentials_hash_check CHECK (
    token_hash ~ '^[a-f0-9]{64}$' AND (rotated_at IS NULL OR rotated_at >= created_at)
);
ALTER TABLE access_credentials ADD CONSTRAINT access_credentials_lifetime_check CHECK (
    token_hash ~ '^[a-f0-9]{64}$' AND created_at < expires_at AND expires_at <= created_at + INTERVAL '5 minutes'
);
ALTER TABLE identity_attempts ADD CONSTRAINT identity_attempts_shape_check CHECK (
    ((action = 'LINK' AND target_provider IS NOT NULL AND target_identity_id IS NULL) OR
     (action = 'UNLINK' AND target_provider IS NULL AND target_identity_id IS NOT NULL) OR
     (action = 'DELETE_ACCOUNT' AND target_provider IS NULL AND target_identity_id IS NULL)) AND
    created_at < expires_at AND expires_at <= created_at + INTERVAL '10 minutes' AND
    NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL) AND
    (consumed_at IS NULL OR consumed_at >= created_at) AND (revoked_at IS NULL OR revoked_at >= created_at) AND
    ((current_subject_key IS NULL AND current_provider IS NULL AND current_proof_expires_at IS NULL) OR
     (current_subject_key IS NOT NULL AND current_subject_key ~ '^[a-f0-9]{64}$' AND current_provider IS NOT NULL AND
      current_proof_expires_at IS NOT NULL AND current_proof_expires_at <= expires_at)) AND
    ((target_subject_key IS NULL AND target_subject_ciphertext IS NULL AND target_encryption_key_version IS NULL AND target_proof_expires_at IS NULL) OR
     (action = 'LINK' AND target_subject_key IS NOT NULL AND target_subject_key ~ '^[a-f0-9]{64}$' AND
      target_subject_ciphertext IS NOT NULL AND octet_length(target_subject_ciphertext) > 0 AND
      target_encryption_key_version IS NOT NULL AND target_encryption_key_version > 0 AND
      target_proof_expires_at IS NOT NULL AND target_proof_expires_at <= expires_at))
);
ALTER TABLE magic_links ADD CONSTRAINT magic_links_shape_check CHECK (
    token_hash ~ '^[a-f0-9]{64}$' AND scope_key ~ '^[a-f0-9]{64}$' AND subject_key ~ '^[a-f0-9]{64}$' AND
    octet_length(subject_ciphertext) > 0 AND encryption_key_version > 0 AND
    created_at < expires_at AND expires_at <= created_at + INTERVAL '10 minutes' AND
    NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL) AND
    (consumed_at IS NULL OR consumed_at >= created_at) AND (revoked_at IS NULL OR revoked_at >= created_at) AND
    ((purpose = 'LOGIN' AND attempt_id IS NULL AND side IS NULL) OR
     (purpose = 'PROOF' AND attempt_id IS NOT NULL AND user_id IS NOT NULL AND side IS NOT NULL AND side IN ('CURRENT', 'TARGET')))
);
ALTER TABLE telegram_proof_replays ADD CONSTRAINT telegram_proof_replays_hash_check CHECK (fingerprint ~ '^[a-f0-9]{64}$');
ALTER TABLE consent_documents ADD CONSTRAINT consent_documents_shape_check CHECK (
    checksum ~ '^[a-f0-9]{64}$' AND version ~ '^[A-Za-z0-9_-]{1,128}$' AND length(title) > 0 AND length(text) BETWEEN 1 AND 100000
);
ALTER TABLE consents ADD CONSTRAINT consents_platform_check CHECK (platform IN ('WEB', 'TMA'));
ALTER TABLE onboarding_localities ADD CONSTRAINT onboarding_localities_shape_check CHECK (
    length(name) > 0 AND length(region) > 0 AND country_code ~ '^[A-Z]{2}$' AND catalogue_version > 0
);
ALTER TABLE player_profile_drafts ADD CONSTRAINT player_profile_drafts_fields_check CHECK (
    version >= 0 AND
    (display_name IS NULL OR (length(display_name) BETWEEN 2 AND 50 AND display_name = btrim(display_name) AND display_name !~ '[[:cntrl:]]')) AND
    (time_zone IS NULL OR length(time_zone) > 0) AND
    game_formats IN (ARRAY[]::TEXT[], ARRAY['SINGLES'], ARRAY['DOUBLES'], ARRAY['SINGLES','DOUBLES'], ARRAY['DOUBLES','SINGLES']) AND
    (skill_self_assessment IS NULL OR skill_self_assessment IN (1,1.5,2,2.5,3,3.5,4,4.5,5)) AND
    (dupr_profile_url IS NULL OR dupr_profile_url ~ '^https://[^/?#@]+/[^?#]+$') AND
    (completed_at IS NULL OR (display_name IS NOT NULL AND time_zone IS NOT NULL AND locality_id IS NOT NULL AND cardinality(game_formats) > 0 AND skill_self_assessment IS NOT NULL))
);
ALTER TABLE identity_idempotency_records ADD CONSTRAINT identity_idempotency_records_shape_check CHECK (
    method IN ('POST', 'PATCH') AND length(canonical_path) > 0 AND canonical_path LIKE '/v1/%' AND
    request_fingerprint ~ '^[a-f0-9]{64}$' AND response_status BETWEEN 200 AND 599 AND
    octet_length(response_ciphertext) > 0 AND encryption_key_version > 0 AND
    expires_at = created_at + INTERVAL '24 hours'
);

-- Retention role deletes consent records only after legal approval; runtime mutations are forbidden.
CREATE FUNCTION reject_consent_update() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'consents are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER consents_reject_update BEFORE UPDATE ON consents FOR EACH ROW EXECUTE FUNCTION reject_consent_update();

CREATE FUNCTION protect_consent_document() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW.purpose, NEW.version, NEW.checksum, NEW.title, NEW.text, NEW.effective_at)
       IS DISTINCT FROM ROW(OLD.purpose, OLD.version, OLD.checksum, OLD.title, OLD.text, OLD.effective_at) THEN
        RAISE EXCEPTION 'consent document content is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER consent_documents_protect_content BEFORE UPDATE ON consent_documents FOR EACH ROW EXECUTE FUNCTION protect_consent_document();

-- Lock user BEFORE identity writes to serialize cross-row invariants even at READ COMMITTED.
CREATE FUNCTION lock_identity_owner() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
        RAISE EXCEPTION 'identity ownership cannot be transferred' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN
        PERFORM id FROM identity_users WHERE id = OLD.user_id FOR UPDATE;
        RETURN OLD;
    END IF;
    PERFORM id FROM identity_users WHERE id = NEW.user_id FOR UPDATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER identities_lock_owner BEFORE INSERT OR UPDATE OR DELETE ON identities FOR EACH ROW EXECUTE FUNCTION lock_identity_owner();

CREATE FUNCTION require_active_user_identity() RETURNS trigger AS $$
DECLARE owner_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'identity_users' THEN
        owner_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        owner_id := OLD.user_id;
    ELSE
        owner_id := NEW.user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM identity_users WHERE id = owner_id AND status = 'ACTIVE') AND
       NOT EXISTS (SELECT 1 FROM identities WHERE user_id = owner_id) THEN
        RAISE EXCEPTION 'active user needs at least one identity' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER identity_users_require_identity AFTER INSERT OR UPDATE ON identity_users
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_active_user_identity();
CREATE CONSTRAINT TRIGGER identities_require_remaining AFTER INSERT OR UPDATE OR DELETE ON identities
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_active_user_identity();

-- One-time state cannot be reset by an accidental update; atomic compare-and-set still checks the clock.
CREATE FUNCTION protect_magic_link_transition() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW.id, NEW.token_hash, NEW.scope_key, NEW.subject_key, NEW.subject_ciphertext, NEW.encryption_key_version,
           NEW.purpose, NEW.side, NEW.attempt_id, NEW.user_id, NEW.created_at, NEW.expires_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.token_hash, OLD.scope_key, OLD.subject_key, OLD.subject_ciphertext, OLD.encryption_key_version,
           OLD.purpose, OLD.side, OLD.attempt_id, OLD.user_id, OLD.created_at, OLD.expires_at) OR
       (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at) OR
       (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
        RAISE EXCEPTION 'magic link proof is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER magic_links_protect_transition BEFORE UPDATE ON magic_links FOR EACH ROW EXECUTE FUNCTION protect_magic_link_transition();

CREATE FUNCTION protect_refresh_transition() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW.id, NEW.session_id, NEW.token_hash, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.session_id, OLD.token_hash, OLD.created_at) OR
       (OLD.rotated_at IS NOT NULL AND NEW.rotated_at IS DISTINCT FROM OLD.rotated_at) THEN
        RAISE EXCEPTION 'refresh credential cannot be reused' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER refresh_credentials_protect_transition BEFORE UPDATE ON refresh_credentials FOR EACH ROW EXECUTE FUNCTION protect_refresh_transition();

CREATE FUNCTION protect_identity_user_transition() RETURNS trigger AS $$
BEGIN
    IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at OR NEW.auth_epoch < OLD.auth_epoch OR
       NEW.last_login_at < OLD.last_login_at OR
       (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) OR
       (OLD.deletion_requested_at IS NOT NULL AND NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at) OR
       (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) OR
       NOT ((OLD.status = NEW.status) OR
            (OLD.status = 'ACTIVE' AND NEW.status = 'DELETION_PENDING') OR
            (OLD.status = 'DELETION_PENDING' AND NEW.status = 'DELETED')) THEN
        RAISE EXCEPTION 'invalid identity user transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER identity_users_protect_transition BEFORE UPDATE ON identity_users
    FOR EACH ROW EXECUTE FUNCTION protect_identity_user_transition();

CREATE FUNCTION protect_session_transition() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW.id, NEW.user_id, NEW.auth_epoch, NEW.platform, NEW.created_at, NEW.absolute_expires_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.auth_epoch, OLD.platform, OLD.created_at, OLD.absolute_expires_at) OR
       NEW.idle_expires_at < OLD.idle_expires_at OR
       (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
        RAISE EXCEPTION 'invalid session transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER identity_sessions_protect_transition BEFORE UPDATE ON identity_sessions
    FOR EACH ROW EXECUTE FUNCTION protect_session_transition();

CREATE FUNCTION protect_identity_attempt_transition() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW.id, NEW.user_id, NEW.session_id, NEW.action, NEW.target_provider, NEW.target_identity_id,
           NEW.created_at, NEW.expires_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.session_id, OLD.action, OLD.target_provider,
                            OLD.target_identity_id, OLD.created_at, OLD.expires_at) OR
       (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at) OR
       (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
        RAISE EXCEPTION 'invalid identity attempt transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER identity_attempts_protect_transition BEFORE UPDATE ON identity_attempts
    FOR EACH ROW EXECUTE FUNCTION protect_identity_attempt_transition();

CREATE FUNCTION reject_security_record_update() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'security record is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER access_credentials_reject_update BEFORE UPDATE ON access_credentials
    FOR EACH ROW EXECUTE FUNCTION reject_security_record_update();
CREATE TRIGGER telegram_proof_replays_reject_update BEFORE UPDATE ON telegram_proof_replays
    FOR EACH ROW EXECUTE FUNCTION reject_security_record_update();
CREATE TRIGGER identity_idempotency_records_reject_update BEFORE UPDATE ON identity_idempotency_records
    FOR EACH ROW EXECUTE FUNCTION reject_security_record_update();
