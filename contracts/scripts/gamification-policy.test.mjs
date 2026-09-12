import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

import { checkGamificationContract, gamificationEventFields } from './gamification-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('gamification contract separates private progress, scoped configuration and consented leaderboard', () => {
    assert.doesNotThrow(() => checkGamificationContract(openApi, asyncApi));
    assert.equal(Object.keys(gamificationEventFields).length, 4);
});
