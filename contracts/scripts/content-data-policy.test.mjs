import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
    new URL('../../backend/prisma/migrations/20260913160000_content_news_contract_data/migration.sql', import.meta.url),
    'utf8'
);

test('required content records and private/public split are explicit', () => {
    for (const model of [
        'ContentSource',
        'ContentSourcePolicy',
        'IngestCandidate',
        'IngestCandidateRevision',
        'Article',
        'ArticleRevision',
        'ArticleOrigin',
        'ContentTag',
        'Bookmark',
        'ContentMedia',
        'ContentPublicationDecision',
        'ContentPublicProjection',
    ]) {
        assert.match(schema, new RegExp(`model ${model} \\{`));
    }
    assert.match(migration, /content_public_projection_published_only_guard/);
    assert.match(migration, /public projection requires exact committed published revision and current origin rights/);
    assert.match(migration, /PUBLISHED article and public projection must exist or disappear atomically/);
});

test('deny-by-default rights and license gates are database-backed', () => {
    assert.match(migration, /content_sources_enabled_review_check/);
    assert.match(migration, /content_sources_state_machine/);
    assert.match(migration, /source enable requires current approved policy and evidence/);
    assert.match(migration, /revoked source and dependent public projections must be removed atomically/);
    assert.match(migration, /content_source_policies_full_text_license_check/);
    assert.match(migration, /content_source_policies_media_license_check/);
    assert.match(migration, /candidate fetch requires enabled allowlisted current source policy/);
    assert.match(migration, /maximum_excerpt_characters" BETWEEN 0 AND 2000/);
});

test('candidate dedupe preserves revisions and cannot publish', () => {
    assert.match(migration, /ingest_candidate_revisions_revision_key/);
    assert.match(migration, /ingest_candidate_revisions_source_hash_key/);
    assert.match(migration, /ingest_candidate_revisions_source_url_hash_idx/);
    assert.match(migration, /ingest_candidates_duplicate_shape_check/);
    const candidateTable = migration.match(/CREATE TABLE "ingest_candidates" \([\s\S]*?\n\);/u)?.[0] ?? '';
    assert.doesNotMatch(candidateTable, /published|publication|public_projection/iu);
});

test('safe rich text has a closed executable-free database validator', () => {
    assert.match(migration, /content_safe_rich_text_v1/);
    assert.match(migration, /document->>'format' <> 'SAFE_RICH_TEXT_V1'/);
    assert.match(migration, /document - ARRAY\['format', 'blocks'\]/);
    assert.match(migration, /block - ARRAY\['kind', 'headingLevel', 'inlines', 'items'\]/);
    assert.match(migration, /inline_node - ARRAY\['text', 'marks', 'href'\]/);
    assert.match(migration, /inline_node->>'href' !~ '\^https:\/\/'/);
    assert.doesNotMatch(migration, /SAFE_RICH_TEXT_V1[\s\S]{0,200}script|eval\(|javascript:/iu);
});

test('revisions, origins, policy and publication history are immutable', () => {
    for (const trigger of [
        'content_source_policies_immutable',
        'ingest_candidate_revisions_immutable',
        'article_revisions_immutable',
        'article_origins_immutable',
        'content_publication_decisions_append_only',
    ]) {
        assert.match(migration, new RegExp(trigger));
    }
    assert.match(migration, /article revision pointer must belong to article/);
    assert.match(migration, /derived revision requires origins and original revision forbids external origins/);
    assert.match(migration, /content_articles_state_machine/);
    assert.match(migration, /content_publication_decisions_checklist_check/);
});

test('canonical URLs, source hashes, bookmarks and operation replay are unique', () => {
    assert.match(migration, /content_canonical_slugs_locale_slug_key/);
    assert.match(migration, /content_public_projections_locale_slug_key/);
    assert.match(migration, /canonical_url_hash" CHAR\(64\)/);
    assert.match(migration, /bookmarks_owner_article_key" PRIMARY KEY \("user_id", "article_id"\)/);
    assert.match(migration, /content_operation_receipts_scope_key/);
    assert.match(migration, /response_ciphertext/);
});
