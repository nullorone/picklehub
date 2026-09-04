import { readdir, readFile } from 'node:fs/promises';

const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const scripts = await Promise.all(
    assets
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFile(new URL(`../dist/assets/${file}`, import.meta.url), 'utf8'))
);
if (
    scripts.some(
        (source) => source.includes('PICKLEHUB_TELEGRAM_DEVELOPMENT_MOCK') || source.includes('mockTelegramEnv')
    )
) {
    throw new Error('Production TMA bundle contains the development Telegram mock.');
}
console.log('Production TMA bundle excludes the development Telegram mock.');
