import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { checkVenueContract } from './venues-policy.mjs';

const openApi = parse(readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(readFileSync(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('venue policy accepts the published contracts', () => checkVenueContract(openApi, asyncApi));

for (const [name, mutate] of [
    [
        'an excessive radius',
        (api) => {
            const parameter = api.paths['/venues'].get.parameters.find((item) => item.name === 'radiusMeters');
            parameter.schema.maximum = 100000;
        },
    ],
    [
        'anonymous candidate creation',
        (api) => {
            api.paths['/venues/candidates'].post.security = [{}];
        },
    ],
    [
        'candidate creation without idempotency',
        (api) => {
            api.paths['/venues/candidates'].post.parameters = api.paths['/venues/candidates'].post.parameters.filter(
                (parameter) => parameter.$ref !== '#/components/parameters/MutationKey'
            );
        },
    ],
    [
        'coordinates in candidate status',
        (api) => {
            api.components.schemas.VenueCandidate.properties.latitude = { type: 'number' };
        },
    ],
    [
        'unstable geocoder outage code',
        (api) => {
            api.paths['/venues/geocoding/suggestions'].get.responses['503'].content[
                'application/json'
            ].schema.properties.error.properties.code = {
                type: 'string',
                const: 'PROVIDER_FAILED',
            };
        },
    ],
    [
        'coordinates in a domain event',
        (_api, events) => {
            events.components.schemas.VenueVerifiedEnvelope.properties.data.properties.latitude = { type: 'number' };
        },
    ],
    [
        'venue events on WebSocket control',
        (_api, events) => {
            events.channels.control.messages.VenueMerged = { $ref: '#/components/messages/VenueMerged' };
        },
    ],
]) {
    test(`venue policy rejects ${name}`, () => {
        const api = structuredClone(openApi);
        const events = structuredClone(asyncApi);
        mutate(api, events);
        assert.throws(() => checkVenueContract(api, events));
    });
}
