import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const client = process.argv[2];
if (client !== 'web' && client !== 'tg') throw new Error('Client must be web or tg.');

const release = process.env.RELEASE_VERSION;
const commit = process.env.VCS_REF ?? process.env.GITHUB_SHA;
const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
if (release === undefined || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(release)) {
    throw new Error('RELEASE_VERSION must be a semantic, immutable release identifier.');
}
if (commit === undefined || !/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error('VCS_REF or GITHUB_SHA must be the full lowercase commit SHA.');
}
if (sourceDateEpoch === undefined || !/^(0|[1-9][0-9]*)$/u.test(sourceDateEpoch)) {
    throw new Error('SOURCE_DATE_EPOCH is required for a reproducible release timestamp.');
}

const workspace = `@picklehub/${client}`;
const vite = resolve(repositoryRoot, 'node_modules/.bin/vite');
const build = spawnSync(vite, ['build'], {
    cwd: resolve(repositoryRoot, `frontend/${client}`),
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const check = spawnSync(process.execPath, [`frontend/${client}/scripts/check-build.mjs`], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
});
if (check.status !== 0) process.exit(check.status ?? 1);

const distribution = resolve(repositoryRoot, `frontend/${client}/dist`);
async function filesBelow(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const path = resolve(directory, entry.name);
            return entry.isDirectory() ? filesBelow(path) : [path];
        })
    );
    return nested.flat();
}

const emittedFiles = await filesBelow(distribution);
if (emittedFiles.some((path) => path.endsWith('.map'))) throw new Error('Public source maps are forbidden.');
const files = emittedFiles.filter((path) => !path.endsWith('/release.json')).sort();
const forbidden = [
    'http://localhost:',
    'http://127.0.0.1:',
    'http://10.0.2.2:',
    'example.invalid',
    'PICKLEHUB_TELEGRAM_DEVELOPMENT_MOCK',
    'mockTelegramEnv',
    'tonconnect',
    'ton-connect',
    'TonConnect',
    'TON_CONNECT',
    '-----BEGIN PRIVATE KEY-----',
];
for (const path of files) {
    const content = await readFile(path);
    for (const marker of forbidden) {
        if (content.includes(Buffer.from(marker))) {
            throw new Error(`${relative(repositoryRoot, path)} contains forbidden release marker ${marker}.`);
        }
    }
}

const runtimeConfig = JSON.parse(await readFile(resolve(distribution, 'runtime-config.json'), 'utf8'));
if (
    runtimeConfig.environment !== 'production' ||
    runtimeConfig.apiBaseUrl !== '/v1' ||
    Object.hasOwn(runtimeConfig, 'token') ||
    Object.hasOwn(runtimeConfig, 'secret')
) {
    throw new Error(`${workspace} must use the reviewed same-origin production API configuration.`);
}

const digests = Object.fromEntries(
    await Promise.all(
        files.map(async (path) => [
            relative(distribution, path),
            createHash('sha256')
                .update(await readFile(path))
                .digest('hex'),
        ])
    )
);
await writeFile(
    resolve(distribution, 'release.json'),
    `${JSON.stringify(
        {
            artifact: client === 'web' ? 'picklehub-web' : 'picklehub-tma',
            builtAt: new Date(Number(sourceDateEpoch) * 1000).toISOString(),
            commit,
            compatibility: { asyncApiMajor: 1, backendRestMajors: [1] },
            files: digests,
            release,
        },
        null,
        4
    )}\n`
);
process.stdout.write(`Created ${workspace} release ${release} from ${commit}.\n`);
