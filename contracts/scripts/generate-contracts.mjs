import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateContractTypes } from './generate-contract-types.mjs';
import { generateOpenApi } from './generate-openapi.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

generateOpenApi(repositoryRoot);
await generateContractTypes(resolve(repositoryRoot, 'contracts/generated'));
const apiClientGenerated = resolve(repositoryRoot, 'frontend/packages/api-client/src/generated');
await mkdir(apiClientGenerated, { recursive: true });
await copyFile(resolve(repositoryRoot, 'contracts/generated/openapi.ts'), resolve(apiClientGenerated, 'openapi.ts'));
console.log('Generated OpenAPI and TypeScript contract artifacts.');
