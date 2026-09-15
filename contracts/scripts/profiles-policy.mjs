import assert from 'node:assert/strict';

export const profileOperations = {
    '/me/profile': ['get', 'patch'],
    '/me/profile/privacy': ['get', 'patch'],
    '/me/profile/external-links/dupr': ['put', 'delete'],
    '/me/profile/avatar-uploads': ['post'],
    '/me/profile/avatar': ['delete'],
    '/me/match-history': ['get'],
    '/me/statistics': ['get'],
    '/players/{playerId}': ['get'],
    '/players/{playerId}/match-history': ['get'],
    '/players/{playerId}/statistics': ['get'],
};

export const profileEventFields = {
    'profile.changed.v1': ['profileId', 'profileVersion', 'change'],
    'profile.statistics.source.changed.v1': ['sourceId', 'sourceRevision', 'sourceKind'],
    'profile.statistics.rebuild.requested.v1': ['generationId', 'snapshotRevision', 'reason'],
    'profile.statistics.rebuild.completed.v1': ['generationId', 'snapshotRevision', 'outcome'],
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

function allowsAnonymous(operation) {
    return operation.security?.some((requirement) => Object.keys(requirement).length === 0);
}

export function checkProfileContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(profileOperations)) {
        assert(openApi.paths[path], `Missing profile path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort(), `Unexpected methods on ${path}`);
    }

    const publicOperationIds = new Set([
        'getPublicPlayerProfile',
        'listPublicPlayerMatchHistory',
        'getPublicPlayerStatistics',
    ]);
    const readOperationIds = new Set([
        'getOwnPlayerProfile',
        'getProfilePrivacySettings',
        'listOwnMatchHistory',
        'getOwnPlayerStatistics',
        ...publicOperationIds,
    ]);

    for (const [path, methods] of Object.entries(profileOperations)) {
        for (const method of methods) {
            const operation = openApi.paths[path][method];
            assert(hasBearer(openApi, operation), `${operation.operationId} must accept bearer authentication.`);
            assert.equal(
                allowsAnonymous(operation),
                publicOperationIds.has(operation.operationId),
                `${operation.operationId} has the wrong anonymous access policy.`
            );
            for (const responseValue of Object.values(operation.responses)) {
                const response = dereference(openApi, responseValue);
                assert(
                    dereference(openApi, response.headers?.['Cache-Control'])?.required,
                    `${operation.operationId} must explicitly disable shared caching.`
                );
            }
            if (!readOperationIds.has(operation.operationId)) {
                for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    const value = parameter(openApi, operation, name);
                    assert(
                        value && (name === 'Idempotency-Key' ? value.required : !value.required),
                        `${operation.operationId} has invalid ${name}.`
                    );
                }
                const body = dereference(openApi, operation.requestBody?.content?.['application/json']?.schema);
                assert(
                    body?.required?.includes('expectedVersion'),
                    `${operation.operationId} requires expectedVersion.`
                );
            }
        }
    }

    const publicProfile = openApi.components.schemas.PublicPlayerProfile;
    for (const forbidden of ['email', 'telegram', 'timeZone', 'consent', 'version', 'block', 'report', 'credential']) {
        assert(
            !Object.keys(publicProfile.properties).some((field) =>
                field.toLowerCase().includes(forbidden.toLowerCase())
            ),
            `Public profile must not expose ${forbidden}.`
        );
    }
    assert.deepEqual(
        Object.keys(publicProfile.properties).sort(),
        [
            'avatarUrl',
            'displayName',
            'externalProfileLink',
            'gameFormats',
            'locality',
            'playerId',
            'skillSelfAssessment',
            'statistics',
            'updatedAt',
        ].sort()
    );
    assert.match(publicProfile.properties.skillSelfAssessment.description, /not verified/u);

    const externalLink = openApi.components.schemas.PublicExternalProfileLink;
    assert.deepEqual(externalLink.properties.label.enum, ['EXTERNAL_NOT_VERIFIED_OR_SYNCED']);
    assert(!('rating' in externalLink.properties));
    assert.match(openApi.paths['/me/profile/external-links/dupr'].put.description, /never fetches or scrapes DUPR/u);

    const statistics = openApi.components.schemas.PlayerStatistics;
    const publicStatistics = openApi.components.schemas.PublicPlayerStatistics;
    const totals = openApi.components.schemas.StatisticTotals;
    assert.equal(statistics.properties.totals.minItems, 3);
    assert.equal(statistics.properties.totals.maxItems, 3);
    assert('winRateNumerator' in totals.properties && 'winRateDenominator' in totals.properties);
    assert(!('winRate' in totals.properties), 'Rounded win rate must not be a stored source field.');
    assert(!('confirmedNoShows' in publicStatistics.properties));
    assert(!('organizedFailures' in publicStatistics.properties));

    for (const operationId of ['listOwnMatchHistory', 'listPublicPlayerMatchHistory']) {
        const operation = Object.values(openApi.paths)
            .flatMap((pathItem) => Object.values(pathItem))
            .find((candidate) => candidate?.operationId === operationId);
        assert(parameter(openApi, operation, 'cursor'), `${operationId} needs an opaque cursor.`);
        assert.equal(parameter(openApi, operation, 'limit').schema.maximum, 100);
    }
    assert.match(openApi.paths['/players/{playerId}/match-history'].get.description, /only PUBLIC COMPLETED/u);
    assert.match(openApi.paths['/players/{playerId}'].get.description, /same PROFILE_NOT_AVAILABLE/u);

    const upload = openApi.components.schemas.AvatarUploadPolicy;
    assert.equal(upload.properties.maxBytes.maximum, 5242880);
    assert.deepEqual(upload.properties.method.enum, ['PUT']);
    assert.match(openApi.paths['/me/profile/avatar-uploads'].post.description, /five-minute single-object PUT/u);

    const channel = asyncApi.channels.profileEvents;
    assert.equal(channel?.address, 'profile.events.v1');
    assert.deepEqual(channel.servers, [{ $ref: '#/servers/outbox' }]);
    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        message.name.startsWith('profile.')
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(profileEventFields).sort());
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert.equal(schema.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert(
            !Object.keys(data.properties).some((name) =>
                /name|locality|level|dupr|url|avatar|object|score|point|total|report|evidence|blocker|blocked/i.test(
                    name
                )
            ),
            `${message.name} exposes a forbidden profile field.`
        );
        assert.deepEqual(Object.keys(data.properties).sort(), [...profileEventFields[message.name]].sort());
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert.equal(schema.properties.type.const, message.name);
    }
}
