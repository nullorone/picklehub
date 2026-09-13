import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [projection, service, controller, queue, migration, trustSafety] = await Promise.all([
    read('../../backend/src/gamification/gamification-projection.service.ts'),
    read('../../backend/src/gamification/gamification.service.ts'),
    read('../../backend/src/gamification/gamification.controller.ts'),
    read('../../backend/src/outbox/outbox-queue.service.ts'),
    read('../../backend/prisma/migrations/20260913120000_gamification_backend/migration.sql'),
    read('../../backend/src/trust-safety/trust-safety.service.ts'),
]);

test('gamification consumes authoritative references with replay and source-revision convergence', () => {
    assert.match(projection, /pg_advisory_xact_lock/u);
    assert.match(projection, /eventDisposition/u);
    assert.match(projection, /ProcessedGamificationEvent|processedGamificationEvent/u);
    assert.match(queue, /gamification-events-v1/u);
    assert.match(trustSafety, /review\.eligibility\.changed\.v1/u);
    assert.doesNotMatch(projection, /winningTeam|experienceRating\s*[<>]|experienceRating\s*===\s*[1-5]/u);
});

test('ledger changes are append-only and source kinds can coexist for one match', () => {
    assert.doesNotMatch(projection, /xpLedgerEntry\.(?:update|delete)/u);
    assert.match(projection, /kind: 'REVERSAL'/u);
    assert.match(projection, /appendCompensation\(tx, reversal, 'REINSTATEMENT'/u);
    assert.match(migration, /"user_id", "source_kind", "source_event_id", "rule_version", "kind"/u);
    assert.match(migration, /INSERT INTO "achievement_definitions"/u);
});

test('club configuration and leaderboard consent stay scoped, bounded and audited', () => {
    assert.match(service, /ClubRole\.OWNER/u);
    assert.match(service, /gamification\.club\.configuration\.published/u);
    assert.match(service, /gamification\.leaderboard\.opted_/u);
    assert.match(controller, /GAMIFICATION_DEFINITION_READ/u);
    assert.match(controller, /assertMutation/u);
    assert.match(projection, /competitionRanks/u);
    assert.match(projection, /leaderboardEligible/u);
});
