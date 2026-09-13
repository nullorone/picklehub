import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [openApiSource, controller, service, migration, adminClient, pwaConfig, verification] = await Promise.all([
    read('../../openapi.yaml'),
    read('../../backend/src/administration/administration.controller.ts'),
    read('../../backend/src/administration/administration.service.ts'),
    read('../../backend/prisma/migrations/20260911230000_admin_backoffice_contract_data/migration.sql'),
    read('../../frontend/web/src/admin-client.ts'),
    read('../../frontend/web/vite.config.ts'),
    read('../../llm/_docs/admin-backoffice-verification.md'),
]);
const openApi = parse(openApiSource);

const expected = {
    'get /admin/audit': ['SUPERADMIN', 'MODERATOR'],
    'get /admin/cases': ['SUPERADMIN', 'MODERATOR'],
    'get /admin/cases/{caseId}': ['SUPERADMIN', 'MODERATOR'],
    'get /admin/content/articles': ['EDITOR'],
    'get /admin/content/articles/{articleId}': ['EDITOR'],
    'get /admin/content/articles/{articleId}/revisions': ['EDITOR'],
    'get /admin/content/articles/{articleId}/revisions/{revisionId}': ['EDITOR'],
    'get /admin/content/articles/{articleId}/revisions/{revisionId}/preview': ['EDITOR'],
    'get /admin/content/candidates': ['EDITOR'],
    'get /admin/content/candidates/{candidateId}': ['EDITOR'],
    'get /admin/content/sources': ['SUPERADMIN', 'EDITOR'],
    'get /admin/session': ['SUPERADMIN', 'MODERATOR', 'EDITOR', 'ADS_MANAGER'],
    'get /admin/venue-candidates': ['MODERATOR'],
    'get /admin/venue-candidates/{itemId}': ['MODERATOR'],
    'post /admin/break-glass-grants': ['SUPERADMIN'],
    'post /admin/break-glass-grants/{grantId}/revoke': ['SUPERADMIN'],
    'post /admin/cases/{caseId}/assignment': ['SUPERADMIN', 'MODERATOR'],
    'post /admin/cases/{caseId}/decision': ['MODERATOR'],
    'post /admin/content/articles': ['EDITOR'],
    'post /admin/content/articles/{articleId}/decisions': ['EDITOR'],
    'post /admin/content/articles/{articleId}/emergency-unpublish': ['SUPERADMIN'],
    'post /admin/content/articles/{articleId}/revisions': ['EDITOR'],
    'post /admin/content/candidates/{candidateId}/decision': ['EDITOR'],
    'post /admin/content/sources': ['EDITOR'],
    'post /admin/content/sources/{sourceId}/pause': ['EDITOR'],
    'post /admin/content/sources/{sourceId}/state': ['SUPERADMIN'],
    'post /admin/role-grants': ['SUPERADMIN'],
    'post /admin/role-grants/{grantId}/revoke': ['SUPERADMIN'],
    'post /admin/users/{userId}/restrictions': ['MODERATOR'],
    'post /admin/users/{userId}/restrictions/{restrictionId}/revoke': ['MODERATOR'],
    'post /admin/users/lookup': ['SUPERADMIN', 'MODERATOR'],
    'post /admin/venue-candidates/{itemId}/decision': ['MODERATOR'],
    'post /admin/venue-candidates/{itemId}/merge': ['MODERATOR'],
};

test('every generated admin operation has the reviewed fixed-role matrix', () => {
    const actual = {};
    for (const [path, pathItem] of Object.entries(openApi.paths)) {
        if (!path.startsWith('/admin/')) continue;
        for (const method of ['get', 'post']) {
            const operation = pathItem[method];
            if (operation) actual[`${method} ${path}`] = operation['x-admin-roles'];
        }
    }
    assert.deepEqual(actual, expected);
});

test('controller applies a named capability to every admin route and never trusts a player bearer', () => {
    for (const capability of [
        'ADMIN_SESSION_ACCESS',
        'ROLE_GRANT_MANAGE',
        'USER_LOOKUP',
        'SAFETY_CASE_ROUTE',
        'SAFETY_CASE_DECIDE',
        'USER_RESTRICT',
        'VENUE_MODERATE',
        'AUDIT_SEARCH',
        'BREAK_GLASS_MANAGE',
    ]) {
        assert(controller.includes(`'${capability}'`), `Controller does not enforce ${capability}`);
    }
    assert.match(controller, /sessions\.authenticate\(authorization\)/u);
    assert.match(controller, /sessions\.assertCapability\(admin, capability\)/u);
    assert.match(controller, /auditAuthorizationDenied\(admin, capability\)/u);
    assert.doesNotMatch(controller, /player|Player/u);
});

test('administrative mutations use one transaction wrapper and map serialization races to stale conflicts', () => {
    for (const method of [
        'grantRole',
        'revokeRole',
        'assignCase',
        'decideCase',
        'createRestriction',
        'revokeRestriction',
        'decideVenue',
        'mergeVenue',
        'createBreakGlass',
        'revokeBreakGlass',
    ]) {
        const start = service.indexOf(`async ${method}(`);
        const end = service.indexOf('\n    async ', start + 1);
        const block = service.slice(start, end === -1 ? undefined : end);
        assert(block?.includes('this.mutate('), `${method} bypasses the audited transaction wrapper`);
    }
    assert.match(service, /error\.code === 'P2034'[\s\S]*'REVISION_CONFLICT'/u);
    assert.match(service, /adminOperationReceipt\.create\([\s\S]*auditEntryId: result\.auditId/u);
});

test('audit shape is append-only, minimal and linked to operation receipts', () => {
    for (const invariant of [
        'audit_entries_admin_shape_check',
        'audit_entries_operation_key',
        'admin_operation_receipts_audit_key',
        'admin_operation_receipts_immutable',
        'platform_role_grants_transition_guard',
        'user_restrictions_transition_guard',
    ]) {
        assert(migration.includes(invariant), `Missing verification invariant ${invariant}`);
    }
    assert.match(migration, /\("changed_fields" - 'names'\) = '\{\}'::jsonb/u);
    assert.match(migration, /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_entries" FROM PUBLIC/u);
});

test('web admin responses bypass browser caches and TMA source contains no admin implementation', async () => {
    assert.match(adminClient, /cache: 'no-store'/u);
    assert.doesNotMatch(pwaConfig, /admin/u);
    const tmaRoot = new URL('../../frontend/tg/src/', import.meta.url);
    const files = (await readdir(tmaRoot, { recursive: true })).filter(
        (name) => name.endsWith('.ts') || name.endsWith('.tsx')
    );
    const tmaSource = (await Promise.all(files.map((name) => readFile(new URL(name, tmaRoot), 'utf8')))).join('\n');
    assert.doesNotMatch(tmaSource, /admin-client|admin-ui|ADMIN_SESSION_ACCESS|\/admin\//u);
});

test('verification record names the executable evidence and residual production gates', () => {
    for (const evidence of [
        'administration-authorization.spec.ts',
        'administration-verification.integration-spec.ts',
        'admin.spec.ts',
        'PostgreSQL/Redis CI',
        'Production MFA',
    ]) {
        assert(verification.includes(evidence), `Verification record omits ${evidence}`);
    }
});
