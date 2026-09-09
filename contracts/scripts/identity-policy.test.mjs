import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { checkIdentityContract } from './identity-policy.mjs';

const openApi = parse(readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(readFileSync(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('identity policy accepts the published contract', () => checkIdentityContract(openApi, asyncApi));

for (const [name, mutate] of [
    [
        'cacheable auth errors',
        (api) => {
            delete api.paths['/auth/telegram'].post.responses['401'].headers['Cache-Control'];
        },
    ],
    [
        'anonymous self access',
        (api) => {
            api.paths['/me'].get.security = [{}];
        },
    ],
    [
        'missing CSRF protection',
        (api) => {
            api.paths['/auth/magic-links/consume'].post.parameters = api.paths[
                '/auth/magic-links/consume'
            ].post.parameters.filter(
                (parameter) => parameter.$ref !== '#/components/parameters/BrowserMutationHeaders.csrfToken'
            );
        },
    ],
    [
        'credential replay through idempotency',
        (api) => {
            api.paths['/auth/refresh'].post.parameters.push({ in: 'header', name: 'Idempotency-Key', required: true });
        },
    ],
    [
        'private subject in identity response',
        (api) => {
            api.components.schemas.Identity.properties.email = { type: 'string' };
        },
    ],
    [
        'email in domain events',
        (_api, events) => {
            events.components.schemas.IdentityLinkedEnvelope.properties.data.properties.email = { type: 'string' };
        },
    ],
    [
        'domain event broadcast',
        (_api, events) => {
            events.channels.control.messages.IdentityLinked = { $ref: '#/components/messages/IdentityLinked' };
        },
    ],
]) {
    test(`identity policy rejects ${name}`, () => {
        const api = structuredClone(openApi);
        const events = structuredClone(asyncApi);
        mutate(api, events);
        assert.throws(() => checkIdentityContract(api, events));
    });
}
