import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

import { checkTournamentContract, tournamentEventFields, tournamentOperations } from './tournaments-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('tournament source contracts use one scoped and privacy-minimized aggregate API', () => {
    assert.doesNotThrow(() => checkTournamentContract(openApi, asyncApi));
    assert(Object.keys(tournamentOperations).length >= 20);
    assert.equal(Object.keys(tournamentEventFields).length, 5);
});
