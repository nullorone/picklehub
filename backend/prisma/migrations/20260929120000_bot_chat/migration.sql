ALTER TABLE "telegram_identities"
    ADD COLUMN "private_chat_id" BIGINT,
    ADD COLUMN "can_message" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "bot_started_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "telegram_identities_private_chat_id_key"
    ON "telegram_identities"("private_chat_id");
