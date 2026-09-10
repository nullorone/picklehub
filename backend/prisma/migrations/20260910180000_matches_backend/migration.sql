CREATE TABLE "match_statistics_receipts" (
    "consumer_key" VARCHAR(80) NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_statistics_receipts_pkey" PRIMARY KEY ("consumer_key", "event_id"),
    CONSTRAINT "match_statistics_receipts_event_id_fkey" FOREIGN KEY ("event_id")
        REFERENCES "outbox_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "player_match_statistics" (
    "user_id" UUID NOT NULL,
    "played_count" INTEGER NOT NULL DEFAULT 0,
    "wins_count" INTEGER NOT NULL DEFAULT 0,
    "losses_count" INTEGER NOT NULL DEFAULT 0,
    "last_confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "player_match_statistics_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "player_match_statistics_nonnegative_check" CHECK (
        "played_count" >= 0 AND "wins_count" >= 0 AND "losses_count" >= 0 AND
        "wins_count" + "losses_count" <= "played_count"
    ),
    CONSTRAINT "player_match_statistics_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "identity_users" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "player_match_statistics_confirmed_idx"
    ON "player_match_statistics" ("last_confirmed_at", "user_id");
