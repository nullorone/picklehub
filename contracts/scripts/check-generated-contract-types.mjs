import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateContractTypes } from './generate-contract-types.mjs';
import { generateOpenApi } from './generate-openapi.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const committed = resolve(repositoryRoot, 'contracts/generated');
const temporary = await mkdtemp(join(tmpdir(), 'picklehub-contract-types-'));

try {
    generateOpenApi(temporary);
    const generatedTypes = resolve(temporary, 'types');
    await generateContractTypes(generatedTypes, resolve(temporary, 'openapi.yaml'));
    const [expectedOpenApi, committedOpenApi] = await Promise.all([
        readFile(resolve(temporary, 'openapi.yaml')),
        readFile(resolve(repositoryRoot, 'openapi.yaml')),
    ]);
    if (!expectedOpenApi.equals(committedOpenApi)) {
        throw new Error('openapi.yaml is stale. Run npm run contracts:generate.');
    }

    const expectedFiles = (await readdir(generatedTypes)).sort();
    const committedFiles = (await readdir(committed)).sort();
    if (JSON.stringify(expectedFiles) !== JSON.stringify(committedFiles)) {
        throw new Error(`Generated file set differs: expected ${expectedFiles}, committed ${committedFiles}.`);
    }
    for (const file of expectedFiles) {
        const [expected, actual] = await Promise.all([
            readFile(resolve(generatedTypes, file)),
            readFile(resolve(committed, file)),
        ]);
        if (!expected.equals(actual)) {
            throw new Error(`${file} is stale. Run npm run contracts:generate.`);
        }
    }
    console.log(`Generated OpenAPI and contract types are reproducible (${expectedFiles.join(', ')}).`);
} finally {
    await rm(temporary, { force: true, recursive: true });
}
