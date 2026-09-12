import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const migration = await readFile(
    new URL('../../backend/prisma/migrations/20260912170000_tournaments_contract_data/migration.sql', import.meta.url),
    'utf8'
);
const idempotency = await readFile(
    new URL('../../backend/src/tournaments/tournament-idempotency.service.ts', import.meta.url),
    'utf8'
);
const transactionPort = await readFile(
    new URL('../../backend/src/tournaments/tournament-transaction.port.ts', import.meta.url),
    'utf8'
);
const registry = await readFile(
    new URL('../../backend/src/tournaments/tournament-strategy.registry.ts', import.meta.url),
    'utf8'
);
const tournamentSources = `${idempotency}\n${transactionPort}\n${registry}`;

function tournamentOperations(methods) {
    return Object.entries(openApi.paths)
        .filter(([path]) => path.startsWith('/tournaments'))
        .flatMap(([path, item]) =>
            methods.flatMap((method) => (item[method] === undefined ? [] : [{ method, path, operation: item[method] }]))
        );
}

test('every tournament mutation requires bearer, browser integrity and a UUIDv4 idempotency key', () => {
    const mutations = tournamentOperations(['post', 'put', 'patch']);
    assert.equal(mutations.length, 18);
    for (const { method, operation, path } of mutations) {
        assert.deepEqual(operation.security, [{ BearerAuth: [] }], `${method.toUpperCase()} ${path} bearer`);
        const references = new Set(
            operation.parameters.flatMap((parameter) =>
                '$ref' in parameter && typeof parameter.$ref === 'string' ? [parameter.$ref] : []
            )
        );
        assert(references.has('#/components/parameters/BrowserMutationHeaders.origin'), `${path} Origin`);
        assert(references.has('#/components/parameters/BrowserMutationHeaders.csrfToken'), `${path} CSRF`);
        assert(references.has('#/components/parameters/MutationKey'), `${path} idempotency`);
    }
});

test('authorization storage is tournament-scoped and has exactly one active organizer', () => {
    assert.match(migration, /tournament_roles_active_user_key/u);
    assert.match(migration, /tournament_roles_active_organizer_key/u);
    assert.match(migration, /tournament_roles_exact_organizer_guard/u);
    assert.match(migration, /WHERE "tournament_id" = checked_tournament_id AND "active"/u);
    assert.doesNotMatch(migration, /platform_role|SUPERADMIN|MODERATOR|ADS_MANAGER|EDITOR/u);
});

test('API replay is actor/path scoped, encrypted and committed in the serializable transaction', () => {
    assert.match(idempotency, /Prisma\.TransactionIsolationLevel\.Serializable/u);
    assert.match(idempotency, /SELECT id FROM identity_users[\s\S]*FOR UPDATE/u);
    assert.match(idempotency, /actor_user_id = \$\{actorId\}::uuid/u);
    assert.match(idempotency, /method = \$\{method\}/u);
    assert.match(idempotency, /canonical_path = \$\{canonicalPath\}/u);
    assert.match(idempotency, /idempotency_key = \$\{key\}::uuid/u);
    assert.match(idempotency, /requestFingerprint !== fingerprint/u);
    assert.match(idempotency, /this\.crypto\.encrypt/u);
    assert.match(idempotency, /error\.code === 'P2034' && attempt < 2/u);
    assert.match(transactionPort, /readonly isolationLevel: 'SERIALIZABLE'/u);
    assert.match(migration, /UNIQUE \("actor_user_id", "method", "canonical_path", "idempotency_key"\)/u);
});

test('failure recovery retains append-only results, audit and one completion marker', () => {
    assert.match(migration, /UNIQUE \("tournament_match_id", "revision"\)/u);
    assert.match(migration, /tournament_match_results_append_only/u);
    assert.match(migration, /tournament_audits_append_only/u);
    assert.match(migration, /tournament_completion_markers_append_only/u);
    assert.match(migration, /"tournament_id" UUID PRIMARY KEY REFERENCES "tournaments"/u);
    assert.match(migration, /UNIQUE \("stage_id", "sequence", "generation"\)/u);
    assert.match(migration, /UNIQUE \("tournament_id", "strategy_key"\)/u);
});

test('CUSTOM_DSL has no executable implementation or dynamic-code escape hatch', () => {
    assert.match(registry, /formatCode === 'CUSTOM_DSL'/u);
    assert.match(registry, /CUSTOM_DSL is disabled/u);
    assert.doesNotMatch(tournamentSources, /\beval\s*\(|\bFunction\s*\(|node:vm|\bvm\./u);
    assert.equal((registry.match(/new [A-Z][A-Za-z]+Strategy\(\)/gu) ?? []).length, 8);
});
