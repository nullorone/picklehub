import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
    new URL('../../backend/prisma/migrations/20260913090000_gamification_contract_data/migration.sql', import.meta.url),
    'utf8'
);

test('required gamification records and independent scopes are explicit', () => {
    for (const model of [
        'XpLedgerEntry',
        'LevelDefinition',
        'AchievementDefinition',
        'AchievementAward',
        'LeaderboardSeason',
        'LeaderboardEntry',
        'ProcessedGamificationEvent',
    ]) {
        assert.match(schema, new RegExp(`model ${model} \\{`));
    }
    assert.match(migration, /xp_ledger_entries_scope_check/);
    assert.match(migration, /xp_balances_global_owner_key/);
    assert.match(migration, /xp_balances_club_owner_key/);
});

test('source event and receipt uniqueness make replay idempotent', () => {
    assert.match(migration, /xp_ledger_entries_global_source_key/);
    assert.match(migration, /xp_ledger_entries_club_source_key/);
    assert.match(migration, /UNIQUE \("event_type", "source_event_id", "source_revision"\)/);
    assert.match(migration, /"message_id" UUID PRIMARY KEY/);
    assert.match(migration, /UNIQUE \("actor_user_id", "method", "canonical_path", "idempotency_key"\)/);
    assert.match(migration, /"response_ciphertext" BYTEA NOT NULL/);
});

test('ledger and historical definitions are append-only compensation chains', () => {
    assert.match(migration, /xp_ledger_entries_append_only/);
    assert.match(migration, /xp_rule_definitions_immutable/);
    assert.match(migration, /compensation must preserve owner, scope and original amount/);
    assert.match(migration, /reversal must compensate a posted award/);
    assert.match(migration, /reinstatement must compensate a reversal/);
    assert.match(migration, /ledger entry does not match historical rule snapshot/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /award beyond its UTC source-time cap must be terminal CAPPED with zero XP/);
});

test('safe templates, levels and GLOBAL_V1 values are database-backed', () => {
    assert.match(migration, /coefficient_tenths" BETWEEN 5 AND 20/);
    assert.match(migration, /daily_event_cap" BETWEEN 1 AND 3/);
    assert.match(migration, /weekly_event_cap[\s\S]*10/u);
    assert.match(migration, /level thresholds must strictly increase with ordinal/);
    assert.match(migration, /'CONFIRMED_PLAY', '1\.0\.0', TRUE, 100, 10, 3, 10/);
    assert.match(migration, /'CONFIRMED_MATCH_ORGANIZED', '1\.0\.0', TRUE, 40, 10, 3, 10/);
    assert.match(migration, /'ELIGIBLE_STRUCTURED_REVIEW', '1\.0\.0', TRUE, 15, 10, 3, 10/);
    assert.doesNotMatch(migration, /WIN|PAYMENT|LOGIN|STREAK|ADVERTISEMENT|DUPR/);
});

test('seasons cannot overlap and leaderboard rows require current explicit opt-in', () => {
    assert.match(migration, /leaderboard_seasons_no_overlap/);
    assert.match(migration, /season scope, interval and rule snapshot are immutable/);
    assert.match(migration, /INTERVAL '28 days'/);
    assert.match(migration, /INTERVAL '366 days'/);
    assert.match(migration, /leaderboard entry requires explicit current opt-in/);
    assert.match(migration, /leaderboard entry consent revision is stale/);
    assert.match(migration, /closed season rejects new leaderboard opt-in/);
    assert.match(migration, /leaderboard must use shared competition rank based only on seasonal net XP/);
});
