import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
    new URL('../../backend/prisma/migrations/20260912120000_clubs_contract_data/migration.sql', import.meta.url),
    'utf8'
);
const prisma = readFileSync(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('club migration owns shared-schema aggregate records without requiring a venue', () => {
    for (const table of [
        'clubs',
        'club_memberships',
        'club_join_requests',
        'club_invitations',
        'club_blocks',
        'club_venues',
        'recurring_match_rules',
        'recurring_match_occurrences',
        'club_operation_receipts',
        'club_governance_audits',
    ]) {
        assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
        assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
    }
    assert.doesNotMatch(migration.match(/CREATE TABLE "clubs" \([\s\S]*?\n\);/u)?.[0] ?? '', /venue_id/u);
});

test('active membership and exactly one owner are database invariants', () => {
    assert.match(migration, /club_memberships_active_user_key/);
    assert.match(migration, /club_memberships_active_owner_key/);
    assert.match(migration, /club_assert_exactly_one_owner/);
    assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
    assert.match(migration, /club must have exactly one active owner/);
});

test('terminal intents, blocks and sensitive operation replay are storage protected', () => {
    assert.match(migration, /club_join_requests_pending_key/);
    assert.match(migration, /club_invitations_pending_key/);
    assert.match(migration, /club intent may transition from pending exactly once/);
    assert.match(migration, /club_blocks_active_key/);
    assert.match(migration, /"token_hash" CHAR\(64\) NOT NULL UNIQUE/);
    assert.match(migration, /"response_ciphertext" BYTEA NOT NULL/);
    assert.doesNotMatch(migration, /"(?:raw_token|invitation_token|response_body)"/iu);
});

test('recurring positions are UTC deterministic and idempotent across DST', () => {
    assert.match(migration, /recurring_match_occurrences_calendar_key/);
    assert.match(migration, /club_resolve_local_instant/);
    assert.match(migration, /EARLIER_OFFSET/);
    assert.match(migration, /LATER_OFFSET/);
    assert.match(migration, /SKIPPED_DST_GAP/);
    assert.match(migration, /occurrence UTC instant does not match explicit timezone and DST overlap policy/);
    assert.match(migration, /generation_horizon_days" = 42/);
    assert.match(migration, /resumed rules cannot backfill/);
    assert.match(migration, /club_weekdays_are_unique/);
    assert.match(migration, /recognized IANA timezone/);
    assert.match(migration, /matches_recurring_occurrence_key/);
});

test('archived clubs and active club blocks reject new scoped activity', () => {
    assert.match(migration, /archived club rejects new membership intent/);
    assert.match(migration, /club block rejects membership intent/);
    assert.match(migration, /archived club rejects venue links/);
    assert.match(migration, /archived club cannot materialize recurring matches/);
});

test('club attribution is reciprocal, immutable after publication and never owns match roster', () => {
    assert.match(migration, /matches_club_source_shape_check/);
    assert.match(migration, /recurring match and occurrence source must be reciprocal/);
    assert.match(migration, /materialized occurrence and match source must be reciprocal/);
    assert.match(migration, /published club attribution is immutable/);
    assert.doesNotMatch(
        migration.match(/CREATE TABLE "recurring_match_rules" \([\s\S]*?\n\);/u)?.[0] ?? '',
        /roster|participant/u
    );
});
