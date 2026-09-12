import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const policy = readFileSync(new URL('../../backend/src/clubs/club.policy.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../backend/src/clubs/club.service.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../../backend/src/clubs/club.controller.ts', import.meta.url), 'utf8');
const generator = readFileSync(
    new URL('../../backend/src/clubs/recurring-match-generator.service.ts', import.meta.url),
    'utf8'
);
const metrics = readFileSync(new URL('../../backend/src/clubs/club-metrics.service.ts', import.meta.url), 'utf8');
const prisma = readFileSync(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
    new URL('../../backend/prisma/migrations/20260912120000_clubs_contract_data/migration.sql', import.meta.url),
    'utf8'
);

test('club authorization is membership and club scoped without platform-role shortcuts', () => {
    assert.match(policy, /where: \{ clubId, userId, state: 'ACTIVE' \}/u);
    assert.match(policy, /\[ClubRole\.OWNER, ClubRole\.ADMIN\]/u);
    assert.match(policy, /\[ClubRole\.OWNER\]/u);
    assert.doesNotMatch(`${policy}\n${service}`, /PlatformRole|SUPERADMIN|MODERATOR|ADS_MANAGER|EDITOR/u);
    assert.match(controller, /this\.clubs\.listMembers\(await this\.user\(authorization\), clubId/u);
    assert.match(controller, /this\.clubs\.listRules\(await this\.user\(authorization\), clubId/u);
});

test('membership, ownership and invitation races have storage and transaction boundaries', () => {
    assert.match(migration, /club_memberships_active_user_key/u);
    assert.match(migration, /club_memberships_active_owner_key/u);
    assert.match(migration, /club_assert_exactly_one_owner/u);
    assert.match(migration, /club_join_requests_pending_key/u);
    assert.match(migration, /club_invitations_pending_key/u);
    assert.match(service, /SELECT id FROM clubs WHERE id = \$\{clubId\}::uuid FOR UPDATE/u);
    assert.match(service, /state: 'SUPERSEDED'/u);
});

test('recurrence is bounded, calendar-key idempotent and explicitly resolves DST', () => {
    assert.match(generator, /generationHorizonDays/u);
    assert.match(generator, /ruleId_calendarKey/u);
    assert.match(generator, /resolveLocalInstant/u);
    assert.match(generator, /SKIPPED_DST_GAP/u);
    assert.match(generator, /SKIPPED_PAUSE/u);
    assert.match(migration, /recurring_match_occurrences_calendar_key/u);
    assert.match(migration, /EARLIER_OFFSET/u);
    assert.match(migration, /LATER_OFFSET/u);
});

test('venue unlink preserves venue and historical match while merge is canonicalized', () => {
    assert.match(service, /tx\.clubVenue\.deleteMany\(\{ where: \{ clubId, venueId \} \}\)/u);
    assert.doesNotMatch(service, /tx\.venue\.delete/u);
    assert.match(migration, /club_venues[\s\S]*ON DELETE RESTRICT/u);
    assert.match(migration, /published club attribution is immutable/u);
});

test('confirmed club metrics derive only from the unique match marker', () => {
    assert.match(metrics, /matchMetricMarker\.findMany/u);
    assert.match(metrics, /metricType: MatchMetricType\.CONFIRMED_MATCH/u);
    assert.match(metrics, /match: \{ clubId \}/u);
    assert.doesNotMatch(metrics, /match\.state/u);
    assert.match(prisma, /match_metric_markers_effective_key/u);
});
