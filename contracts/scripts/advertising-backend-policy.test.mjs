import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [controller, service, provider, idempotency, maintenance, frequencyCache, migration, policy] = await Promise.all([
    read('../../backend/src/advertising/advertising.controller.ts'),
    read('../../backend/src/advertising/advertising.service.ts'),
    read('../../backend/src/advertising/advertising-provider.ts'),
    read('../../backend/src/advertising/advertising-idempotency.service.ts'),
    read('../../backend/src/advertising/advertising-maintenance.service.ts'),
    read('../../backend/src/advertising/advertising-frequency-cache.service.ts'),
    read('../../backend/prisma/migrations/20260915150000_advertising_backend_guards/migration.sql'),
    read('../../backend/src/administration/administration.policy.ts'),
]);

test('delivery is split, idempotent, private and browser-integrity protected', () => {
    for (const route of ['decisions', 'impressions', 'clicks']) {
        assert.match(controller, new RegExp(`advertising/${route.replace('decisions', 'decisions')}`));
    }
    assert.match(controller, /browser\.assertMutation/u);
    assert.match(controller, /Idempotency-Replayed/u);
    assert.match(controller, /private, no-store/u);
    assert.match(idempotency, /AdvertisingOperationReceipt|advertisingOperationReceipt/u);
    assert.match(idempotency, /Serializable/u);
    assert.match(idempotency, /responseCiphertext/u);
});

test('selection is deterministic, contextual and database guarded', () => {
    assert.match(service, /isEligible/u);
    assert.match(service, /compareCandidates/u);
    assert.match(service, /priorityTier/u);
    assert.match(service, /FREQUENCY_CAPPED/u);
    assert.match(service, /FOR UPDATE/u);
    assert.match(service, /deliveryCounter/u);
    assert.match(frequencyCache, /PostgreSQL remains authoritative/u);
    assert.doesNotMatch(service, /request\.ip|remoteAddress|latitude|longitude|advertisingId|deviceId/iu);
});

test('moderation, redirects, aggregate reporting and retention are explicit', () => {
    assert.match(service, /CONFLICT_OF_INTEREST/u);
    assert.match(service, /approvedRedirectHosts/u);
    assert.match(service, /minimumCohortSize: 20/u);
    assert.match(maintenance, /reconcileReports/u);
    assert.match(maintenance, /RESERVATION_RELEASED/u);
    assert.match(maintenance, /deleteMany/u);
    assert.match(migration, /campaign revision snapshot is immutable/u);
    assert.match(migration, /BEFORE UPDATE ON "ad_delivery_events"/u);
});

test('provider and staff capabilities fail closed', () => {
    assert.match(provider, /DisabledAdvertisingProvider/u);
    assert.match(provider, /Promise\.resolve\(null\)/u);
    assert.match(service, /LEGAL_EVIDENCE_REQUIRED/u);
    assert.match(policy, /ADS_MANAGER:[\s\S]*'AD_REPORT_READ'/u);
    assert.match(policy, /SUPERADMIN:[\s\S]*'AD_PROVIDER_GOVERN'/u);
});
