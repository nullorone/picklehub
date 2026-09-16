import { access, readdir, readFile, stat } from 'node:fs/promises';

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
const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const gameScripts = assets.filter((file) => file.startsWith('mini-game-ui-') && file.endsWith('.js'));
if (gameScripts.length !== 1) throw new Error('Mini-game must be emitted as one lazy JavaScript chunk.');
const gameSize = (await stat(new URL(`../dist/assets/${gameScripts[0]}`, import.meta.url))).size;
if (gameSize > 100_000) throw new Error(`Mini-game lazy chunk exceeds 100 KiB: ${String(gameSize)} bytes.`);
if (!serviceWorker.includes(gameScripts[0])) {
    throw new Error('PWA offline cache must include the versioned mini-game chunk.');
}
if (serviceWorker.includes('runtime-config.json')) {
    throw new Error('Runtime configuration must not be precached.');
}
if (!serviceWorker.includes('picklehub-public-venues-v1') || !serviceWorker.includes('NetworkFirst')) {
    throw new Error('Public venue reads must have the bounded NetworkFirst offline cache.');
}
if (serviceWorker.includes('/geocode') || serviceWorker.includes('/candidates') || serviceWorker.includes('/reports')) {
    throw new Error('Venue provider calls and mutations must not be cached.');
}
console.log(`PWA shell and ${String(gameSize)} byte lazy offline mini-game chunk are present.`);
