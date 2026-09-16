import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
for (const platform of ['android', 'ios']) {
    const output = `dist/${platform}`;
    await Promise.all([`${output}/metadata.json`, `${output}/_expo`].map((path) => access(resolve(root, path))));
    const metadata = JSON.parse(await readFile(resolve(root, `${output}/metadata.json`), 'utf8'));
    if (metadata.version === undefined) throw new Error(`Expo ${platform} export metadata has no version.`);
}
process.stdout.write('Mobile Expo export contains iOS and Android metadata and bundles.\n');
