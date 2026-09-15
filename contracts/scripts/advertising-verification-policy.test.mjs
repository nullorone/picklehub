import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [
    openApiSource,
    asyncApiSource,
    dataMigration,
    backendMigration,
    controller,
    service,
    rateLimit,
    provider,
    rolePolicy,
    webApp,
    webSlot,
    webCss,
    tmaApp,
    tmaSlot,
    tmaCss,
    analytics,
    verification,
] = await Promise.all([
    read('../../openapi.yaml'),
    read('../../asyncapi.yaml'),
    read('../../backend/prisma/migrations/20260915120000_advertising_contract_data/migration.sql'),
    read('../../backend/prisma/migrations/20260915150000_advertising_backend_guards/migration.sql'),
    read('../../backend/src/advertising/advertising.controller.ts'),
    read('../../backend/src/advertising/advertising.service.ts'),
    read('../../backend/src/advertising/advertising-rate-limit.service.ts'),
    read('../../backend/src/advertising/advertising-provider.ts'),
    read('../../backend/src/administration/administration.policy.ts'),
    read('../../frontend/web/src/app.tsx'),
    read('../../frontend/web/src/advertising-ui.tsx'),
    read('../../frontend/web/src/styles.css'),
    read('../../frontend/tg/src/app.tsx'),
    read('../../frontend/tg/src/advertising-ui.tsx'),
    read('../../frontend/tg/src/styles.css'),
    read('../../llm/_docs/analytics-plan.md'),
    read('../../llm/_docs/advertising-verification.md'),
]);
const openApi = parse(openApiSource);
const asyncApi = parse(asyncApiSource);

test('decision context and events cannot carry sensitive or behavioral targeting', () => {
    const context = openApi.components.schemas.AdDecisionContext;
    const contextFields = Object.keys(context.properties);
    assert.deepEqual(contextFields.sort(), [
        'capToken',
        'clientKind',
        'connectivity',
        'contentCategory',
        'criticalState',
        'formFactor',
        'geography',
        'locale',
        'objectClass',
        'placementCode',
        'providerConsent',
        'surface',
    ]);
    assert.doesNotMatch(
        contextFields.join(' '),
        /user|profile|history|search|query|url|latitude|longitude|coordinate|ip|device|advertisingId|dupr|xp/iu
    );

    const targetEnum = dataMigration.match(/CREATE TYPE "ad_target_dimension"[\s\S]*?\);/u)?.[0] ?? '';
    assert.doesNotMatch(targetEnum, /USER|DEVICE|IP|COORDINATE|HISTORY|INTEREST|DUPR|XP/u);
    const forbiddenEventField = /user|subject|session|device|ip|coordinate|url|query|token|creativeBody|fraud/iu;
    for (const message of Object.values(asyncApi.components.messages).filter(({ name }) =>
        name.startsWith('advertising.')
    )) {
        const schemaName = message.payload.$ref.split('/').at(-1);
        const fields = Object.keys(asyncApi.components.schemas[schemaName].properties.data.properties);
        assert.doesNotMatch(fields.join(' '), forbiddenEventField, message.name);
    }
});

test('delivery ordering, UTC boundaries, caps, replay and pause are fail-closed', () => {
    assert.match(service, /where: \{ state: 'ACTIVE', startsAt: \{ lte: now \}, endsAt: \{ gt: now \} \}/u);
    assert.match(service, /PRIORITY\[leftRevision\.priorityTier\] - PRIORITY\[rightRevision\.priorityTier\]/u);
    assert.match(service, /snapshotHash\.localeCompare/u);
    assert.match(service, /FOR UPDATE/u);
    assert.match(dataMigration, /campaigns_budget_guard/u);
    assert.match(dataMigration, /cross-session campaign frequency cap reached/u);
    assert.match(dataMigration, /ad_delivery_events_delivery_kind_key/u);
    assert.match(controller, /consume\(`click:\$\{String\(body\.clickToken\)\}`, 5, 60, true\)/u);
    assert.match(rateLimit, /policyRequired\) throw advertisingError\('AD_POLICY_UNAVAILABLE', 503\)/u);
    assert.match(service, /existing\.kind === 'VALID_CLICK'/u);
    assert.match(service, /UNTRUSTED_ACTIVATION/u);
    assert.match(service, /state: 'PAUSED'/u);
    assert.match(backendMigration, /release must reference an expired issued reservation/u);
});

