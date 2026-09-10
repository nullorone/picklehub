CREATE TYPE "conversation_state" AS ENUM ('WRITABLE', 'READ_ONLY');
CREATE TYPE "chat_message_kind" AS ENUM ('USER', 'SYSTEM');
CREATE TYPE "chat_revision_kind" AS ENUM ('CREATED', 'EDITED', 'DELETED');
CREATE TYPE "chat_report_reason" AS ENUM ('SPAM', 'HARASSMENT', 'HATE', 'THREAT', 'OTHER');
CREATE TYPE "notification_category" AS ENUM ('ROSTER', 'REQUESTS', 'MATCH_CRITICAL', 'REMINDERS', 'RESULTS', 'CHAT');
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'TELEGRAM', 'EMAIL');
CREATE TYPE "notification_delivery_status" AS ENUM (
    'PENDING',
    'DEFERRED',
    'PROCESSING',
    'ACCEPTED',
    'DELIVERED',
    'FAILED',
    'SUPPRESSED',
    'QUARANTINED'
);
CREATE TYPE "communication_platform" AS ENUM ('WEB', 'TMA');

CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "state" "conversation_state" NOT NULL DEFAULT 'WRITABLE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "latest_sequence" BIGINT NOT NULL DEFAULT 0,
    "write_closes_at" TIMESTAMPTZ(3),
    "retention_expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_match_key" UNIQUE ("match_id"),
    CONSTRAINT "conversations_sequence_check" CHECK ("latest_sequence" >= 0),
    CONSTRAINT "conversations_version_check" CHECK ("version" >= 0),
    CONSTRAINT "conversations_retention_check" CHECK (
        "retention_expires_at" IS NULL OR "retention_expires_at" >= "created_at"
    ),
    CONSTRAINT "conversations_match_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "conversation_memberships" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "access_granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_revoked_at" TIMESTAMPTZ(3),
    "access_through_sequence" BIGINT,
    "read_access_expires_at" TIMESTAMPTZ(3),
    "last_read_sequence" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "conversation_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_memberships_bounds_check" CHECK (
        "last_read_sequence" >= 0
        AND ("access_through_sequence" IS NULL OR "access_through_sequence" >= 0)
        AND ("access_through_sequence" IS NULL OR "last_read_sequence" <= "access_through_sequence")
        AND ("access_revoked_at" IS NULL OR "access_revoked_at" >= "access_granted_at")
        AND (("access_revoked_at" IS NULL AND "access_through_sequence" IS NULL AND "read_access_expires_at" IS NULL)
            OR ("access_revoked_at" IS NOT NULL AND "access_through_sequence" IS NOT NULL
                AND "read_access_expires_at" = "access_revoked_at" + INTERVAL '30 days'))
    ),
    CONSTRAINT "conversation_memberships_conversation_fkey" FOREIGN KEY ("conversation_id")
        REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "conversation_memberships_user_fkey" FOREIGN KEY ("user_id")
        REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "conversation_memberships_active_key"
    ON "conversation_memberships"("conversation_id", "user_id") WHERE "access_revoked_at" IS NULL;
CREATE INDEX "conversation_memberships_user_access_idx"
    ON "conversation_memberships"("user_id", "read_access_expires_at", "conversation_id");

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "kind" "chat_message_kind" NOT NULL,
    "author_id" UUID,
    "system_type" VARCHAR(64),
    "source_event_id" UUID,
    "current_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_messages_conversation_sequence_key" UNIQUE ("conversation_id", "sequence"),
    CONSTRAINT "chat_messages_sequence_check" CHECK ("sequence" > 0 AND "current_revision" > 0),
    CONSTRAINT "chat_messages_shape_check" CHECK (
        ("kind" = 'USER' AND "author_id" IS NOT NULL AND "system_type" IS NULL AND "source_event_id" IS NULL)
        OR ("kind" = 'SYSTEM' AND "author_id" IS NULL AND "system_type" IS NOT NULL AND "source_event_id" IS NOT NULL)
    ),
    CONSTRAINT "chat_messages_deleted_check" CHECK (
        ("deleted_at" IS NULL OR "deleted_at" >= "created_at")
        AND ("edited_at" IS NULL OR "edited_at" >= "created_at")
    ),
    CONSTRAINT "chat_messages_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "chat_messages_author_fkey" FOREIGN KEY ("author_id") REFERENCES "identity_users"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "chat_messages_system_source_event_key"
    ON "chat_messages"("conversation_id", "source_event_id") WHERE "source_event_id" IS NOT NULL;
CREATE INDEX "chat_messages_history_idx" ON "chat_messages"("conversation_id", "sequence" DESC);

