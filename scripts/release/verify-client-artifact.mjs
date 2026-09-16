import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? '');
const expectedClient = process.argv[3];
const expectedCommit = process.argv[4];
if (!['web', 'tg'].includes(expectedClient) || !/^[0-9a-f]{40}$/u.test(expectedCommit ?? '')) {
    throw new Error('Usage: verify-client-artifact.mjs <dist> <web|tg> <full-commit-sha>');
}
const manifest = JSON.parse(await readFile(resolve(directory, 'release.json'), 'utf8'));
const expectedArtifact = expectedClient === 'web' ? 'picklehub-web' : 'picklehub-tma';
if (
    manifest.artifact !== expectedArtifact ||
    manifest.commit !== expectedCommit ||
    manifest.compatibility?.backendRestMajors?.includes(1) !== true
) {
    throw new Error('Artifact identity, commit or backend compatibility does not match the release.');
}
async function filesBelow(path) {
    const entries = await readdir(path, { withFileTypes: true });
    return (
        await Promise.all(
            entries.map((entry) => {
                const child = resolve(path, entry.name);
                return entry.isDirectory() ? filesBelow(child) : [relative(directory, child)];
            })
        )
    ).flat();
}
const recordedFiles = Object.keys(manifest.files ?? {}).sort();
const actualFiles = (await filesBelow(directory)).filter((name) => name !== 'release.json').sort();
if (JSON.stringify(recordedFiles) !== JSON.stringify(actualFiles)) {
    throw new Error('Artifact contains missing or unrecorded files.');
}
for (const [name, digest] of Object.entries(manifest.files ?? {})) {
    if (name.includes('..') || typeof digest !== 'string') throw new Error('Unsafe release manifest path.');
    const actual = createHash('sha256')
        .update(await readFile(resolve(directory, name)))
        .digest('hex');
    if (actual !== digest) throw new Error(`Digest mismatch for ${name}.`);
}
const assets = await readdir(resolve(directory, 'assets'));
if (assets.some((name) => name.endsWith('.map'))) throw new Error('Public artifact contains a source map.');
process.stdout.write(`Verified ${expectedArtifact} ${manifest.release} at ${expectedCommit}.\n`);