test('creative approval, staff roles, media and destinations have closed policy boundaries', () => {
    const adsManager = /ADS_MANAGER: \[([\s\S]*?)\],/u.exec(rolePolicy)?.[1] ?? '';
    assert.match(adsManager, /'AD_CAMPAIGN_MANAGE'/u);
    assert.match(adsManager, /'AD_CAMPAIGN_REVIEW'/u);
    assert.match(adsManager, /'AD_CREATIVE_MANAGE'/u);
    assert.doesNotMatch(adsManager, /AD_PROVIDER_GOVERN/u);
    assert.match(rolePolicy, /SUPERADMIN:[\s\S]*'AD_PROVIDER_GOVERN'/u);
    assert.match(service, /CONFLICT_OF_INTEREST/u);
    assert.match(service, /\['image\/avif', 'image\/jpeg', 'image\/png', 'image\/webp'\]/u);
    assert.match(service, /1_048_576/u);
    assert.match(service, /approvedRedirectHosts\.includes\(url\.hostname\.toLowerCase\(\)\)/u);
    assert.match(service, /input\.format === 'STATIC_IMAGE' && \(input\.headline/u);
    for (const slot of [webSlot, tmaSlot]) {
        assert.doesNotMatch(slot, /dangerouslySetInnerHTML|<script|<iframe|srcDoc/iu);
        assert.match(slot, /decision\.creative\.assetUrl/u);
        assert.match(slot, /decision\.creative\.altText/u);
    }
});

test('one global slot covers each client while critical controls and failures remove it', () => {
    for (const [app, slot] of [
        [webApp, webSlot],
        [tmaApp, tmaSlot],
    ]) {
        assert.match(app, /<AdvertisingSlot[\s\S]*pathname=\{routeLocation\.pathname\}/u);
        assert.match(app, /<\/Routes>[\s\S]*<AdvertisingSlot/u);
        assert.match(slot, /\^\\\/login/u);
        assert.match(slot, /\^\\\/onboarding/u);
        assert.match(slot, /\^\\\/matches\\\/new/u);
        assert.match(slot, /\^\\\/safety\\\/report/u);
        assert.match(slot, /\[data-ad-critical="true"\]/u);
        assert.match(slot, /\[data-ad-free="true"\]/u);
        assert.match(slot, /\.result-form/u);
        assert.match(slot, /document\.activeElement\?\.closest\('form'\)/u);
        assert.match(slot, /onError=\{\(\) =>/u);
        assert.match(slot, /if \(!online \|\| critical \|\| empty\) return null/u);
        assert.match(slot, /aria-label="Рекламное объявление"/u);
    }
    for (const css of [webCss, tmaCss]) {
        assert.match(css, /\.ad-slot/u);
        assert.match(css, /position:\s*relative/u);
        assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
    }
    assert.match(verification, /test\/e2e\/advertising\.spec\.ts/u);
});

test('reports reconcile from restricted facts and product rollout has a placement holdout', () => {
    assert.match(dataMigration, /ad_report_daily_funnel_check/u);
    assert.match(service, /const suppressed = row\.served < 20n/u);
    assert.match(service, /minimumCohortSize: 20/u);
    const advertisingPaths = Object.keys(openApi.paths).filter((path) => path.startsWith('/admin/advertising'));
    assert.doesNotMatch(advertisingPaths.join(' '), /raw|export/iu);
    assert.match(analytics, /placement-level holdout/u);
    assert.match(analytics, /published match → eligible join intent/u);
    assert.match(analytics, /score entry\/confirmation/u);
    assert.match(analytics, /critical-state ad/u);
    assert.match(verification, /сверк/u);
});

test('external fallback remains disabled without evidence and cannot block product content', () => {
    assert.match(provider, /class DisabledAdvertisingProvider/u);
    assert.match(provider, /Promise\.resolve\(null\)/u);
    assert.match(service, /if \(input\.enabled\) throw advertisingError\('LEGAL_EVIDENCE_REQUIRED', 422\)/u);
    assert.match(service, /catch \{[\s\S]*return this\.noFill\('PROVIDER_TIMEOUT', 300\)/u);
    assert.doesNotMatch(dataMigration, /INSERT INTO "ad_provider_policies"/u);
    assert.match(verification, /Включённые внешние провайдеры\s+\| 0/u);
    assert.match(verification, /не подтверждает/u);
});
