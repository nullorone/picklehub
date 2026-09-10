import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
    new URL('../../backend/prisma/migrations/20260910150000_matches_contract_data/migration.sql', import.meta.url),
    'utf8'
);
const prisma = readFileSync(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('match migration owns every aggregate record', () => {
    for (const table of [
        'matches',
        'match_teams',
        'match_participants',
        'match_guest_slots',
        'join_requests',
        'waitlist_entries',
        'match_invites',
        'match_results',
        'game_scores',
        'result_confirmations',
        'match_metric_markers',
        'match_idempotency_records',
    ]) {
        assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
        assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
    }
});

test('capacity and active involvement serialize on the match row', () => {
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /match_check_capacity_and_involvement/);
    assert.match(migration, /match_teams_shape_guard/);
    assert.match(migration, /match team capacity exceeded/);
    assert.match(migration, /player has more than one active match involvement/);
    assert.match(migration, /match_participants_capacity_guard/);
    assert.match(migration, /match_guests_capacity_guard/);
    assert.match(migration, /join_requests_involvement_guard/);
    assert.match(migration, /waitlist_capacity_guard/);
});

test('FIFO, state transitions and one effective outcome are storage protected', () => {
    assert.match(migration, /waitlist_entries_match_sequence_key/);
    assert.match(migration, /waitlist_entries_active_offer_key/);
    assert.match(migration, /waitlist_entries_fifo_guard/);
    assert.match(migration, /waitlist FIFO order violated/);
    assert.match(migration, /matches_protect_transition/);
    assert.match(migration, /match_results_current_key/);
    assert.match(migration, /match_metric_markers_effective_key/);
    assert.match(migration, /match_metric_markers_reject_update/);
});

test('scores require a completed best-of series and two-point game margins', () => {
    assert.match(migration, /greatest\("team_a_points", "team_b_points"\) >= 11/);
    assert.match(migration, /abs\("team_a_points" - "team_b_points"\) >= 2/);
    assert.match(migration, /BEST_OF_1/);
    assert.match(migration, /BEST_OF_3/);
    assert.match(migration, /BEST_OF_5/);
    assert.match(migration, /invalid completed best-of score series/);
});

test('invite and idempotency storage never contain raw secret or plaintext response', () => {
    assert.match(migration, /"token_hash" CHAR\(64\) NOT NULL/);
    assert.match(migration, /"response_ciphertext" BYTEA NOT NULL/);
    assert.match(migration, /"expires_at" = "created_at" \+ INTERVAL '24 hours'/);
    assert.doesNotMatch(migration, /"(?:raw_token|invite_token|response_body)"/i);
});
