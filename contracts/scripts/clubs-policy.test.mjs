import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

import { checkClubContract, clubEventFields, clubOperations } from './clubs-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('club source contracts satisfy scoped and privacy-minimized policy', () => {
    assert.doesNotThrow(() => checkClubContract(openApi, asyncApi));
    assert(Object.keys(clubOperations).length >= 25);
    assert(Object.keys(clubEventFields).length >= 6);
});
