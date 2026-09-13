import assert from 'node:assert/strict';

export const contentOperations = {
    '/content/articles': ['get'],
    '/content/articles/{locale}/{slug}': ['get'],
    '/content/search': ['post'],
    '/content/bookmarks': ['get'],
    '/content/bookmarks/{articleId}': ['delete', 'put'],
    '/admin/content/sources': ['get', 'post'],
    '/admin/content/sources/{sourceId}': ['put'],
    '/admin/content/sources/{sourceId}/state': ['post'],
    '/admin/content/sources/{sourceId}/pause': ['post'],
    '/admin/content/candidates': ['get'],
    '/admin/content/candidates/{candidateId}': ['get'],
    '/admin/content/candidates/{candidateId}/decision': ['post'],
    '/admin/content/articles': ['get', 'post'],
    '/admin/content/articles/{articleId}': ['get'],
    '/admin/content/articles/{articleId}/revisions': ['get', 'post'],
    '/admin/content/articles/{articleId}/revisions/{revisionId}': ['get'],
    '/admin/content/articles/{articleId}/revisions/{revisionId}/preview': ['get'],
    '/admin/content/articles/{articleId}/decisions': ['post'],
    '/admin/content/articles/{articleId}/emergency-unpublish': ['post'],
};

export const contentEventFields = {
    'content.article.published.v1': ['articleId', 'revisionId', 'articleVersion', 'outcome'],
    'content.article.unpublished.v1': ['articleId', 'revisionId', 'articleVersion', 'outcome'],
};

const contentRoleCapabilities = {
    SUPERADMIN: ['CONTENT_SOURCE_READ', 'CONTENT_SOURCE_GOVERN', 'CONTENT_EMERGENCY_UNPUBLISH'],
    EDITOR: [
        'CONTENT_SOURCE_READ',
        'CONTENT_SOURCE_PROPOSE',
        'CONTENT_SOURCE_PAUSE',
        'CONTENT_CANDIDATE_REVIEW',
        'CONTENT_EDIT',
        'CONTENT_PREVIEW',
        'CONTENT_PUBLISH',
    ],
};

function dereference(document, value) {
    if (!value?.$ref) return value;
    assert(value.$ref.startsWith('#/'));
    return value.$ref
        .slice(2)
        .split('/')
        .reduce((node, key) => node[key], document);
}

function parameter(openApi, operation, name) {
    return (operation.parameters ?? []).map((item) => dereference(openApi, item)).find((item) => item.name === name);
}

function responseCacheValues(openApi, operation) {
    return Object.values(operation.responses).map((responseValue) => {
        const response = dereference(openApi, responseValue);
        return dereference(openApi, response.headers?.['Cache-Control'])?.schema?.enum?.[0];
    });
}

export function checkContentContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(contentOperations)) {
        assert(openApi.paths[path], `Missing content path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort());
    }

    for (const [path, pathItem] of Object.entries(openApi.paths)) {
        if (!path.startsWith('/admin/content')) continue;
        for (const [method, operation] of Object.entries(pathItem)) {
            assert(
                operation.security?.some((entry) => entry.BearerAuth),
                `${operation.operationId} requires bearer.`
            );
            assert(operation['x-admin-capability'], `${operation.operationId} requires a capability.`);
            assert(operation['x-admin-roles']?.length > 0, `${operation.operationId} requires a fixed role allowlist.`);
            for (const role of operation['x-admin-roles']) {
                assert(
                    contentRoleCapabilities[role]?.includes(operation['x-admin-capability']),
                    `${operation.operationId} capability is not in the fixed ${role} registry.`
                );
            }
            assert(
                responseCacheValues(openApi, operation).every((value) => value === 'private, no-store'),
                `${operation.operationId} must be private no-store.`
            );
            if (method !== 'get') {
                for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
                }
            }
        }
    }

    for (const path of ['/content/bookmarks', '/content/bookmarks/{articleId}']) {
        for (const [method, operation] of Object.entries(openApi.paths[path])) {
            assert(
                operation.security?.some((entry) => entry.BearerAuth),
                `${operation.operationId} requires bearer.`
            );
            assert(
                responseCacheValues(openApi, operation).every((value) => value === 'private, no-store'),
                `${operation.operationId} must be private no-store.`
            );
            if (method !== 'get') {
                for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
                }
            }
        }
    }

    const publicPaths = ['/content/articles', '/content/articles/{locale}/{slug}', '/content/search'];
    for (const path of publicPaths) {
        const operation = Object.values(openApi.paths[path])[0];
        assert.deepEqual(operation.security, [{}], `${operation.operationId} must be anonymous.`);
    }
    assert(!parameter(openApi, openApi.paths['/content/search'].post, 'query'), 'Search query must not be in the URL.');
    assert(openApi.paths['/content/search'].post.requestBody?.required, 'Search query body must be required.');
    assert.match(openApi.paths['/content/articles/{locale}/{slug}'].get.description, /non-public lifecycle state/u);

    for (const model of [
        'ContentSource',
        'IngestCandidate',
        'PublicArticle',
        'ArticleRevision',
        'ContentTag',
        'BookmarkItem',
        'ContentMediaReference',
        'ArticleSeoMetadata',
        'PublicArticleAttribution',
        'SafeRichTextDocument',
    ]) {
        assert(openApi.components.schemas[model], `Missing ${model} wire model.`);
    }
    const safeDocument = dereference(openApi, openApi.components.schemas.SafeRichTextDocument);
    assert.deepEqual(safeDocument.properties.format.enum, ['SAFE_RICH_TEXT_V1']);
    const safeBlock = dereference(openApi, openApi.components.schemas.SafeRichTextBlock);
    for (const executable of ['html', 'script', 'style', 'embed', 'iframe', 'eventHandler']) {
        assert(!(executable in safeBlock.properties), `Safe rich text must not expose ${executable}.`);
    }
    assert(!('objectKey' in openApi.components.schemas.ContentMediaReference.properties));

    const channel = asyncApi.channels.contentEvents;
    assert.equal(channel?.address, 'content.events.v1');
    assert.deepEqual(channel.servers, [{ $ref: '#/servers/outbox' }]);
    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        message.name.startsWith('content.')
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(contentEventFields).sort());
    const forbidden = new Set([
        'title',
        'body',
        'excerpt',
        'slug',
        'url',
        'author',
        'publisher',
        'sourceId',
        'candidateId',
        'userId',
        'bookmarkId',
        'actorUserId',
        'rightsEvidence',
    ]);
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert.equal(schema.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert.deepEqual(Object.keys(data.properties).sort(), [...contentEventFields[message.name]].sort());
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert(!Object.keys(data.properties).some((name) => forbidden.has(name)), `${message.name} leaks content.`);
    }
}
