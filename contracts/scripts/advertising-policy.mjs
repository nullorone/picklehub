import assert from 'node:assert/strict';

export const advertisingOperations = {
    '/advertising/decisions': ['post'],
    '/advertising/impressions': ['post'],
    '/advertising/clicks': ['post'],
    '/admin/advertising/placements': ['get', 'post'],
    '/admin/advertising/placements/{placementId}': ['put'],
    '/admin/advertising/campaigns': ['get', 'post'],
    '/admin/advertising/campaigns/{campaignId}': ['get'],
    '/admin/advertising/campaigns/{campaignId}/revisions': ['post'],
    '/admin/advertising/campaigns/{campaignId}/decisions': ['post'],
    '/admin/advertising/campaigns/{campaignId}/pause': ['post'],
    '/admin/advertising/campaigns/{campaignId}/resume': ['post'],
    '/admin/advertising/creatives': ['post'],
    '/admin/advertising/creatives/{creativeId}': ['get'],
    '/admin/advertising/providers': ['get'],
    '/admin/advertising/providers/{providerCode}/state': ['post'],
    '/admin/advertising/reports': ['post'],
};

export const advertisingEventFields = {
    'advertising.delivery.issued.v1': [
        'deliveryId',
        'campaignId',
        'campaignRevisionId',
        'creativeId',
        'placementId',
        'source',
        'outcome',
    ],
    'advertising.impression.viewable.v1': [
        'deliveryId',
        'campaignId',
        'campaignRevisionId',
        'creativeId',
        'placementId',
        'outcome',
    ],
    'advertising.click.validated.v1': [
        'deliveryId',
        'campaignId',
        'campaignRevisionId',
        'creativeId',
        'placementId',
        'outcome',
    ],
};

const roleCapabilities = {
    ADS_MANAGER: [
        'AD_PLACEMENT_MANAGE',
        'AD_CAMPAIGN_MANAGE',
        'AD_CREATIVE_MANAGE',
        'AD_CAMPAIGN_REVIEW',
        'AD_CAMPAIGN_PAUSE',
        'AD_REPORT_READ',
    ],
    SUPERADMIN: ['AD_PROVIDER_GOVERN'],
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

export function checkAdvertisingContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(advertisingOperations)) {
        assert(openApi.paths[path], `Missing advertising path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort());
    }

    for (const path of ['/advertising/decisions', '/advertising/impressions', '/advertising/clicks']) {
        const operation = openApi.paths[path].post;
        assert.deepEqual(operation.security, [{}], `${operation.operationId} must allow an anonymous session.`);
        for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
            assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
        }
    }

    for (const [path, item] of Object.entries(openApi.paths)) {
        if (!path.startsWith('/admin/advertising')) continue;
        for (const [method, operation] of Object.entries(item)) {
            assert(
                operation.security?.some((entry) => entry.BearerAuth),
                `${operation.operationId} requires bearer.`
            );
            assert(operation['x-admin-capability'], `${operation.operationId} requires a capability.`);
            assert(operation['x-admin-roles']?.length > 0, `${operation.operationId} requires fixed roles.`);
            for (const role of operation['x-admin-roles']) {
                assert(
                    roleCapabilities[role]?.includes(operation['x-admin-capability']),
                    `${operation.operationId} exceeds ${role} advertising capabilities.`
                );
            }
            if (method !== 'get') {
                for (const name of ['Origin', 'X-CSRF-Token']) {
                    assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
                }
            }
        }
    }

    const context = openApi.components.schemas.AdDecisionContext;
    for (const forbidden of [
        'userId',
        'sessionId',
        'deviceId',
        'advertisingId',
        'ip',
        'latitude',
        'longitude',
        'url',
        'query',
        'objectId',
        'profile',
        'dupr',
        'xp',
        'history',
        'interest',
    ]) {
        assert(!(forbidden in context.properties), `Decision context must not expose ${forbidden}.`);
    }
    assert.deepEqual(openApi.components.schemas.AdDecisionSource.enum, [
        'DIRECT',
        'EXTERNAL_FALLBACK',
        'HOUSE',
        'NO_FILL',
    ]);
    assert(openApi.components.schemas.AdNoFillDecision, 'NO_FILL must be an explicit result.');
    assert(openApi.components.schemas.AdViewableImpressionInput, 'Viewable impression input is required.');
    assert(openApi.components.schemas.AdClickReceipt, 'Click receipt is required.');
    assert.equal(openApi.components.schemas.AdCreativeDecision.properties.refreshAfterSeconds.enum[0], 300);
    assert.equal(openApi.components.schemas.AdReport.properties.minimumCohortSize.enum[0], 20);

    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        message.name.startsWith('advertising.')
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(advertisingEventFields).sort());
    const forbiddenEventFields = new Set([
        'capSubject',
        'capToken',
        'userId',
        'sessionId',
        'deviceId',
        'advertisingId',
        'ip',
        'coordinates',
        'url',
        'query',
        'landingUrl',
        'creativeBody',
        'fraudReason',
    ]);
    for (const message of messages) {
        const envelope = dereference(asyncApi, message.payload);
        const data = envelope.properties.data;
        assert.equal(envelope.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert.deepEqual(Object.keys(data.properties).sort(), advertisingEventFields[message.name].sort());
        assert(
            !Object.keys(data.properties).some((field) => forbiddenEventFields.has(field)),
            `${message.name} leaks data.`
        );
    }
}
