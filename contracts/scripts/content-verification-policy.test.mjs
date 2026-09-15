import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [openApiSource, asyncApiSource, migration, policy, controller, service, ingestion, verification] =
    await Promise.all([
        read('../../openapi.yaml'),
        read('../../asyncapi.yaml'),
        read('../../backend/prisma/migrations/20260913160000_content_news_contract_data/migration.sql'),
        read('../../backend/src/administration/administration.policy.ts'),
        read('../../backend/src/content/content.controller.ts'),
        read('../../backend/src/content/content.service.ts'),
        read('../../backend/src/content/content-ingestion.service.ts'),
        read('../../llm/_docs/content-news-verification.md'),
    ]);
const openApi = parse(openApiSource);
const asyncApi = parse(asyncApiSource);

test('the CMS role matrix is fixed and drafts stay behind private no-store capability checks', () => {
    assert.match(policy, /EDITOR:[\s\S]*'CONTENT_EDIT'[\s\S]*'CONTENT_PREVIEW'[\s\S]*'CONTENT_PUBLISH'/u);
    assert.match(policy, /SUPERADMIN:[\s\S]*'CONTENT_SOURCE_GOVERN'[\s\S]*'CONTENT_EMERGENCY_UNPUBLISH'/u);
    assert.match(policy, /MODERATOR:[\s\S]*'SAFETY_CASE_DECIDE'/u);
    assert.match(policy, /ADS_MANAGER: \['ADMIN_SESSION_ACCESS'\]/u);
    assert.match(controller, /await this\.admin\(authorization, 'CONTENT_PREVIEW'\)/u);
    assert.match(controller, /response\.setHeader\('X-Robots-Tag', 'noindex, nofollow'\)/u);
    assert.match(controller, /private, no-store/u);

    for (const path of [
        '/admin/content/articles/{articleId}',
        '/admin/content/articles/{articleId}/revisions',
        '/admin/content/articles/{articleId}/revisions/{revisionId}/preview',
    ]) {
        for (const operation of Object.values(openApi.paths[path])) {
            assert.deepEqual(operation.security, [{ BearerAuth: [] }]);
        }
    }
});

test('publication and deletion cannot leave a draft in search, projection or content events', () => {
    assert.match(service, /contentPublicProjection\.deleteMany/u);
    assert.match(service, /p\.search_document @@ websearch_to_tsquery/u);
    assert.match(service, /content\.article\.published\.v1/u);
    assert.match(service, /content\.article\.unpublished\.v1/u);
    assert.match(migration, /public projection requires exact committed published revision and current origin rights/u);
    assert.match(migration, /PUBLISHED article and public projection must exist or disappear atomically/u);

    const forbidden = /body|title|summary|excerpt|slug|canonicalUrl|sourceId|candidateId|userId|actor/iu;
    for (const message of Object.values(asyncApi.components.messages).filter(({ name }) =>
        name.startsWith('content.')
    )) {
        const reference = message.payload.$ref.split('/').at(-1);
        const fields = Object.keys(asyncApi.components.schemas[reference].properties.data.properties);
        assert.doesNotMatch(fields.join(' '), forbidden, message.name);
    }
});

test('ingestion is deny-by-default, conditional and duplicate-safe without enabled real seeds', () => {
    assert.match(ingestion, /where: \{ state: 'ENABLED', currentPolicyId: \{ not: null \} \}/u);
    assert.match(ingestion, /etag: checkpoint\.etag/u);
    assert.match(ingestion, /lastModified: checkpoint\.lastModified/u);
    assert.match(ingestion, /pg_advisory_xact_lock/u);
    assert.match(migration, /ingest_candidate_revisions_source_hash_key/u);
    assert.match(migration, /ingest_candidate_revisions_source_url_hash_idx/u);
    assert.doesNotMatch(migration, /INSERT INTO "content_sources"/u);
    assert.match(verification, /Включённые реальные источники \| 0/u);
    assert.match(verification, /ни один реальный RSS\/API source не включён/u);
});

test('verification evidence names browser, database and source-permission gates without claiming them', () => {
    assert.match(verification, /test\/e2e\/content\.spec\.ts/u);
    assert.match(verification, /PostgreSQL\/Redis/u);
    assert.match(verification, /юридическ/u);
    assert.match(verification, /не заменяет/u);
});
