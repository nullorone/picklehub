import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [service, richText, adapter, ingestion, queue, worker, controller, integration] = await Promise.all([
    read('../../backend/src/content/content.service.ts'),
    read('../../backend/src/content/content-rich-text.ts'),
    read('../../backend/src/content/content-source.adapter.ts'),
    read('../../backend/src/content/content-ingestion.service.ts'),
    read('../../backend/src/content/content-ingestion-queue.service.ts'),
    read('../../backend/src/content/content-ingestion-worker.service.ts'),
    read('../../backend/src/content/content.controller.ts'),
    read('../../backend/test/integration/content-backend.integration-spec.ts'),
]);

test('content publication and removal are transactional, idempotent and body-free in outbox', () => {
    assert.match(service, /content\.article\.published\.v1/u);
    assert.match(service, /content\.article\.unpublished\.v1/u);
    assert.match(service, /contentPublicProjection\.deleteMany/u);
    assert.match(service, /scheduleDecision\.checklist/u);
    assert.match(service, /schedulerOperationId/u);
    assert.match(service, /data: \{ articleId, revisionId, articleVersion: version\.toString\(\), outcome \}/u);
});

test('source polling is allowlisted, bounded and stores metadata snapshots only', () => {
    assert.match(adapter, /redirect: 'manual'/u);
    assert.match(adapter, /CONTENT_SOURCE_PRIVATE_NETWORK_REJECTED/u);
    assert.match(adapter, /MAXIMUM_REDIRECTS/u);
    assert.match(adapter, /readBounded/u);
    assert.match(adapter, /XMLValidator/u);
    assert.match(adapter, /<!DOCTYPE\|<!ENTITY/u);
    assert.match(adapter, /FETCH_METADATA/u);
    assert.match(adapter, /STORE_EXCERPT/u);
    assert.doesNotMatch(adapter, /cheerio|playwright|puppeteer|STORE_FULL_TEXT/u);
    assert.match(ingestion, /sourceHash/u);
    assert.match(ingestion, /canonicalUrlHash/u);
    assert.match(ingestion, /pg_advisory_xact_lock/u);
    assert.match(ingestion, /failureCount/u);
    assert.match(queue, /data: \{\}/u);
    assert.match(worker, /duplicate\(\{ maxRetriesPerRequest: null \}\)/u);
    assert.match(worker, /CONTENT_INGESTION_JOB_REJECTED/u);
    assert.match(integration, /deduplicates source redelivery/u);
    assert.match(integration, /unavailable-source attempt/u);
    assert.match(integration, /BullMQ scheduler/u);
    assert.match(integration, /concurrent scheduler runs/u);
});

test('reader and preview boundaries keep rich text closed and caches separated', () => {
    assert.match(richText, /SAFE_RICH_TEXT_V1/u);
    assert.match(richText, /exactKeys/u);
    assert.doesNotMatch(richText, /innerHTML|eval\(|new Function/u);
    assert.match(controller, /public, max-age=60, stale-while-revalidate=300/u);
    assert.match(controller, /private, no-store/u);
    assert.match(controller, /X-Robots-Tag/u);
    assert.match(service, /admin-content-sources/u);
    assert.match(service, /snapshotAt/u);
});
