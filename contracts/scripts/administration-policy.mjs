import assert from 'node:assert/strict';

export const administrationOperations = {
    '/admin/session': ['get'],
    '/admin/role-grants': ['post'],
    '/admin/role-grants/{grantId}/revoke': ['post'],
    '/admin/users/lookup': ['post'],
    '/admin/cases': ['get'],
    '/admin/cases/{caseId}': ['get'],
    '/admin/cases/{caseId}/assignment': ['post'],
    '/admin/cases/{caseId}/decision': ['post'],
    '/admin/users/{userId}/restrictions': ['post'],
    '/admin/users/{userId}/restrictions/{restrictionId}/revoke': ['post'],
    '/admin/venue-candidates': ['get'],
    '/admin/venue-candidates/{itemId}': ['get'],
    '/admin/venue-candidates/{itemId}/decision': ['post'],
    '/admin/venue-candidates/{itemId}/merge': ['post'],
    '/admin/audit': ['get'],
    '/admin/break-glass-grants': ['post'],
    '/admin/break-glass-grants/{grantId}/revoke': ['post'],
};

export const administrationRoleCapabilities = {
    SUPERADMIN: [
        'ADMIN_SESSION_ACCESS',
        'ROLE_GRANT_MANAGE',
        'USER_LOOKUP',
        'SAFETY_CASE_ROUTE',
        'AUDIT_SEARCH',
        'BREAK_GLASS_MANAGE',
        'CONTENT_SOURCE_READ',
        'CONTENT_SOURCE_GOVERN',
        'CONTENT_EMERGENCY_UNPUBLISH',
    ],
    MODERATOR: [
        'ADMIN_SESSION_ACCESS',
        'USER_LOOKUP',
        'SAFETY_CASE_ROUTE',
        'SAFETY_CASE_DECIDE',
        'USER_RESTRICT',
        'VENUE_MODERATE',
        'AUDIT_SEARCH',
    ],
    EDITOR: [
        'ADMIN_SESSION_ACCESS',
        'CONTENT_SOURCE_READ',
        'CONTENT_SOURCE_PROPOSE',
        'CONTENT_SOURCE_PAUSE',
        'CONTENT_CANDIDATE_REVIEW',
        'CONTENT_EDIT',
        'CONTENT_PREVIEW',
        'CONTENT_PUBLISH',
    ],
    ADS_MANAGER: ['ADMIN_SESSION_ACCESS'],
};

function dereference(document, value) {
    if (value?.$ref) {
        assert(value.$ref.startsWith('#/'), 'Only local references are allowed.');
        return value.$ref
            .slice(2)
            .split('/')
            .reduce((node, key) => node[key], document);
    }
    return value;
}

function parameter(openApi, operation, name) {
    return (operation.parameters ?? []).map((item) => dereference(openApi, item)).find((item) => item.name === name);
}

function hasBearer(openApi, operation) {
    return operation.security?.some((requirement) =>
        Object.keys(requirement).some(
            (name) => openApi.components.securitySchemes[name]?.scheme?.toLowerCase() === 'bearer'
        )
    );
}

