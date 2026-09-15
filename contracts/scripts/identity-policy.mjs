import assert from 'node:assert/strict';

// Exact method/path inventory: adding an operation requires an owning feature change.
export const identityOperations = {
    '/auth/context': ['get'],
    '/auth/telegram': ['post'],
    '/auth/magic-links/request': ['post'],
    '/auth/magic-links/consume': ['post'],
    '/auth/refresh': ['post'],
    '/auth/logout': ['post'],
    '/auth/logout-all': ['post'],
    '/auth/mobile/magic-links/request': ['post'],
    '/auth/mobile/magic-links/consume': ['post'],
    '/auth/mobile/refresh': ['post'],
    '/auth/mobile/logout': ['post'],
    '/me': ['get'],
    '/me/identities': ['get'],
    '/me/identity-attempts': ['post'],
    '/me/identity-attempts/{attemptId}': ['get'],
    '/me/identity-attempts/{attemptId}/telegram': ['post'],
    '/me/identity-attempts/{attemptId}/email/request': ['post'],
    '/me/identity-attempts/{attemptId}/email/consume': ['post'],
    '/me/identities/link': ['post'],
    '/me/identities/{identityId}/unlink': ['post'],
    '/me/onboarding': ['get', 'patch'],
    '/me/onboarding/complete': ['post'],
    '/me/consents': ['get', 'post'],
    '/me/deletion': ['post'],
    '/identity/documents': ['get'],
    '/identity/documents/{purpose}/{version}': ['get'],
    '/identity/onboarding-options': ['get'],
    '/identity/onboarding-options/localities': ['get'],
};

export const identityEventFields = {
    'identity.linked.v1': ['userId', 'identityId', 'provider'],
    'identity.unlinked.v1': ['userId', 'identityId', 'provider'],
    'identity.sessions.revoked.v1': ['userId', 'scope', 'reason'],
    'identity.onboarding.completed.v1': ['userId'],
    'identity.consent.changed.v1': ['userId', 'purpose', 'action'],
    'identity.account.deletion.requested.v1': ['userId'],
};

function dereference(document, value) {
    if (value?.$ref) {
        assert(value.$ref.startsWith('#/'), 'Only local contract references are allowed.');
        return value.$ref
            .slice(2)
            .split('/')
            .reduce((node, key) => node[key], document);
    }
    return value;
}

function hasSingleStringValue(schema, expected) {
    return schema?.const === expected || (schema?.enum?.length === 1 && schema.enum[0] === expected);
}

const mutationKeys = new Set([
    'startIdentityAttempt',
    'updateOnboardingDraft',
    'completeOnboarding',
    'changeMyConsent',
]);
const cookieOperations = new Set([
    'getBrowserAuthContext',
    'exchangeTelegramInitData',
    'consumeMagicLink',
    'refreshSession',
    'logoutSession',
    'logoutAllSessions',
    'linkIdentity',
    'unlinkIdentity',
    'requestAccountDeletion',
]);
const browserAnonymousMutations = new Set([
    'exchangeTelegramInitData',
    'requestMagicLink',
    'consumeMagicLink',
    'refreshSession',
    'logoutSession',
]);
const nativeAnonymousMutations = new Set([
    'requestNativeMagicLink',
    'consumeNativeMagicLink',
    'refreshNativeSession',
    'logoutNativeSession',
]);

