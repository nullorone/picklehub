import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
    new URL('../../backend/prisma/migrations/20260911160000_profiles_contract_data/migration.sql', import.meta.url),
    'utf8'
);
const prisma = readFileSync(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('profile migration owns mutable data and rebuildable projections separately', () => {
    for (const table of [
        'player_profiles',
        'external_profile_links',
        'profile_avatar_assets',
        'profile_projection_generations',
        'player_statistic_contributions',
        'player_statistic_aggregates',
        'player_reliability_contributions',
        'player_reliability_aggregates',
        'profile_projection_event_receipts',
        'profile_idempotency_records',
    ]) {
        assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
        assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
    }
});

test('source revisions and receipts make event processing idempotent', () => {
    assert.match(migration, /PRIMARY KEY \("generation_id", "match_id", "player_id"\)/);
    assert.match(migration, /profile_projection_event_receipts_pkey/);
    assert.match(migration, /eligibility revision cannot move backward/);
    assert.match(migration, /same eligibility revision cannot change a contribution/);
    assert.match(migration, /player_reliability_contributions_pkey/);
});

test('shadow generation activation verifies source count and checksum', () => {
    assert.match(migration, /profile_projection_generations_active_key/);
    assert.match(migration, /profile_generation_transition_guard/);
    assert.match(migration, /profile generation count or checksum mismatch/);
    assert.match(migration, /digest\(/);
    assert.match(migration, /SUPERSEDED/);
});

test('aggregate invariants and all-format identity are storage protected', () => {
    assert.match(migration, /"wins" \+ "losses" <= "played"/);
    assert.match(migration, /player_statistic_aggregates_all_slice_guard/);
    assert.match(migration, /ALL statistic slice must equal SINGLES plus DOUBLES/);
    assert.match(migration, /PLAYED_WITHOUT_SCORE/);
    assert.match(migration, /CONFIRMED_NO_SHOW/);
});

test('DUPR and avatar storage avoid public URLs and unbounded signed policies', () => {
    assert.match(migration, /"url_ciphertext" BYTEA NOT NULL/);
    assert.match(migration, /"url_key" CHAR\(64\) NOT NULL/);
    assert.match(migration, /"upload_expires_at" = "created_at" \+ INTERVAL '5 minutes'/);
    assert.match(migration, /profiles\/.*\/avatars\/.*\/original/);
    assert.doesNotMatch(migration, /"(?:dupr_url|public_avatar_url|signed_upload_url)"/i);
});
