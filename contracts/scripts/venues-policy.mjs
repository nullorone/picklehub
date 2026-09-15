import assert from 'node:assert/strict';

export const venueOperations = {
    '/venues': ['get'],
    '/venues/map': ['get'],
    '/venues/geocoding/suggestions': ['get'],
    '/venues/{venueId}': ['get'],
    '/venues/candidates': ['post'],
    '/venue-candidates/{candidateId}': ['get'],
    '/venues/{venueId}/revisions': ['post'],
    '/venues/{venueId}/reports': ['post'],
};

export const venueEventFields = {
    'venue.candidate.created.v1': ['candidateId', 'sourceMatchId'],
    'venue.verified.v1': ['venueId', 'verificationState'],
    'venue.merged.v1': ['previousVenueId', 'canonicalVenueId'],
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

function isBearerProtected(openApi, operation) {
    return operation.security?.some((requirement) =>
        Object.keys(requirement).some(
            (name) => openApi.components.securitySchemes[name]?.scheme?.toLowerCase() === 'bearer'
        )
    );
}

function parameter(openApi, operation, name) {
    return (operation.parameters ?? []).map((item) => dereference(openApi, item)).find((item) => item.name === name);
}

export function checkVenueContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(venueOperations)) {
        const item = openApi.paths[path];
        assert(item, `Missing venue path ${path}`);
        assert.deepEqual(Object.keys(item).sort(), [...methods].sort(), `Unexpected methods on ${path}`);
    }

    const map = openApi.paths['/venues/map'].get;
    for (const name of ['west', 'south', 'east', 'north']) {
        assert(parameter(openApi, map, name)?.required, `Map search must require ${name}`);
    }
    assert.equal(parameter(openApi, map, 'limit')?.schema?.maximum, 200, 'Map page maximum must be 200.');

    const list = openApi.paths['/venues'].get;
    assert.equal(
        parameter(openApi, list, 'radiusMeters')?.schema?.maximum,
        50000,
        'Radius search maximum must be 50 km.'
    );
    assert.equal(parameter(openApi, list, 'limit')?.schema?.maximum, 100, 'List page maximum must be 100.');

    for (const operation of [map, list]) {
        const cursor = parameter(openApi, operation, 'cursor');
        assert(cursor && !cursor.required, `${operation.operationId} must expose optional cursor pagination.`);
        const responses = Object.keys(operation.responses);
        assert(responses.includes('400') && responses.includes('429'), `${operation.operationId} needs stable errors.`);
    }

    const protectedReads = [
        openApi.paths['/venues/geocoding/suggestions'].get,
        openApi.paths['/venue-candidates/{candidateId}'].get,
    ];
    const mutations = [
        openApi.paths['/venues/candidates'].post,
        openApi.paths['/venues/{venueId}/revisions'].post,
        openApi.paths['/venues/{venueId}/reports'].post,
    ];
    for (const operation of [...protectedReads, ...mutations]) {
        assert(isBearerProtected(openApi, operation), `${operation.operationId} requires bearer auth.`);
        assert(
            operation.security.every((requirement) => Object.keys(requirement).length > 0),
            `${operation.operationId} cannot allow anonymous access.`
        );
    }
    for (const operation of mutations) {
        for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
            const value = parameter(openApi, operation, name);
            assert(
                value && (name === 'Idempotency-Key' ? value.required : !value.required),
                `${operation.operationId} has invalid ${name}.`
            );
        }
    }

    const suggest = openApi.paths['/venues/geocoding/suggestions'].get;
    assert(Object.keys(suggest.responses).includes('503'), 'Geocoding needs a stable unavailable response.');
    const unavailable = dereference(openApi, suggest.responses['503']);
    assert(unavailable.headers?.['Retry-After']?.required, 'Geocoding 503 must require Retry-After.');
    const unavailableBody = dereference(openApi, unavailable.content['application/json'].schema);
    const unavailableError = dereference(openApi, unavailableBody.properties.error);
    const code = dereference(openApi, unavailableError.properties.code);
    assert(
        code.const === 'GEOCODER_TEMPORARILY_UNAVAILABLE' || code.enum?.includes('GEOCODER_TEMPORARILY_UNAVAILABLE'),
        'Geocoding 503 must use the stable provider error code.'
    );

    for (const operation of Object.values(venueOperations).flatMap((methods, index) => {
        const path = Object.keys(venueOperations)[index];
        return methods.map((method) => openApi.paths[path][method]);
    })) {
        for (const rawResponse of Object.values(operation.responses)) {
            const response = dereference(openApi, rawResponse);
            const cacheControl = dereference(openApi, response.headers?.['Cache-Control']);
            assert(cacheControl?.required, `${operation.operationId} must declare Cache-Control.`);
        }
    }

    const candidate = openApi.components.schemas.VenueCandidate;
    assert(candidate, 'VenueCandidate response schema is required.');
    assert(
        !Object.keys(candidate.properties ?? {}).some((name) =>
            /address|latitude|longitude|location|contributor|moderator/i.test(name)
        ),
        'Private venue candidate projection must not expose address, coordinates or identities.'
    );

    const venueChannel = asyncApi.channels.venueEvents;
    assert(venueChannel?.address === 'venue.events.v1', 'Venue events need a separate internal channel.');
    assert.deepEqual(venueChannel.servers, [{ $ref: '#/servers/outbox' }]);
    const messages = Object.values(asyncApi.components.messages).filter((message) => message.name.startsWith('venue.'));
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(venueEventFields).sort());
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert(schema.additionalProperties === false && data.additionalProperties === false);
        assert.deepEqual(Object.keys(data.properties).sort(), [...venueEventFields[message.name]].sort());
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert.equal(schema.properties.type.const, message.name);
        assert(
            !Object.keys(data.properties).some((name) =>
                /address|latitude|longitude|location|query|contributor|moderator/i.test(name)
            ),
            `${message.name} exposes location history or an actor identity.`
        );
    }
    for (const message of Object.values(asyncApi.channels.control.messages)) {
        assert(!dereference(asyncApi, message).name.startsWith('venue.'), 'Venue events cannot use WebSocket control.');
    }
}
