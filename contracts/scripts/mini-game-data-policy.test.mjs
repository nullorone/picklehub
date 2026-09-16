import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
    new URL('../../backend/prisma/migrations/20260916130000_mini_game_contract_data/migration.sql', import.meta.url),
    'utf8'
);

test('mini-game owns explicit session, result, reward, cosmetic, task and nonce records', () => {
    for (const model of [
        'GameConfiguration',
        'GameSeason',
        'GameSession',
        'GameLaunchCapability',
        'GameResult',
        'RewardGrant',
        'CosmeticUnlock',
        'ProcessedGameTask',
        'ProcessedGameNonce',
    ]) {
        assert.match(schema, new RegExp(`model ${model} \\{`));
    }
    assert.match(migration, /game_configurations_mode_shape_check/);
    assert.match(migration, /game_seasons_exact_window_check/);
    assert.match(migration, /game_seasons_no_overlap/);
    assert.match(migration, /INTERVAL '60 seconds'/);
    assert.match(migration, /WebView launch capability permits one unexpired consumption only/);
});

test('challenge, task, nonce and response replay are database-backed', () => {
    assert.match(migration, /game_sessions_challenge_key|"challenge_hash" CHAR\(64\) NOT NULL UNIQUE/);
    assert.match(migration, /"task_id" UUID PRIMARY KEY/);
    assert.match(migration, /"nonce_hash" CHAR\(64\) PRIMARY KEY/);
    assert.match(migration, /game_results_session_key|"session_id" UUID NOT NULL UNIQUE/);
    assert.match(migration, /terminal session, receipt, processed task and nonce must commit atomically/);
    assert.match(migration, /mini_game_operation_receipts[\s\S]*response_ciphertext/u);
});

test('strict TTL and daily issue/result limits are serialized', () => {
    assert.match(migration, /INTERVAL '15 minutes'/);
    assert.match(migration, /INTERVAL '24 hours'/);
    assert.match(migration, /INTERVAL '114 days'/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /issued_count >= 20/);
    assert.match(migration, /daily_count >= 10/);
});

test('impossible results and tampered configuration are rejected without trusting score', () => {
    assert.match(migration, /game_results_counter_bounds_check/);
    assert.match(migration, /game_results_mode_bounds_check/);
    assert.match(migration, /result does not match challenge ownership, task, mode or configuration/);
    assert.match(migration, /game challenge expired/);
    const table = migration.match(/CREATE TABLE "game_results" \([\s\S]*?\n\);/u)?.[0] ?? '';
    assert.doesNotMatch(table, /"score"|pointer|keystroke|fingerprint|device|coordinate|latitude|longitude/iu);
});

test('reward and cosmetic histories are append-only compensation chains', () => {
    assert.match(migration, /reward_grants_append_only/);
    assert.match(migration, /reward_grants_one_reversal_key/);
    assert.match(migration, /reward_grants_one_reinstatement_key/);
    assert.match(migration, /reward reversal must compensate a granted entry/);
    assert.match(migration, /reward reinstatement must compensate a reversal/);
    assert.match(
        migration,
        /reward compensation must preserve receipt, owner, season, kind, item, semantic key, window and amount/
    );
    assert.match(migration, /"goal_code" IS DISTINCT FROM NEW\."goal_code"/);
    assert.match(migration, /"cosmetic_code" IS DISTINCT FROM NEW\."cosmetic_code"/);
    assert.match(migration, /cosmetic reinstatement must supersede revoke/);
});

test('mini-game XP is global-only and capped at 10 daily, 50 weekly and 300 per season', () => {
    assert.match(schema, /MINI_GAME_DAILY_COMPLETION/);
    assert.match(migration, /'GLOBAL'.*'MINI_GAME_DAILY_COMPLETION'.*'2\.0\.0'.*10, 10, 1, 5/su);
    assert.match(migration, /daily_count >= 1 OR weekly_count >= 5 OR season_count >= 30/);
    assert.match(migration, /mini-game XP daily, UTC-week or 84-day season cap reached/);
    assert.doesNotMatch(migration, /'CLUB'.*'MINI_GAME_DAILY_COMPLETION'/u);
});