CREATE TABLE "chat_message_revisions" (
    "message_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" "chat_revision_kind" NOT NULL,
    "text" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_message_revisions_pkey" PRIMARY KEY ("message_id", "revision"),
    CONSTRAINT "chat_message_revisions_shape_check" CHECK (
        "revision" > 0
        AND (("kind" IN ('CREATED', 'EDITED') AND "text" IS NOT NULL
                AND char_length(btrim("text")) BETWEEN 1 AND 2000 AND "text" !~ '[[:cntrl:]]')
            OR ("kind" = 'DELETED' AND "text" IS NULL))
    ),
    CONSTRAINT "chat_message_revisions_message_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "chat_message_revisions_creator_fkey" FOREIGN KEY ("created_by") REFERENCES "identity_users"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "chat_message_reports" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "message_revision" INTEGER NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "chat_report_reason" NOT NULL,
    "operation_id" UUID NOT NULL,
    "evidence_ciphertext" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "retention_expires_at" TIMESTAMPTZ(3),
    CONSTRAINT "chat_message_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_message_reports_operation_key" UNIQUE ("reporter_id", "operation_id"),
    CONSTRAINT "chat_message_reports_target_key" UNIQUE ("reporter_id", "message_id", "message_revision"),
    CONSTRAINT "chat_message_reports_revision_fkey" FOREIGN KEY ("message_id", "message_revision")
        REFERENCES "chat_message_revisions"("message_id", "revision") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "chat_message_reports_reporter_fkey" FOREIGN KEY ("reporter_id") REFERENCES "identity_users"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "communication_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "communication_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_user_id"),
    CONSTRAINT "communication_blocks_distinct_check" CHECK ("blocker_id" <> "blocked_user_id"),
    CONSTRAINT "communication_blocks_blocker_fkey" FOREIGN KEY ("blocker_id") REFERENCES "identity_users"("id")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "communication_blocks_blocked_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "identity_users"("id")
        ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "locale" VARCHAR(35) NOT NULL DEFAULT 'ru',
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
    "tzdata_version" VARCHAR(32) NOT NULL,
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "quiet_hours_start" TIME NOT NULL DEFAULT TIME '22:00',
    "quiet_hours_end" TIME NOT NULL DEFAULT TIME '08:00',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "notification_preferences_version_check" CHECK ("version" >= 0),
    CONSTRAINT "notification_preferences_user_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id")
        ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE "notification_preference_channels" (
    "user_id" UUID NOT NULL,
    "category" "notification_category" NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_preference_channels_pkey" PRIMARY KEY ("user_id", "category", "channel"),
    CONSTRAINT "notification_preference_channels_in_app_check" CHECK ("channel" <> 'IN_APP' OR "enabled"),
    CONSTRAINT "notification_preference_channels_preference_fkey" FOREIGN KEY ("user_id")
        REFERENCES "notification_preferences"("user_id") ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "source_event_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "category" "notification_category" NOT NULL,
    "route" VARCHAR(64) NOT NULL,
    "group_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days'),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_logical_key" UNIQUE ("recipient_id", "source_event_id", "type"),
    CONSTRAINT "notifications_type_check" CHECK ("type" IN (
        'ROSTER_CHANGED', 'JOIN_REQUESTED', 'JOIN_REQUEST_RESOLVED', 'WAITLIST_CHANGED', 'MATCH_CANCELLED',
        'MATCH_CHANGED', 'MATCH_REMINDER', 'RESULT_ACTION_REQUIRED', 'RESULT_CONFIRMED', 'RESULT_DISPUTED',
        'CHAT_MESSAGE'
    )),
    CONSTRAINT "notifications_route_check" CHECK (
        "route" ~ '^[A-Za-z][A-Za-z0-9_./-]{0,63}$' AND "route" !~ '[?#]'
    ),
    CONSTRAINT "notifications_time_check" CHECK (
        ("read_at" IS NULL OR "read_at" >= "created_at") AND "expires_at" > "created_at"
    ),
    CONSTRAINT "notifications_recipient_fkey" FOREIGN KEY ("recipient_id") REFERENCES "identity_users"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "notifications_inbox_idx" ON "notifications"("recipient_id", "created_at" DESC, "id" DESC);
CREATE INDEX "notifications_expiry_idx" ON "notifications"("expires_at");

CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "status" "notification_delivery_status" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" UUID NOT NULL,
    "not_before" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider_code" VARCHAR(32),
    "provider_message_key" CHAR(64),
    "last_error_code" VARCHAR(96),
    "claimed_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "terminal_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_deliveries_logical_key" UNIQUE ("notification_id", "channel"),
    CONSTRAINT "notification_deliveries_idempotency_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "notification_deliveries_external_only_check" CHECK ("channel" IN ('TELEGRAM', 'EMAIL')),
    CONSTRAINT "notification_deliveries_attempts_check" CHECK ("attempts" BETWEEN 0 AND 12),
    CONSTRAINT "notification_deliveries_time_check" CHECK ("expires_at" > "not_before"),
    CONSTRAINT "notification_deliveries_notification_fkey" FOREIGN KEY ("notification_id")
        REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX "notification_deliveries_dispatch_idx"
    ON "notification_deliveries"("status", "not_before", "id") WHERE "status" IN ('PENDING', 'DEFERRED');
CREATE INDEX "notification_deliveries_expiry_idx" ON "notification_deliveries"("expires_at");

CREATE TABLE "notification_devices" (
    "installation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "communication_platform" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "notification_devices_pkey" PRIMARY KEY ("installation_id"),
    CONSTRAINT "notification_devices_time_check" CHECK (
        "last_seen_at" >= "created_at" AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    ),
    CONSTRAINT "notification_devices_user_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id")
        ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX "notification_devices_user_idx" ON "notification_devices"("user_id", "revoked_at");

CREATE TABLE "communication_event_receipts" (
    "consumer_key" VARCHAR(80) NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "communication_event_receipts_pkey" PRIMARY KEY ("consumer_key", "event_id")
);

CREATE TABLE "communication_idempotency_records" (
    "id" UUID NOT NULL,
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
    CONSTRAINT "communication_idempotency_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "communication_idempotency_scope_key" UNIQUE ("user_id", "method", "canonical_path", "idempotency_key"),
    CONSTRAINT "communication_idempotency_expiry_check" CHECK ("expires_at" = "created_at" + INTERVAL '24 hours'),
    CONSTRAINT "communication_idempotency_user_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id")
        ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX "communication_idempotency_expiry_idx" ON "communication_idempotency_records"("expires_at");

CREATE FUNCTION "chat_allocate_sequence"() RETURNS TRIGGER AS $$
DECLARE
    allocated BIGINT;
BEGIN
    UPDATE "conversations"
       SET "latest_sequence" = "latest_sequence" + 1,
           "version" = "version" + 1,
           "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = NEW."conversation_id"
     RETURNING "latest_sequence" INTO allocated;
    IF allocated IS NULL THEN
        RAISE EXCEPTION 'conversation not found';
    END IF;
    NEW."sequence" := allocated;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "chat_messages_allocate_sequence"
    BEFORE INSERT ON "chat_messages"
    FOR EACH ROW EXECUTE FUNCTION "chat_allocate_sequence"();

CREATE FUNCTION "conversation_membership_monotonic_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF NEW."last_read_sequence" < OLD."last_read_sequence" THEN
        RAISE EXCEPTION 'last read sequence cannot move backward';
    END IF;
    IF OLD."access_revoked_at" IS NOT NULL AND (
        NEW."access_revoked_at" IS DISTINCT FROM OLD."access_revoked_at"
        OR NEW."access_through_sequence" IS DISTINCT FROM OLD."access_through_sequence"
        OR NEW."read_access_expires_at" IS DISTINCT FROM OLD."read_access_expires_at"
    ) THEN
        RAISE EXCEPTION 'revoked access boundary is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "conversation_memberships_monotonic_guard"
    BEFORE UPDATE ON "conversation_memberships"
    FOR EACH ROW EXECUTE FUNCTION "conversation_membership_monotonic_guard"();

CREATE FUNCTION "chat_revision_immutable_guard"() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'chat message revisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "chat_message_revisions_reject_update"
    BEFORE UPDATE OR DELETE ON "chat_message_revisions"
    FOR EACH ROW EXECUTE FUNCTION "chat_revision_immutable_guard"();

CREATE FUNCTION "notification_read_once_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD."read_at" IS NOT NULL AND NEW."read_at" IS DISTINCT FROM OLD."read_at" THEN
        RAISE EXCEPTION 'notification read timestamp is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notifications_read_once_guard"
    BEFORE UPDATE OF "read_at" ON "notifications"
    FOR EACH ROW EXECUTE FUNCTION "notification_read_once_guard"();

CREATE FUNCTION "chat_message_current_revision_guard"() RETURNS TRIGGER AS $$
DECLARE
    revision_kind "chat_revision_kind";
BEGIN
    SELECT "kind" INTO revision_kind
      FROM "chat_message_revisions"
     WHERE "message_id" = NEW."id" AND "revision" = NEW."current_revision";
    IF revision_kind IS NULL THEN
        RAISE EXCEPTION 'message current revision is missing';
    END IF;
    IF (NEW."deleted_at" IS NULL) <> (revision_kind <> 'DELETED') THEN
        RAISE EXCEPTION 'message tombstone state does not match current revision';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "chat_messages_current_revision_guard"
    AFTER INSERT OR UPDATE ON "chat_messages"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "chat_message_current_revision_guard"();
