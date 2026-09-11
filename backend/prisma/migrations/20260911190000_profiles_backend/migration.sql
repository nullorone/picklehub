ALTER TABLE "profile_projection_generations"
    ADD COLUMN "checkpoint_match_id" UUID;

COMMENT ON COLUMN "profile_projection_generations"."checkpoint_match_id" IS
    'Last match id fully projected by the restartable snapshot scan; contains no player profile fields.';
