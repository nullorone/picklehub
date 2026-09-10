import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from 'yaml';
import { checkMatchContract } from './matches-policy.mjs';

const openApi = parse(readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(readFileSync(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('match policy accepts the published contracts', () => checkMatchContract(openApi, asyncApi));

for (const [name, mutate] of [
    [
        'unbounded discovery radius',
        (api) => {
            api.components.parameters['MatchSearchFilters.radiusMeters'].schema.maximum = 100000;
        },
    ],
    [
        'anonymous join',
        (api) => {
            api.paths['/matches/{matchId}/join'].post.security = [{}];
        },
    ],
    [
        'join without idempotency',
        (api) => {
            api.paths['/matches/{matchId}/join'].post.parameters = api.paths[
                '/matches/{matchId}/join'
            ].post.parameters.filter((parameter) => parameter.$ref !== '#/components/parameters/MutationKey');
        },
    ],
    [
        'short invite capabilities',
        (api) => {
            api.components.schemas.MatchInviteToken.minLength = 8;
        },
    ],
    [
        'score in a domain event',
        (_api, events) => {
            events.components.schemas.MatchResultProposedEnvelope.properties.data.properties.score = {
                type: 'string',
            };
        },
    ],
]) {
    test(`match policy rejects ${name}`, () => {
        const api = structuredClone(openApi);
        const events = structuredClone(asyncApi);
        mutate(api, events);
        assert.throws(() => checkMatchContract(api, events));
    });
}
