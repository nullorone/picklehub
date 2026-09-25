import { readFile } from 'node:fs/promises';

const [typespec, openapi] = await Promise.all([
    readFile(new URL('../../contracts/main.tsp', import.meta.url), 'utf8'),
    readFile(new URL('../../contracts/openapi/@typespec/openapi3/openapi.yaml', import.meta.url), 'utf8'),
]);

const sourceRoutes = [...typespec.matchAll(/@route\("([^"]+)"\)/g)].map((match) => match[1]);
const openapiRoutes = [...openapi.matchAll(/^  (\/[^:\n]+):$/gm)].map((match) => match[1]);
const missingRoutes = sourceRoutes.filter((route) => !openapiRoutes.includes(route));
const extraRoutes = openapiRoutes.filter((route) => !sourceRoutes.includes(route));

if (missingRoutes.length > 0 || extraRoutes.length > 0) {
    process.stderr.write(
        `REST contract mismatch; missing from OpenAPI: ${missingRoutes.join(', ') || 'none'}; ` +
            `not declared by TypeSpec: ${extraRoutes.join(', ') || 'none'}\n`,
    );
    process.exitCode = 1;
} else if (openapiRoutes.some((route) => route.startsWith('/health'))) {
    process.stderr.write('Health endpoints are operational and must stay outside the public product contract\n');
    process.exitCode = 1;
} else {
    process.stdout.write(`REST routes match TypeSpec (${sourceRoutes.length} paths); health endpoints are internal\n`);
}
