-- A player who organized and played one match may receive both allowlisted sources. The source kind is part of
-- the logical award key; scope isolation and compensation kind remain unchanged.
DROP INDEX "xp_ledger_entries_global_source_key";
DROP INDEX "xp_ledger_entries_club_source_key";
CREATE UNIQUE INDEX "xp_ledger_entries_global_source_key" ON "xp_ledger_entries"
    ("user_id", "source_kind", "source_event_id", "rule_version", "kind") WHERE "scope_kind" = 'GLOBAL';
CREATE UNIQUE INDEX "xp_ledger_entries_club_source_key" ON "xp_ledger_entries"
    ("club_id", "user_id", "source_kind", "source_event_id", "rule_version", "kind") WHERE "scope_kind" = 'CLUB';

-- Achievement catalogues are immutable and shared by all scopes. Awards remain owner/scope-specific.
INSERT INTO "achievement_definitions"
    ("id", "scope_kind", "code", "version", "source_kind", "threshold_count", "title", "description")
VALUES
    ('0182a000-0000-7000-8100-000000000001', 'GLOBAL', 'PLAY_1', '1.0.0', 'CONFIRMED_PLAY', 1, 'Первая игра', 'Одна подтверждённая состоявшаяся игра.'),
    ('0182a000-0000-7000-8100-000000000002', 'GLOBAL', 'PLAY_5', '1.0.0', 'CONFIRMED_PLAY', 5, 'Пять игр', 'Пять подтверждённых состоявшихся игр.'),
    ('0182a000-0000-7000-8100-000000000003', 'GLOBAL', 'PLAY_10', '1.0.0', 'CONFIRMED_PLAY', 10, 'Десять игр', 'Десять подтверждённых состоявшихся игр.'),
    ('0182a000-0000-7000-8100-000000000004', 'GLOBAL', 'PLAY_25', '1.0.0', 'CONFIRMED_PLAY', 25, 'Двадцать пять игр', 'Двадцать пять подтверждённых состоявшихся игр.'),
    ('0182a000-0000-7000-8100-000000000005', 'GLOBAL', 'PLAY_50', '1.0.0', 'CONFIRMED_PLAY', 50, 'Пятьдесят игр', 'Пятьдесят подтверждённых состоявшихся игр.'),
    ('0182a000-0000-7000-8100-000000000006', 'GLOBAL', 'PLAY_100', '1.0.0', 'CONFIRMED_PLAY', 100, 'Сто игр', 'Сто подтверждённых состоявшихся игр.'),
    ('0182a000-0000-7000-8100-000000000011', 'GLOBAL', 'ORGANIZE_1', '1.0.0', 'CONFIRMED_MATCH_ORGANIZED', 1, 'Первая организация', 'Одна доведённая до подтверждения встреча.'),
    ('0182a000-0000-7000-8100-000000000012', 'GLOBAL', 'ORGANIZE_5', '1.0.0', 'CONFIRMED_MATCH_ORGANIZED', 5, 'Пять организаций', 'Пять доведённых до подтверждения встреч.'),
    ('0182a000-0000-7000-8100-000000000013', 'GLOBAL', 'ORGANIZE_10', '1.0.0', 'CONFIRMED_MATCH_ORGANIZED', 10, 'Десять организаций', 'Десять доведённых до подтверждения встреч.'),
    ('0182a000-0000-7000-8100-000000000014', 'GLOBAL', 'ORGANIZE_25', '1.0.0', 'CONFIRMED_MATCH_ORGANIZED', 25, 'Двадцать пять организаций', 'Двадцать пять доведённых до подтверждения встреч.'),
    ('0182a000-0000-7000-8100-000000000021', 'GLOBAL', 'REVIEW_1', '1.0.0', 'ELIGIBLE_STRUCTURED_REVIEW', 1, 'Первый отзыв', 'Один допустимый структурированный отзыв.'),
    ('0182a000-0000-7000-8100-000000000022', 'GLOBAL', 'REVIEW_5', '1.0.0', 'ELIGIBLE_STRUCTURED_REVIEW', 5, 'Пять отзывов', 'Пять допустимых структурированных отзывов.'),
    ('0182a000-0000-7000-8100-000000000023', 'GLOBAL', 'REVIEW_10', '1.0.0', 'ELIGIBLE_STRUCTURED_REVIEW', 10, 'Десять отзывов', 'Десять допустимых структурированных отзывов.'),
    ('0182a000-0000-7000-8100-000000000024', 'GLOBAL', 'REVIEW_25', '1.0.0', 'ELIGIBLE_STRUCTURED_REVIEW', 25, 'Двадцать пять отзывов', 'Двадцать пять допустимых структурированных отзывов.'),
    ('0182a000-0000-7000-8200-000000000001', 'CLUB', 'PLAY_1', '1.0.0', 'CONFIRMED_PLAY', 1, 'Первая клубная игра', 'Одна подтверждённая игра в клубе.'),
    ('0182a000-0000-7000-8200-000000000002', 'CLUB', 'PLAY_5', '1.0.0', 'CONFIRMED_PLAY', 5, 'Пять клубных игр', 'Пять подтверждённых игр в клубе.'),
    ('0182a000-0000-7000-8200-000000000003', 'CLUB', 'PLAY_10', '1.0.0', 'CONFIRMED_PLAY', 10, 'Десять клубных игр', 'Десять подтверждённых игр в клубе.'),
    ('0182a000-0000-7000-8200-000000000004', 'CLUB', 'PLAY_25', '1.0.0', 'CONFIRMED_PLAY', 25, 'Двадцать пять клубных игр', 'Двадцать пять подтверждённых игр в клубе.'),
    ('0182a000-0000-7000-8200-000000000005', 'CLUB', 'PLAY_50', '1.0.0', 'CONFIRMED_PLAY', 50, 'Пятьдесят клубных игр', 'Пятьдесят подтверждённых игр в клубе.'),
    ('0182a000-0000-7000-8200-000000000006', 'CLUB', 'PLAY_100', '1.0.0', 'CONFIRMED_PLAY', 100, 'Сто клубных игр', 'Сто подтверждённых игр в клубе.'),
    ('0182a000-0000-7000-8200-000000000011', 'CLUB', 'ORGANIZE_1', '1.0.0', 'CONFIRMED_MATCH_ORGANIZED', 1, 'Первая клубная организация', 'Одна подтверждённая клубная встреча.'),
    ('0182a000-0000-7000-8200-000000000012', 'CLUB', 'ORGANIZE_5', '1.0.0', 'CONFIRMED_MATCH_ORGANIZED', 5, 'Пять клубных организаций', 'Пять подтверждённых клубных встреч.'),
    ('0182a000-0000-7000-8200-000000000013', 'CLUB', 'ORGANIZE_10', '1.0.0', 'CONFIRMED_MATCH_ORGANIZED', 10, 'Десять клубных организаций', 'Десять подтверждённых клубных встреч.'),
    ('0182a000-0000-7000-8200-000000000014', 'CLUB', 'ORGANIZE_25', '1.0.0', 'CONFIRMED_MATCH_ORGANIZED', 25, 'Двадцать пять клубных организаций', 'Двадцать пять подтверждённых клубных встреч.'),
    ('0182a000-0000-7000-8200-000000000021', 'CLUB', 'REVIEW_1', '1.0.0', 'ELIGIBLE_STRUCTURED_REVIEW', 1, 'Первый клубный отзыв', 'Один допустимый клубный отзыв.'),
    ('0182a000-0000-7000-8200-000000000022', 'CLUB', 'REVIEW_5', '1.0.0', 'ELIGIBLE_STRUCTURED_REVIEW', 5, 'Пять клубных отзывов', 'Пять допустимых клубных отзывов.'),
    ('0182a000-0000-7000-8200-000000000023', 'CLUB', 'REVIEW_10', '1.0.0', 'ELIGIBLE_STRUCTURED_REVIEW', 10, 'Десять клубных отзывов', 'Десять допустимых клубных отзывов.'),
    ('0182a000-0000-7000-8200-000000000024', 'CLUB', 'REVIEW_25', '1.0.0', 'ELIGIBLE_STRUCTURED_REVIEW', 25, 'Двадцать пять клубных отзывов', 'Двадцать пять допустимых клубных отзывов.');
