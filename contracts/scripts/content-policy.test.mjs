import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';
import { checkContentContract, contentEventFields, contentOperations } from './content-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));

test('content contract policy passes', () => {
    checkContentContract(openApi, asyncApi);
});

test('content operation and event registries are closed', () => {
    assert.equal(
        Object.values(contentOperations).reduce((total, methods) => total + methods.length, 0),
        23
    );
    assert.deepEqual(Object.keys(contentEventFields).sort(), [
        'content.article.published.v1',
        'content.article.unpublished.v1',
    ]);
});
