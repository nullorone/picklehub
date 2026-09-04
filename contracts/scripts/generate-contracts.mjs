import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateContractTypes } from './generate-contract-types.mjs';
import { generateOpenApi } from './generate-openapi.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

generateOpenApi(repositoryRoot);
await generateContractTypes(resolve(repositoryRoot, 'contracts/generated'));
console.log('Generated OpenAPI and TypeScript contract artifacts.');
