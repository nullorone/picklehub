ALTER TABLE "games"
    DROP CONSTRAINT "games_participant_limit_check",
    ADD CONSTRAINT "games_participant_limit_check" CHECK ("participant_limit" BETWEEN 2 AND 96);
