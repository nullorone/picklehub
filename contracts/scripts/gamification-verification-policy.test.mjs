import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [
    openApiSource,
    migrationData,
    migrationBackend,
    projection,
    service,
    controller,
    rebuild,
    webUi,
    webCss,
    tgUi,
    tgCss,
] = await Promise.all([
    read('../../openapi.yaml'),
    read('../../backend/prisma/migrations/20260913090000_gamification_contract_data/migration.sql'),
    read('../../backend/prisma/migrations/20260913120000_gamification_backend/migration.sql'),
    read('../../backend/src/gamification/gamification-projection.service.ts'),
    read('../../backend/src/gamification/gamification.service.ts'),
    read('../../backend/src/gamification/gamification.controller.ts'),
    read('../../backend/src/gamification/run-rebuild.ts'),
    read('../../frontend/web/src/gamification-ui.tsx'),
    read('../../frontend/web/src/styles.css'),
    read('../../frontend/tg/src/gamification-ui.tsx'),
    read('../../frontend/tg/src/styles.css'),
]);
const openApi = parse(openApiSource);

test('award sources are closed and exclude victory, score, guests, complaints and payment', () => {
    assert.match(
        migrationData,
        /CREATE TYPE "xp_source_kind" AS ENUM \('CONFIRMED_PLAY', 'CONFIRMED_MATCH_ORGANIZED', 'ELIGIBLE_STRUCTURED_REVIEW'\)/u
    );
    assert.match(projection, /participants: \{ where: \{ state: 'PLAYED' \}/u);
    assert.match(projection, /matchMetricMarker\.findFirst/u);
    assert.match(projection, /latest\?\.kind !== 'SUBMITTED' \|\| latest\.experienceRating === null/u);
    assert.doesNotMatch(projection, /match\.guests|matchGuestSlot|complaint|payment|winningTeam|score\b/iu);
    assert.doesNotMatch(
        `${migrationData}\n${migrationBackend}`,
        /'VICTORY'|'SCORE'|'COMPLAINT'|'PAYMENT'|'LOGIN'|'STREAK'/u
    );
});

test('at-least-once delivery and append-only compensation have database-enforced identities', () => {
    assert.match(migrationData, /"message_id" UUID PRIMARY KEY/u);
    assert.match(migrationData, /UNIQUE \("event_type", "source_event_id", "source_revision"\)/u);
    assert.match(projection, /eventDisposition/u);
    assert.match(projection, /Prisma\.TransactionIsolationLevel\.Serializable/u);
    assert.match(projection, /pg_advisory_xact_lock/u);
    assert.match(migrationBackend, /"user_id", "source_kind", "source_event_id", "rule_version", "kind"/u);
    assert.match(migrationData, /CREATE TRIGGER "xp_ledger_entries_append_only" BEFORE UPDATE OR DELETE/u);
    assert.match(migrationData, /compensation must preserve owner, scope and original amount/u);
    assert.match(migrationData, /reversal must compensate a posted award/u);
    assert.match(migrationData, /reinstatement must compensate a reversal/u);
    assert.doesNotMatch(projection, /xpLedgerEntry\.(?:update|delete|upsert)/u);
});

test('caps, versions and rebuild use source-backed ledger facts without analytics', () => {
    assert.match(migrationData, /date_trunc\('day', entry\."source_occurred_at", 'UTC'\)/u);
    assert.match(migrationData, /date_trunc\('week', entry\."source_occurred_at", 'UTC'\)/u);
    assert.match(migrationData, /ledger entry does not match historical rule snapshot/u);
    assert.match(projection, /effectiveFrom: \{ lte: award\.occurredAt \}/u);
    assert.match(projection, /sourceOccurredAt: \{ gte: season\.startsAt, lt: season\.endsAt \}/u);
    assert.match(projection, /async rebuildAll\(\)/u);
    assert.match(rebuild, /rebuildAll/u);
    assert.doesNotMatch(rebuild, /analytics|tracking|behavior/iu);
});

test('club lifecycle and management cannot cross a club or global scope boundary', () => {
    assert.match(projection, /scope: \{ kind: 'GLOBAL', clubId: null \}/u);
    assert.match(projection, /scope: \{ kind: 'CLUB', clubId: match\.clubId \}/u);
    assert.match(projection, /joinedAt: \{ lte: marker\.confirmedAt \}/u);
    assert.match(projection, /endedAt: \{ gt: marker\.confirmedAt \}/u);
    assert.match(projection, /freezeClubMember/u);
    assert.match(projection, /leaderboardEntry\.deleteMany/u);
    assert.match(service, /membership\.role !== ClubRole\.OWNER && membership\.role !== ClubRole\.ADMIN/u);
    assert.match(service, /where: \{ scopeKind: 'CLUB', clubId \}/u);
    assert.match(service, /gamification\.club\.configuration\.published/u);
    assert.doesNotMatch(service, /updateMany\(\{[\s\S]{0,160}scopeKind: 'GLOBAL'/u);
});

test('leaderboards require current explicit consent and preserve privacy and shared rank', () => {
    assert.match(migrationData, /leaderboard entry requires explicit current opt-in/u);
    assert.match(migrationData, /leaderboard entry consent revision is stale/u);
    assert.match(migrationData, /closed season rejects new leaderboard opt-in/u);
    assert.match(migrationData, /leaderboard must use shared competition rank based only on seasonal net XP/u);
    assert.match(service, /isHidden \? null : entry\.userId/u);
    assert.match(service, /isHidden \? 'Скрытый игрок' : profile\.displayName/u);
    assert.match(projection, /userRestriction/u);
    assert.match(projection, /clubBlock/u);
    assert.match(controller, /leaderboard-consent/u);
    assert.match(controller, /assertMutation/u);

    const leaderboard = openApi.paths['/gamification/seasons/{seasonId}/leaderboard'].get;
    const consent = openApi.paths['/gamification/seasons/{seasonId}/leaderboard-consent'].put;
    assert.deepEqual(leaderboard.security, [{ BearerAuth: [] }]);
    assert.deepEqual(consent.security, [{ BearerAuth: [] }]);
    assert.deepEqual(leaderboard.responses['200'].headers['Cache-Control'].schema.enum, ['private, no-store']);
});

test('web and TMA expose semantic progress, explained reversals and reduced motion', () => {
    for (const ui of [webUi, tgUi]) {
        assert.match(ui, /<progress aria-label="Прогресс до следующего уровня"/u);
        assert.match(ui, /не является рейтингом мастерства/u);
        assert.match(ui, /не начисляется за победу/u);
        assert.match(ui, /Исходное подтверждение отменено/u);
        assert.match(ui, /Участие выключено по умолчанию/u);
        assert.match(ui, /Скрытый игрок \(блокировка\)/u);
        assert.doesNotMatch(ui, /confetti|advert|реклам/iu);
    }
    for (const css of [webCss, tgCss]) {
        assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
        assert.match(css, /transition: none !important/u);
    }
});
