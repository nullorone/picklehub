import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';
import { checkTrustSafetyContract } from './trust-safety-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('trust/safety contract keeps receipts minimal and mutations protected', () => {
    assert.doesNotThrow(() => checkTrustSafetyContract(openApi, asyncApi));
});

test('a receipt cannot acquire another party or internal case data', () => {
    const changed = structuredClone(openApi);
    changed.components.schemas.SafetyReceipt.properties.reporterId = { $ref: '#/components/schemas/Uuid' };
    assert.throws(() => checkTrustSafetyContract(changed, asyncApi), /Safety receipt must not expose reporterId/);
});

test('trust/safety events reject subject and evidence fields', () => {
    const changed = structuredClone(asyncApi);
    const data = changed.components.schemas.SafetySignalReceivedEnvelope.properties.data;
    data.properties.subjectId = { $ref: '#/components/schemas/Uuid' };
    data.required.push('subjectId');
    assert.throws(() => checkTrustSafetyContract(openApi, changed), /forbidden trust\/safety field/);
});
