import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
    new URL('../../backend/prisma/migrations/20260912170000_tournaments_contract_data/migration.sql', import.meta.url),
    'utf8'
);
const presetSchema = JSON.parse(
    await readFile(new URL('../schemas/tournament-presets.v1.schema.json', import.meta.url), 'utf8')
);
const fixtures = JSON.parse(
    await readFile(new URL('../fixtures/tournament-strategy-examples.v1.json', import.meta.url), 'utf8')
);

test('one shared aggregate family contains every required model', () => {
    for (const model of [
        'Tournament',
        'Entrant',
        'EntrantMember',
        'Stage',
        'Round',
        'TournamentMatch',
        'CourtAssignment',
        'Standing',
        'FormatDefinition',
        'PaymentMark',
    ]) {
        assert.match(schema, new RegExp(`model ${model} \\{`));
    }
    assert.doesNotMatch(schema, /model (Americano|Swiss|Ladder|KingOfCourt)Tournament\s*\{/u);
});

test('preset schema is versioned, closed and covers all eight built-ins', () => {
    assert.equal(presetSchema.$id, 'https://contracts.picklehub.example/schemas/tournament-presets.v1.schema.json');
    assert.equal(presetSchema.oneOf.length, 8);
    assert.deepEqual(Object.keys(presetSchema.$defs).sort(), [
        'americano',
        'doubleElimination',
        'kingOfCourt',
        'ladder',
        'poolPlay',
        'roundRobin',
        'singleElimination',
        'swiss',
    ]);
    assert.match(migration, /CUSTOM_DSL activation is disabled until the final DSL prompt/);
    assert.match(migration, /format_definitions_preset_schema_check/);
    assert.match(migration, /POOL_PLAY pool and playoff parameters are inconsistent/);
    assert.match(migration, /configured rounds exceed entrant opponent bound/);
    assert.match(migration, /format definitions are immutable; create a new semantic version/);
    const registryTable = migration.match(/CREATE TABLE "format_definitions" \([\s\S]*?\n\);/u)?.[0] ?? '';
    assert.match(registryTable, /"schema_id"/);
    assert.match(registryTable, /"schema_hash"/);
    assert.doesNotMatch(registryTable, /"play_mode"|"configuration"/);
    assert.match(migration, /tournament snapshot does not match registered format definition/);
});

test('aggregate versions and database uniqueness protect generation and corrections', () => {
    assert.match(migration, /projection_revision/);
    assert.match(migration, /projection_checksum/);
    assert.match(migration, /tournament_rounds[\s\S]*UNIQUE \("stage_id", "sequence", "generation"\)/u);
    assert.match(migration, /tournament_matches[\s\S]*UNIQUE \("tournament_id", "strategy_key"\)/u);
    assert.match(migration, /tournament_match_slots_source_target_key/);
    assert.match(migration, /tournament graph reference cannot cross aggregate boundary/);
    assert.match(migration, /tournament_matches_round_stage_fk/);
    assert.match(migration, /authoritative result and match revision must be reciprocal/);
    assert.match(migration, /winner-changing correction cannot rewrite a started dependency/);
    assert.match(migration, /tournament_match_results_append_only/);
    assert.match(migration, /tournament_completion_markers_append_only/);
});

test('entrant, FIFO, seed, lot and final standings invariants are database-backed', () => {
    assert.match(migration, /tournament_entrant_members_active_user_key/);
    assert.match(migration, /user cannot have both active entrant membership and partner intent in one tournament/);
    assert.match(migration, /tournament requires exactly one active organizer matching aggregate owner/);
    assert.match(migration, /team entrant requires exactly two distinct confirmed members/);
    assert.match(migration, /tournament_entrants_fifo_key/);
    assert.match(migration, /tournament_entrants_seed_key/);
    assert.match(migration, /tournament_entrants_lot_key/);
    assert.match(migration, /UNIQUE \("tournament_id", "revision", "rank"\)/);
    assert.match(migration, /tournament_completion_markers[\s\S]*"tournament_id" UUID PRIMARY KEY/u);
});

test('payment is manual information and operation replay is encrypted and scoped', () => {
    assert.match(migration, /PENDING_EXTERNAL/);
    assert.match(migration, /MARKED_PAID/);
    assert.match(migration, /REFUND_REPORTED/);
    assert.doesNotMatch(migration, /provider_transaction|card_number|checkout|invoice|receipt_image/u);
    assert.match(migration, /response_ciphertext/);
    assert.match(migration, /UNIQUE \("actor_user_id", "method", "canonical_path", "idempotency_key"\)/);
});

test('golden contract examples cover odd entrants, automatic byes and a resolved tie', () => {
    assert.equal(fixtures.roundRobinOdd.entrantCount, 5);
    assert.equal(fixtures.roundRobinOdd.rounds.length, 5);
    assert(fixtures.roundRobinOdd.rounds.every((round) => round.byeEntrantId));
    assert.equal(fixtures.singleEliminationByes.entrantCount, 6);
    assert.deepEqual(fixtures.singleEliminationByes.automaticByeSeeds, [1, 2]);
    assert.deepEqual(fixtures.resolvedTie.finalOrder, ['entrant-b', 'entrant-a']);
    assert.equal(fixtures.resolvedTie.decidingCriterion, 'tieBreakLot');
});
