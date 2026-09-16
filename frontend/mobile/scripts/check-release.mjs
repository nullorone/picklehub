import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const mobileRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(mobileRoot, '../..');
const artifactRoot = resolve(mobileRoot, 'dist');

async function filesBelow(directory, ignored = new Set()) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
        entries
            .filter((entry) => !ignored.has(entry.name))
            .map((entry) => {
                const path = resolve(directory, entry.name);
                return entry.isDirectory() ? filesBelow(path, ignored) : [path];
            })
    );
    return nested.flat();
}

const artifactFiles = await filesBelow(artifactRoot);
const publicConfig = JSON.parse(await readFile(resolve(artifactRoot, 'public-config.json'), 'utf8'));
if (
    publicConfig.ios?.bundleIdentifier !== 'ru.picklehub.mobile' ||
    publicConfig.android?.package !== 'ru.picklehub.mobile' ||
    publicConfig.extra?.appEnvironment !== 'production' ||
    publicConfig.extra?.developmentScheme !== undefined ||
    typeof publicConfig.extra?.apiUrl !== 'string' ||
    !publicConfig.extra.apiUrl.startsWith('https://') ||
    typeof publicConfig.extra?.miniGameOrigin !== 'string' ||
    !publicConfig.extra.miniGameOrigin.startsWith('https://') ||
    publicConfig.ios?.infoPlist?.WKAppBoundDomains?.includes(new URL(publicConfig.extra.miniGameOrigin).hostname) !==
        true
) {
    throw new Error('Public Expo config is not a closed production configuration.');
}
for (const platform of ['ios', 'android']) {
    const metadata = JSON.parse(await readFile(resolve(artifactRoot, platform, 'metadata.json'), 'utf8'));
    if (metadata.fileMetadata?.[platform]?.bundle === undefined) {
        throw new Error(`Release export has no ${platform} bundle metadata.`);
    }
}

const forbiddenArtifactValues = [
    'http://10.0.2.2',
    'http://127.0.0.1',
    'http://localhost',
    'picklehub-dev:',
    '__MOBILE_E2E_STUB__',
    'mockServiceWorker.js',
    '-----BEGIN PRIVATE KEY-----',
    '-----BEGIN RSA PRIVATE KEY-----',
];
for (const path of artifactFiles) {
    const content = await readFile(path);
    for (const forbidden of forbiddenArtifactValues) {
        if (content.includes(Buffer.from(forbidden))) {
            throw new Error(`Release artifact ${relative(mobileRoot, path)} contains forbidden value ${forbidden}.`);
        }
    }
}

const forbiddenSigningExtensions = new Set(['.jks', '.keystore', '.mobileprovision', '.p12', '.p8', '.pem']);
const repositoryFiles = await filesBelow(
    repositoryRoot,
    new Set(['.git', '.expo', '.turbo', 'coverage', 'dist', 'node_modules', 'playwright-report', 'test-results'])
);
const signingFiles = repositoryFiles.filter((path) => forbiddenSigningExtensions.has(extname(path).toLowerCase()));
if (signingFiles.length > 0) {
    throw new Error(
        `Signing material is present in the repository: ${signingFiles.map((path) => relative(repositoryRoot, path)).join(', ')}`
    );
}

process.stdout.write(
    `Audited ${String(artifactFiles.length)} iOS/Android export files: no development endpoints, test stubs, private keys or repository signing material.\n`
);
