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
if (!serviceWorker.includes('picklehub-public-venues-v1') || !serviceWorker.includes('NetworkFirst')) {
    throw new Error('Public venue reads must have the bounded NetworkFirst offline cache.');
}
if (serviceWorker.includes('/geocode') || serviceWorker.includes('/candidates') || serviceWorker.includes('/reports')) {
    throw new Error('Venue provider calls and mutations must not be cached.');
}
console.log('PWA manifest and service worker are present.');
