import { access, readFile } from 'node:fs/promises';

await Promise.all([
    access(new URL('../dist/sw.js', import.meta.url)),
    access(new URL('../dist/manifest.webmanifest', import.meta.url)),
    access(new URL('../dist/runtime-config.json', import.meta.url)),
]);
const manifest = JSON.parse(await readFile(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));
if (manifest.display !== 'standalone' || manifest.lang !== 'ru-RU' || !manifest.icons?.length) {
    throw new Error('PWA manifest is incomplete.');
}
const serviceWorker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
if (serviceWorker.includes('runtime-config.json')) {
    throw new Error('Runtime configuration must not be precached.');
}
console.log('PWA manifest and service worker are present.');
