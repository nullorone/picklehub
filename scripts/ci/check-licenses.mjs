import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const allowed =
    /^(?:0BSD|Apache-2\.0|BlueOak-1\.0\.0|BSD-(?:2|3)-Clause|CC-BY-4\.0|ISC|MIT|MPL-2\.0|Python-2\.0|Unlicense)(?: OR (?:Apache-2\.0|BSD-(?:2|3)-Clause|ISC|MIT))?$/u;
const exceptions = new Map([
    ['node_modules/@mapbox/jsonlint-lines-primitives', 'BSD'],
    ['node_modules/buffer-equal-constant-time', 'BSD-3-Clause'],
    ['node_modules/busboy', 'MIT'],
    ['node_modules/fb-dotslash', 'MIT OR Apache-2.0'],
    ['node_modules/node-forge', 'BSD-3-Clause'],
    ['node_modules/safer-buffer', 'MIT'],
    ['node_modules/stacktrace-parser/node_modules/type-fest', 'MIT'],
    ['node_modules/streamsearch', 'MIT'],
    ['node_modules/type-fest', 'MIT'],
]);
const failures = [];
let checked = 0;
for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path.startsWith('node_modules/') || entry.dev === true || entry.link === true) continue;
    let license;
    try {
        const manifest = JSON.parse(await readFile(resolve(root, path, 'package.json'), 'utf8'));
        license = typeof manifest.license === 'string' ? manifest.license : exceptions.get(path);
    } catch {
        failures.push(`${path}: package metadata unavailable`);
        continue;
    }
    checked += 1;
    if (license === undefined || (!allowed.test(license) && !exceptions.has(path))) {
        failures.push(`${path}: ${license ?? 'missing license'}`);
    }
}
if (failures.length > 0) throw new Error(`Unreviewed production licenses:\n${failures.join('\n')}`);
process.stdout.write(`Reviewed ${String(checked)} production dependency licenses.\n`);
