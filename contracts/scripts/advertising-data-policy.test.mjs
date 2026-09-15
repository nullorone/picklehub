import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
    new URL('../../backend/prisma/migrations/20260915120000_advertising_contract_data/migration.sql', import.meta.url),
    'utf8'
);

test('required advertising records and approved immutable snapshots are explicit', () => {
    for (const model of [
        'Campaign',
        'Creative',
        'Placement',
        'TargetRule',
        'DeliveryCounter',
        'AdDeliveryEvent',
        'AdCampaignDecision',
    ]) {
        assert.match(schema, new RegExp(`model ${model} \\{`));
    }
    assert.match(schema, /model CampaignRevision \{/);
    assert.match(migration, /campaign_revisions_immutable/);
    assert.match(migration, /creatives_immutable/);
    assert.match(migration, /target_rules_immutable/);
    assert.match(migration, /ad_campaign_decisions_append_only/);
    assert.match(migration, /campaigns_state_machine/);
    assert.match(migration, /delivery must use exact approved campaign revision/);
});

test('hard budget reservation and replay safety are database-backed', () => {
    assert.match(migration, /campaigns_budget_guard/);
    assert.match(migration, /reserved_minor" \+ "spent_minor" <= "budget_minor/);
    assert.match(migration, /ad_delivery_events_delivery_kind_key/);
    assert.match(migration, /ad_delivery_events_delivery_token_key/);
    assert.match(migration, /ad_delivery_events_click_token_key/);
    assert.match(migration, /campaign hard budget exhausted/);
    assert.match(migration, /reservation already finalized or released/);
    assert.match(migration, /advertising_operation_receipts_scope_key/);
    assert.match(migration, /response_ciphertext/);
});

test('cross-session cap state is purpose-bound, bounded and expires after eight days', () => {
    assert.match(migration, /delivery_counters_campaign_subject_key/);
    assert.match(
        migration,
        /viewable_24_count" SMALLINT NOT NULL DEFAULT 0 CHECK \("viewable_24_count" BETWEEN 0 AND 3\)/
    );
    assert.match(
        migration,
        /viewable_7_count" SMALLINT NOT NULL DEFAULT 0 CHECK \("viewable_7_count" BETWEEN 0 AND 10\)/
    );
    assert.match(
        migration,
        /session_viewable_count" SMALLINT NOT NULL DEFAULT 0 CHECK \("session_viewable_count" BETWEEN 0 AND 1\)/
    );
    assert.match(migration, /cross-session campaign frequency cap reached/);
    assert.match(migration, /INTERVAL '8 days'/);
    assert.match(migration, /forbidden for targeting, segmentation, reporting and export/);
});

test('issuance, viewability and click are separate short-lived append-only facts', () => {
    assert.match(migration, /'ISSUED', 'VIEWABLE_IMPRESSION', 'VALID_CLICK', 'INVALID_CLICK', 'RESERVATION_RELEASED'/);
    assert.match(migration, /ad_delivery_events_append_only/);
    assert.match(migration, /measurement must reference its issued delivery/);
    assert.match(migration, /delivery token expired/);
    assert.match(migration, /token_expires_at" <= "occurred_at" \+ INTERVAL '15 minutes'/);
    assert.match(migration, /expires_at" <= "occurred_at" \+ INTERVAL '30 days'/);
});

test('targeting and provider fields are closed allowlists without precise or behavioral dimensions', () => {
    const targetEnum = migration.match(/CREATE TYPE "ad_target_dimension"[\s\S]*?\);/u)?.[0] ?? '';
    for (const allowed of ['SURFACE', 'CLIENT_KIND', 'LOCALE', 'CITY', 'CONTENT_CATEGORY']) {
        assert.match(targetEnum, new RegExp(`'${allowed}'`));
    }
    assert.doesNotMatch(
        targetEnum,
        /USER|DEVICE|ADVERTISING_ID|IP|LATITUDE|LONGITUDE|COORDINATE|HISTORY|INTEREST|DUPR|XP/
    );
    assert.match(migration, /ad_provider_policies_enable_gate_check/);
    assert.match(migration, /ad_provider_policies_allowlist_check/);
    assert.match(migration, /ad_provider_policies_immutable/);
});

test('report storage is aggregate-only and API suppression has a fixed floor', () => {
    assert.match(migration, /CREATE TABLE "ad_report_daily"/);
    assert.match(migration, /ad_report_daily_funnel_check/);
    assert.match(migration, /API suppresses cohorts below 20/);
    const reportTable = migration.match(/CREATE TABLE "ad_report_daily" \([\s\S]*?\n\);/u)?.[0] ?? '';
    assert.doesNotMatch(reportTable, /subject|user|session|device|ip|coordinate|url|query/iu);
});
