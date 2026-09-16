import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFile(resolve(root, path), 'utf8');

test('web and TMA are separate immutable artifacts with public source maps disabled', async () => {
    for (const client of ['web', 'tg']) {
        const [dockerfile, vite, packageJson] = await Promise.all([
            read(`frontend/${client}/Dockerfile`),
            read(`frontend/${client}/vite.config.ts`),
            read(`frontend/${client}/package.json`),
        ]);
        assert.match(dockerfile, /build:release/u);
        assert.match(dockerfile, /org\.opencontainers\.image\.revision/u);
        assert.match(vite, /sourcemap: false/u);
        assert.match(packageJson, /"build:release"/u);
    }
});

test('client servers apply reviewed caching and security policies', async () => {
    const [webNginx, tmaNginx, webHeaders, tmaHeaders] = await Promise.all([
        read('frontend/web/nginx.conf'),
        read('frontend/tg/nginx.conf'),
        read('frontend/web/security-headers.conf'),
        read('frontend/tg/security-headers.conf'),
    ]);
    const web = `${webNginx}\n${webHeaders}`;
    const tma = `${tmaNginx}\n${tmaHeaders}`;
    for (const config of [web, tma]) {
        assert.match(config, /Content-Security-Policy/u);
        assert.match(config, /Strict-Transport-Security/u);
        assert.match(config, /X-Content-Type-Options "nosniff"/u);
        assert.match(config, /\/assets\/[\s\S]*immutable/u);
        assert.match(config, /runtime-config\.json[\s\S]*no-store/u);
    }
    assert.match(web, /frame-ancestors 'none'/u);
    assert.match(tma, /frame-ancestors https:\/\/web\.telegram\.org/u);
});

test('production origins and Telegram URL are closed documented values', async () => {
    const [environment, releaseConfig] = await Promise.all([
        read('backend/src/common/config/environment.ts'),
        read('deploy/client-production.json'),
    ]);
    const config = JSON.parse(releaseConfig);
    assert.deepEqual(config.allowedBrowserOrigins, ['https://picklehub.ru', 'https://tma.picklehub.ru']);
    assert.equal(config.telegram.miniAppUrl, 'https://tma.picklehub.ru/');
    assert.equal(config.apiBaseUrl, '/v1');
    assert.doesNotMatch(releaseConfig, /localhost|example\.invalid|tonconnect|ton-connect/iu);
    assert.match(environment, /origin\.includes\('\*'\)/u);
});

test('PR workflow has verification but no deployment and release is explicitly dispatched', async () => {
    const [ci, release] = await Promise.all([
        read('.github/workflows/foundation.yml'),
        read('.github/workflows/release.yml'),
    ]);
    assert.match(ci, /pull_request:/u);
    assert.doesNotMatch(ci, /\bdeploy(?:ment)?\b/iu);
    assert.match(release, /workflow_dispatch:/u);
    assert.match(release, /listWorkflowRuns/u);
    assert.match(release, /attest-build-provenance/u);
    assert.match(release, /release:rollback:drill/u);
});
