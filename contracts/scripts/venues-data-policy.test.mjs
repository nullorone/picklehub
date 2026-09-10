import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
    new URL('../../backend/prisma/migrations/20260910090000_venues_contract_data/migration.sql', import.meta.url),
    'utf8'
);
const prisma = readFileSync(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('venue migration creates the owned catalogue and contribution records', () => {
    for (const table of [
        'venues',
        'venue_sources',
        'venue_candidates',
        'venue_revisions',
        'venue_reports',
        'venue_moderation_decisions',
        'venue_merges',
        'venue_idempotency_records',
    ]) {
        assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
        assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
    }
});

test('venue points have bounded precision and indexed PostGIS search', () => {
    assert.match(migration, /geography\(Point, 4326\)/);
    assert.match(migration, /venues_coordinate_precision_check/);
    assert.match(migration, /venue_candidates_coordinate_precision_check/);
    assert.match(migration, /CREATE INDEX "venues_location_gist_idx" ON "venues" USING GIST \("location"\)/);
    assert.match(migration, /CREATE INDEX "venue_candidates_location_gist_idx"/);
    assert.match(migration, /ST_DWithin\(v\.location, origin\.point, search_radius_metres\)/);
    assert.match(migration, /ST_Intersects\(v\.location, bounds\)/);
});

test('provenance is storage-gated, uniquely scoped and append-only', () => {
    assert.match(migration, /venue_sources_owner_check/);
    assert.match(migration, /"storage_allowed" AND cardinality\("allowed_fields"\)/);
    assert.match(migration, /venue_sources_canonical_external_key/);
    assert.match(migration, /venue_sources_reject_update/);
    assert.match(migration, /venue_sources_reject_delete/);
    assert.doesNotMatch(migration, /"(?:raw_provider_payload|raw_query|search_origin)"/i);
});

test('candidate qualification and moderation decisions are race-safe in storage', () => {
    assert.match(migration, /venue_candidates_source_match_key/);
    assert.match(migration, /venue_candidates_protect_transition/);
    assert.match(migration, /venue_decisions_candidate_key/);
    assert.match(migration, /venue_decisions_revision_key/);
    assert.match(migration, /venue_decisions_report_key/);
    assert.match(migration, /venue_decisions_reject_update/);
    assert.match(migration, /venue_merges_reject_update/);
});

test('merge aliases preserve existing match references and resolve directly to a survivor', () => {
    assert.match(migration, /FOREIGN KEY \("canonical_venue_id"\) REFERENCES "venues" \("id"\) ON DELETE RESTRICT/);
    assert.match(migration, /CREATE FUNCTION resolve_canonical_venue_id/);
    assert.match(migration, /CREATE TRIGGER venues_reject_delete/);
    assert.match(migration, /merged venue must point directly to a published survivor/);
});

test('private idempotency responses are encrypted and expire after 24 hours', () => {
    assert.match(migration, /"response_ciphertext" BYTEA NOT NULL/);
    assert.match(migration, /"expires_at" = "created_at" \+ INTERVAL '24 hours'/);
    assert.match(migration, /venue_idempotency_scope_key/);
    assert.doesNotMatch(migration, /"response_body"/);
});
