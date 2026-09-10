import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';
import {
    checkCommunicationContract,
    communicationMessageNames,
    communicationOperations,
} from './communications-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('communications operation and message allowlists are complete', () => {
    assert.equal(Object.values(communicationOperations).flat().length, 15);
    assert.equal(communicationMessageNames.size, 14);
});

test('communications contracts enforce reconnect, authorization and minimized jobs', () => {
    checkCommunicationContract(openApi, asyncApi);
});

test('communications policy rejects an anonymous inbox', () => {
    const changed = structuredClone(openApi);
    delete changed.paths['/notifications'].get.security;
    assert.throws(() => checkCommunicationContract(changed, asyncApi), /requires bearer auth/);
});

test('communications policy rejects chat text in a delivery job', () => {
    const changed = structuredClone(asyncApi);
    changed.components.schemas.NotificationDeliveryRequestedEnvelope.allOf[1].properties.data.properties.text = {
        type: 'string',
    };
    assert.throws(() => checkCommunicationContract(openApi, changed), /sensitive delivery data/);
});
