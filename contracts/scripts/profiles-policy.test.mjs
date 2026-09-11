import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';
import { checkProfileContract } from './profiles-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('profile contract policy accepts the generated contracts', () => {
    assert.doesNotThrow(() => checkProfileContract(openApi, asyncApi));
});

test('public profile schema cannot acquire private owner fields', () => {
    const changed = structuredClone(openApi);
    changed.components.schemas.PublicPlayerProfile.properties.timeZone = { type: 'string' };
    assert.throws(() => checkProfileContract(changed, asyncApi), /Public profile must not expose timeZone/);
});

test('owner and public profile schemas keep an explicit privacy snapshot', () => {
    assert.deepEqual(Object.keys(openApi.components.schemas.PlayerProfile.properties).sort(), [
        'avatar',
        'displayName',
        'externalProfileLink',
        'gameFormats',
        'locality',
        'playerId',
        'skillSelfAssessment',
        'statistics',
        'timeZone',
        'updatedAt',
        'version',
        'visibility',
    ]);
    assert.deepEqual(Object.keys(openApi.components.schemas.PublicPlayerProfile.properties).sort(), [
        'avatarUrl',
        'displayName',
        'externalProfileLink',
        'gameFormats',
        'locality',
        'playerId',
        'skillSelfAssessment',
        'statistics',
        'updatedAt',
    ]);
    assert.deepEqual(Object.keys(openApi.components.schemas.PlayerStatistics.properties).sort(), [
        'attendance',
        'calculatedAt',
        'reliability',
        'state',
        'totals',
    ]);
    assert.deepEqual(Object.keys(openApi.components.schemas.PublicPlayerStatistics.properties).sort(), [
        'attendance',
        'attendanceAvailable',
        'calculatedAt',
        'reliability',
        'state',
        'totals',
    ]);
});

test('profile events reject personal or score fields', () => {
    const changed = structuredClone(asyncApi);
    const schema = changed.components.schemas.ProfileStatisticsSourceChangedEnvelope;
    schema.properties.data.properties.score = { type: 'integer' };
    schema.properties.data.required.push('score');
    assert.throws(() => checkProfileContract(openApi, changed), /forbidden profile field/);
});
