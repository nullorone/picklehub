-- Publish the immutable launch configuration and two adjacent 84-day seasons. Further seasons are an explicit
-- operational publication, never an implicit request-time mutation.
INSERT INTO "game_configurations" (
    "id", "version", "mode", "active_duration_milliseconds", "turn_count", "pause_resume_ttl_seconds",
    "definition_snapshot", "snapshot_hash", "published_at"
) VALUES
    (
        '0182f100-0000-7000-8000-000000000001', '1.0.0', 'STANDARD', 90000, NULL, 600,
        '{"directions":["LEFT","CENTER","RIGHT"],"score":{"successfulReturn":10,"targetDirection":5,"streakLength":5,"streakBonus":10}}',
        repeat('5', 64), '2026-09-16T00:00:00Z'
    ),
    (
        '0182f100-0000-7000-8000-000000000002', '1.0.0', 'CALM', NULL, 20, 600,
        '{"directions":["LEFT","CENTER","RIGHT"],"score":{"successfulReturn":10,"targetDirection":5,"streakLength":5,"streakBonus":10}}',
        repeat('6', 64), '2026-09-16T00:00:00Z'
    );

INSERT INTO "game_seasons" (
    "id", "version", "configuration_version", "starts_at", "ends_at", "goal_snapshot",
    "cosmetic_snapshot", "definition_snapshot_hash"
) VALUES
    (
        '0182f100-0000-7000-8000-000000000010', '1.0.0', '1.0.0',
        '2026-09-16T00:00:00Z', '2026-12-09T00:00:00Z',
        '[{"code":"DAILY_WARM_UP","target":1},{"code":"DAILY_ACCURACY","target":12},{"code":"DAILY_DIRECTIONS","target":2}]',
        '[{"code":"SEASON_CARD_BACKGROUND","distinctDays":5},{"code":"BALL_COLOR","practiceMarks":30},{"code":"BALL_TRAIL","distinctDays":20},{"code":"GAME_PROFILE_FRAME","practiceMarks":60}]',
        repeat('7', 64)
    ),
    (
        '0182f100-0000-7000-8000-000000000011', '1.1.0', '1.0.0',
        '2026-12-09T00:00:00Z', '2027-03-03T00:00:00Z',
        '[{"code":"DAILY_WARM_UP","target":1},{"code":"DAILY_ACCURACY","target":12},{"code":"DAILY_DIRECTIONS","target":2}]',
        '[{"code":"SEASON_CARD_BACKGROUND","distinctDays":5},{"code":"BALL_COLOR","practiceMarks":30},{"code":"BALL_TRAIL","distinctDays":20},{"code":"GAME_PROFILE_FRAME","practiceMarks":60}]',
        repeat('8', 64)
    );
