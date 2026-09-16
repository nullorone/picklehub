import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const action = process.argv[2];
const manifestPath = process.argv[3];
if (!['rollout', 'rollback'].includes(action) || manifestPath === undefined) {
    throw new Error('Usage: rollout-clients.mjs <rollout|rollback> <release-manifest.json>');
}
const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
if (
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.release ?? '') ||
    !/^[0-9a-f]{40}$/u.test(manifest.commit ?? '') ||
    !Number.isInteger(manifest.canaryPercent) ||
    manifest.canaryPercent < 1 ||
    manifest.canaryPercent > 10 ||
    !/^https:\/\//u.test(manifest.urls?.web ?? '') ||
    !/^https:\/\//u.test(manifest.urls?.tma ?? '') ||
    !/^https:\/\//u.test(manifest.urls?.api ?? '') ||
    !/^https:\/\//u.test(manifest.canaryUrls?.web ?? '') ||
    !/^https:\/\//u.test(manifest.canaryUrls?.tma ?? '') ||
    !/^sha256:[0-9a-f]{64}$/u.test(manifest.images?.web ?? '') ||
    !/^sha256:[0-9a-f]{64}$/u.test(manifest.images?.tma ?? '')
) {
    throw new Error('Release manifest must use immutable digests, exact HTTPS URLs and a 1-10% canary.');
}

const adapter = process.env.CLIENT_ROLLOUT_ADAPTER;
const cacheAdapter = process.env.CLIENT_CACHE_PURGE_ADAPTER;
if (adapter === undefined || !adapter.startsWith('/')) {
    throw new Error('CLIENT_ROLLOUT_ADAPTER must be an explicitly installed absolute executable path.');
}
if (action === 'rollout' && (cacheAdapter === undefined || !cacheAdapter.startsWith('/'))) {
    throw new Error('CLIENT_CACHE_PURGE_ADAPTER must be an explicitly installed absolute executable path.');
}

function run(executable, arguments_, label) {
    const result = spawnSync(executable, arguments_, { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${label} failed with exit ${String(result.status)}.`);
}

function deploy(operation) {
    run(adapter, [operation, resolve(manifestPath)], `client ${operation}`);
}

function smoke(urls) {
    run(
        process.execPath,
        [
            resolve(import.meta.dirname, 'smoke-clients.mjs'),
            `--web-url=${urls.web}`,
            `--tma-url=${urls.tma}`,
            `--api-url=${manifest.urls.api}`,
            `--release=${manifest.release}`,
        ],
        'client smoke'
    );
}

if (action === 'rollback') {
    deploy('rollback');
    process.stdout.write(`Rollback requested for ${manifest.release}; verify previous release smoke and metrics.\n`);
    process.exit(0);
}

deploy('canary');
try {
    smoke(manifest.canaryUrls);
} catch (error) {
    deploy('rollback');
    throw error;
}
deploy('promote');
try {
    smoke(manifest.urls);
} catch (error) {
    deploy('rollback');
    throw error;
}
run(
    cacheAdapter,
    [manifest.urls.web, manifest.urls.tma, '/', '/index.html', '/runtime-config.json', '/release.json', '/sw.js'],
    'mutable shell cache purge'
);
process.stdout.write(
    `Promoted ${manifest.release}; only mutable shell/config paths were purged, hashed assets remain immutable.\n`
);