export function checkAdministrationContract(openApi) {
    for (const [path, methods] of Object.entries(administrationOperations)) {
        assert(openApi.paths[path], `Missing administration path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort(), `Unexpected methods on ${path}`);
    }
    assert(
        !Object.keys(openApi.paths).some(
            (path) => path.startsWith('/admin/') && /export|download|bulk|print/i.test(path)
        ),
        'MVP administration contract must not expose export, download, print or bulk paths.'
    );

    const mutationIds = new Set([
        'createAdminRoleGrant',
        'revokeAdminRoleGrant',
        'assignAdminCase',
        'decideAdminCase',
        'createAdminUserRestriction',
        'revokeAdminUserRestriction',
        'decideAdminVenueCandidate',
        'mergeAdminVenueCandidate',
        'createAdminBreakGlassGrant',
        'revokeAdminBreakGlassGrant',
    ]);
    for (const [path, methods] of Object.entries(administrationOperations)) {
        for (const method of methods) {
            const operation = openApi.paths[path][method];
            assert(operation['x-admin-capability'], `${operation.operationId} requires an admin capability marker.`);
            assert(operation['x-admin-roles']?.length > 0, `${operation.operationId} requires explicit admin roles.`);
            for (const role of operation['x-admin-roles']) {
                assert(
                    administrationRoleCapabilities[role]?.includes(operation['x-admin-capability']),
                    `${operation.operationId} capability is not present in the fixed registry for ${role}.`
                );
            }
            assert(hasBearer(openApi, operation), `${operation.operationId} requires bearer authentication.`);
            assert(
                operation.security.every((requirement) => Object.keys(requirement).length > 0),
                `${operation.operationId} cannot allow anonymous access.`
            );
            assert(operation.responses['403'], `${operation.operationId} must document capability denial with 403.`);
            assert(operation.responses['404'], `${operation.operationId} must document scope-hidden absence with 404.`);
            for (const responseValue of Object.values(operation.responses)) {
                const response = dereference(openApi, responseValue);
                assert(
                    dereference(openApi, response.headers?.['Cache-Control'])?.required,
                    `${operation.operationId} must disable shared caching.`
                );
            }
            if (mutationIds.has(operation.operationId)) {
                for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
                }
                assert(operation.responses['409'], `${operation.operationId} must document replay/revision conflict.`);
                assert(
                    operation.responses['503'],
                    `${operation.operationId} must fail closed when audit is unavailable.`
                );
            }
        }
    }

    for (const operationId of ['listAdminCases', 'listAdminVenueCandidates', 'searchAdminAudit']) {
        const operation = Object.values(openApi.paths)
            .flatMap((item) => Object.values(item))
            .find((candidate) => candidate?.operationId === operationId);
        assert(parameter(openApi, operation, 'cursor'), `${operationId} requires opaque cursor pagination.`);
        assert.equal(parameter(openApi, operation, 'limit').schema.default, 25);
        assert.equal(parameter(openApi, operation, 'limit').schema.maximum, 100);
        assert.match(operation.description, /bound|связан|actor|snapshot|UTC days/u);
    }
    for (const [operationId, names] of [
        ['listAdminCases', ['state', 'priority', 'assignment', 'age']],
        ['listAdminVenueCandidates', ['kind', 'state', 'sourceClass', 'age']],
    ]) {
        const operation = Object.values(openApi.paths)
            .flatMap((item) => Object.values(item))
            .find((candidate) => candidate?.operationId === operationId);
        for (const name of names) {
            const schema = dereference(openApi, parameter(openApi, operation, name).schema);
            assert(schema.enum?.length > 0, `${operationId}.${name} must be a closed allowlist enum.`);
        }
    }

    const lookup = openApi.paths['/admin/users/lookup'].post;
    assert(!parameter(openApi, lookup, 'query'), 'User lookup secret cannot be a URL query.');
    assert.match(lookup.description, /body/u);
    assert.match(lookup.description, /never logged/u);
    assert(!openApi.paths['/admin/users'], 'Browse-all user endpoint is forbidden.');

    const caseDetail = openApi.paths['/admin/cases/{caseId}'].get;
    assert.match(caseDetail.description, /SUPERADMIN alone is insufficient/u);
    assert.match(caseDetail.description, /indistinguishable 404/u);
    const decision = openApi.paths['/admin/cases/{caseId}/decision'].post;
    assert.match(decision.description, /break-glass never grants decision/u);

    const audit = openApi.components.schemas.AuditEntry;
    assert.deepEqual(Object.keys(audit.properties).sort(), [
        'action',
        'actorId',
        'actorType',
        'auditEntryId',
        'changedFields',
        'correlationId',
        'createdAt',
        'operationId',
        'outcome',
        'policyVersion',
        'reasonCode',
        'requestId',
        'source',
        'targetId',
        'targetType',
    ]);
    assert(
        !Object.keys(audit.properties).some((name) =>
            /email|telegram|narrative|evidence|description|justification|before|after|coordinate|token/i.test(name)
        ),
        'AuditEntry exposes restricted or free-text data.'
    );
    assert.equal(openApi.components.schemas.SafeChangedFields.properties.names.maxItems, 32);

    assert.deepEqual(openApi.components.schemas.PlatformRole.enum, [
        'SUPERADMIN',
        'MODERATOR',
        'EDITOR',
        'ADS_MANAGER',
    ]);
    assert(!openApi.components.schemas.CustomRole, 'Custom role schema is forbidden.');
    assert(!openApi.components.schemas.ExportJob, 'Export jobs are forbidden in the MVP.');
}
