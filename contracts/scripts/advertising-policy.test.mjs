import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';
import { checkAdvertisingContract } from './advertising-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('advertising wire contracts preserve contextual privacy and explicit delivery states', () => {
    checkAdvertisingContract(openApi, asyncApi);
});
