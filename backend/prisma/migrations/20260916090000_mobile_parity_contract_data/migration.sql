ALTER TABLE "identity_sessions" DROP CONSTRAINT "identity_sessions_lifetime_check";
ALTER TABLE "identity_sessions" ADD CONSTRAINT "identity_sessions_lifetime_check" CHECK (
    "auth_epoch" >= 0 AND "platform" IN ('WEB', 'TMA', 'MOBILE') AND
    "idle_expires_at" > "created_at" AND "absolute_expires_at" > "created_at" AND
    "idle_expires_at" <= "absolute_expires_at" AND
    ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
);

ALTER TABLE "consents" DROP CONSTRAINT "consents_platform_check";
ALTER TABLE "consents" ADD CONSTRAINT "consents_platform_check"
    CHECK ("platform" IN ('WEB', 'TMA', 'MOBILE'));

ALTER TABLE "magic_links"
    ADD COLUMN "client_platform" VARCHAR(8),
    ADD COLUMN "native_code_challenge" CHAR(43),
    ADD COLUMN "mobile_destination" JSONB;

ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_native_binding_check" CHECK (
    ("client_platform" IS NULL AND "native_code_challenge" IS NULL AND "mobile_destination" IS NULL)
    OR ("client_platform" IN ('WEB', 'TMA') AND "native_code_challenge" IS NULL AND "mobile_destination" IS NULL)
    OR ("client_platform" = 'MOBILE'
        AND "purpose" = 'LOGIN'
        AND "native_code_challenge" ~ '^[A-Za-z0-9_-]{43}$')
);

ALTER TYPE "communication_platform" ADD VALUE 'MOBILE';
ALTER TYPE "notification_channel" ADD VALUE 'PUSH';
CREATE TYPE "mobile_operating_system" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "push_environment" AS ENUM ('SANDBOX', 'PRODUCTION');

ALTER TABLE "notification_deliveries"
    DROP CONSTRAINT "notification_deliveries_external_only_check";
ALTER TABLE "notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_external_only_check"
    -- Compare text so the newly added enum value is not used before transaction commit.
    CHECK ("channel"::text IN ('TELEGRAM', 'EMAIL', 'PUSH'));

CREATE TABLE "push_registrations" (
    "id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "operating_system" "mobile_operating_system" NOT NULL,
    "environment" "push_environment" NOT NULL,
    "app_version" VARCHAR(64) NOT NULL,
    "token_key" CHAR(64),
    "token_ciphertext" BYTEA,
    "encryption_key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days'),
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason_code" VARCHAR(96),
    CONSTRAINT "push_registrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "push_registrations_token_key_check" CHECK (
        "token_key" IS NULL OR "token_key" ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT "push_registrations_shape_check" CHECK (
        "encryption_key_version" > 0
        AND char_length("app_version") BETWEEN 1 AND 64
        AND "last_seen_at" >= "created_at"
        AND "expires_at" = "last_seen_at" + INTERVAL '90 days'
        AND (("revoked_at" IS NULL AND "token_key" IS NOT NULL
                AND "token_ciphertext" IS NOT NULL AND "revoke_reason_code" IS NULL)
            OR ("revoked_at" IS NOT NULL AND "revoked_at" >= "created_at"
                AND "token_key" IS NULL AND "token_ciphertext" IS NULL AND "revoke_reason_code" IS NOT NULL))
    ),
    CONSTRAINT "push_registrations_installation_fkey" FOREIGN KEY ("installation_id")
        REFERENCES "notification_devices"("installation_id") ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "push_registrations_installation_environment_active_key"
    ON "push_registrations"("installation_id", "environment") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "push_registrations_environment_token_active_key"
    ON "push_registrations"("environment", "token_key") WHERE "revoked_at" IS NULL;
CREATE INDEX "push_registrations_installation_active_idx"
    ON "push_registrations"("installation_id", "revoked_at", "expires_at");
CREATE INDEX "push_registrations_expiry_idx" ON "push_registrations"("expires_at");

CREATE TABLE "push_delivery_attempts" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "status" "notification_delivery_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider_message_key" CHAR(64),
    "last_error_code" VARCHAR(96),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminal_at" TIMESTAMPTZ(3),
    CONSTRAINT "push_delivery_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "push_delivery_attempts_logical_key" UNIQUE ("delivery_id", "registration_id"),
    CONSTRAINT "push_delivery_attempts_shape_check" CHECK (
        "attempts" BETWEEN 0 AND 12 AND ("terminal_at" IS NULL OR "terminal_at" >= "created_at")
    ),
    CONSTRAINT "push_delivery_attempts_delivery_fkey" FOREIGN KEY ("delivery_id")
        REFERENCES "notification_deliveries"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "push_delivery_attempts_registration_fkey" FOREIGN KEY ("registration_id")
        REFERENCES "push_registrations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "push_delivery_attempts_dispatch_idx"
    ON "push_delivery_attempts"("status", "created_at", "id")
    WHERE "status" IN ('PENDING', 'DEFERRED');

CREATE FUNCTION "push_registration_protect_secret"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD."revoked_at" IS NOT NULL THEN
        RAISE EXCEPTION 'revoked push registration is immutable';
    END IF;
    IF ROW(NEW."id", NEW."installation_id", NEW."operating_system", NEW."environment", NEW."created_at")
       IS DISTINCT FROM
       ROW(OLD."id", OLD."installation_id", OLD."operating_system", OLD."environment", OLD."created_at") THEN
        RAISE EXCEPTION 'push registration identity is immutable';
    END IF;
    IF NEW."revoked_at" IS NULL AND NEW."token_key" IS DISTINCT FROM OLD."token_key" THEN
        RAISE EXCEPTION 'active push token key is immutable';
    END IF;
    IF NEW."revoked_at" IS NOT NULL AND (NEW."token_key" IS NOT NULL OR NEW."token_ciphertext" IS NOT NULL) THEN
        RAISE EXCEPTION 'revocation must erase push token key and ciphertext';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "push_registrations_protect_secret"
    BEFORE UPDATE ON "push_registrations"
    FOR EACH ROW EXECUTE FUNCTION "push_registration_protect_secret"();

CREATE FUNCTION "notification_device_revoke_push"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD."revoked_at" IS NULL AND NEW."revoked_at" IS NOT NULL THEN
        UPDATE "push_registrations"
           SET "revoked_at" = NEW."revoked_at",
               "revoke_reason_code" = 'INSTALLATION_REVOKED',
               "token_key" = NULL,
               "token_ciphertext" = NULL
         WHERE "installation_id" = NEW."installation_id" AND "revoked_at" IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notification_devices_revoke_push"
    AFTER UPDATE OF "revoked_at" ON "notification_devices"
    FOR EACH ROW EXECUTE FUNCTION "notification_device_revoke_push"();