export function checkIdentityContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(identityOperations)) {
        const item = openApi.paths[path];
        assert(item, `Missing identity path ${path}`);
        assert.deepEqual(Object.keys(item).sort(), [...methods].sort(), `Unexpected methods on ${path}`);
        for (const method of methods) {
            const operation = item[method];
            for (const [status, rawResponse] of Object.entries(operation.responses)) {
                const response = dereference(openApi, rawResponse);
                const header = dereference(openApi, response.headers?.['Cache-Control']);
                assert(
                    header?.required && hasSingleStringValue(header.schema, 'no-store'),
                    `${operation.operationId} ${status} requires no-store`
                );
                if (['429', '503'].includes(status)) {
                    assert(response.headers?.['Retry-After']?.required, `${status} requires Retry-After`);
                }
                if (status.startsWith('2') && cookieOperations.has(operation.operationId)) {
                    const cookie = dereference(openApi, response.headers?.['Set-Cookie']);
                    assert(
                        cookie?.required && cookie.schema?.type === 'string',
                        `${operation.operationId} must model Set-Cookie as one HTTP header value`
                    );
                }
            }
            const parameters = (operation.parameters ?? []).map((value) => dereference(openApi, value));
            if (method !== 'get') {
                for (const name of ['Origin', 'X-CSRF-Token']) {
                    const header = parameters.find((p) => p.in === 'header' && p.name === name);
                    if (browserAnonymousMutations.has(operation.operationId)) {
                        assert(header?.required, `${operation.operationId} requires ${name}`);
                    } else if (nativeAnonymousMutations.has(operation.operationId)) {
                        assert(!header, `${operation.operationId} must not accept browser ${name}`);
                    } else {
                        assert(header && !header.required, `${operation.operationId} requires conditional ${name}`);
                    }
                }
                const key = parameters.find((p) => p.name === 'Idempotency-Key');
                assert(
                    mutationKeys.has(operation.operationId) ? key?.required : !key,
                    `${operation.operationId} has incorrect idempotency semantics`
                );
            }
            if (
                path.startsWith('/me') ||
                path.startsWith('/identity/onboarding-options') ||
                path === '/auth/logout-all'
            ) {
                assert(
                    operation.security?.some((requirement) =>
                        Object.keys(requirement).some(
                            (name) => openApi.components.securitySchemes[name]?.scheme?.toLowerCase() === 'bearer'
                        )
                    ),
                    `${operation.operationId} requires bearer auth`
                );
                assert(
                    operation.security.every((requirement) => Object.keys(requirement).length > 0),
                    'Protected operations cannot allow anonymous access'
                );
            }
        }
    }
    const refresh = openApi.paths['/auth/refresh'].post;
    const nativeRefresh = openApi.paths['/auth/mobile/refresh'].post;
    const magicRequest = openApi.paths['/auth/magic-links/request'].post;
    assert.deepEqual(
        Object.keys(magicRequest.responses).sort(),
        ['202', '400', '403', '429', '503'],
        'Magic-link requests must not expose lookup-dependent responses'
    );
    const magicAccepted = dereference(openApi, magicRequest.responses['202']);
    const magicAcceptedBody = dereference(openApi, magicAccepted.content['application/json'].schema);
    assert(
        !Object.keys(magicAcceptedBody.properties ?? {}).some((key) => /email|exists|registered|delivered/i.test(key)),
        'Magic-link acceptance must not reveal account or delivery state'
    );
    assert(refresh.security?.length === 1, 'Refresh must use a single cookie scheme');
    const [schemeName] = Object.keys(refresh.security[0]);
    const scheme = openApi.components.securitySchemes[schemeName];
    assert(
        scheme.in === 'cookie' && scheme.name === '__Secure-ph-refresh',
        'Refresh must use the HttpOnly refresh cookie'
    );
    const request = dereference(openApi, refresh.requestBody.content['application/json'].schema);
    assert(
        !request.properties || Object.keys(request.properties).length === 0,
        'Refresh must not accept credentials in JSON'
    );
    for (const name of ['User', 'Identity', 'Session', 'Me', 'PlayerProfileDraft', 'Consent']) {
        const schema = openApi.components.schemas[name];
        assert(
            schema &&
                !Object.keys(schema.properties ?? {}).some((key) =>
                    /token|hash|ciphertext|email|subject|initdata/i.test(key)
                ),
            `${name} exposes secret/private identity internals`
        );
    }
    assert(
        Object.entries(openApi.components.schemas).every(
            ([name, schema]) =>
                name === 'NativeAuthenticatedSession' ||
                name === 'NativeRefreshRequest' ||
                !Object.keys(schema.properties ?? {}).some((key) => /refreshToken/i.test(key))
        ),
        'Only native request/response schemas may carry refresh credentials in JSON'
    );
    assert.deepEqual(nativeRefresh.security, [{}], 'Native refresh must not depend on an ambient cookie.');
    const nativeRefreshBody = dereference(openApi, nativeRefresh.requestBody.content['application/json'].schema);
    assert(nativeRefreshBody.required.includes('refreshToken'), 'Native refresh must require its body credential.');
    assert.deepEqual(openApi.components.schemas.ClientPlatform.enum, ['WEB', 'TMA', 'MOBILE']);
    const domainChannel = asyncApi.channels.identityEvents;
    assert(domainChannel?.address === 'identity.events.v1', 'Identity events need a separate internal channel');
    assert.deepEqual(
        domainChannel.servers,
        [{ $ref: '#/servers/outbox' }],
        'Domain events must not use the WebSocket server'
    );
    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        message.name.startsWith('identity.')
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(identityEventFields).sort());
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert(
            schema.additionalProperties === false && data.additionalProperties === false,
            'Domain envelopes and data must be sealed'
        );
        assert.deepEqual(
            Object.keys(data.properties).sort(),
            [...identityEventFields[message.name]].sort(),
            `${message.name} contains unapproved event fields`
        );
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert(schema.properties.type.const === message.name, 'Domain event discriminator must match its name');
        for (const [field, value] of Object.entries(data.properties)) {
            if (field.endsWith('Id')) {
                assert(value.$ref === '#/components/schemas/Uuid', 'Event IDs must be opaque UUIDs');
            } else {
                assert(
                    value.type === 'string' && value.enum?.length > 0,
                    'Only fixed enums and opaque IDs are allowed in event data'
                );
            }
        }
    }
    for (const message of Object.values(asyncApi.channels.control.messages)) {
        assert(
            !dereference(asyncApi, message).name.startsWith('identity.'),
            'Internal events cannot be exposed on WebSocket control'
        );
    }
}
