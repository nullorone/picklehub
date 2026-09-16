import { readdir, readFile, stat } from 'node:fs/promises';

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
const gameScripts = assets.filter((file) => file.startsWith('mini-game-ui-') && file.endsWith('.js'));
if (gameScripts.length !== 1) throw new Error('Mini-game must be emitted as one lazy JavaScript chunk.');
const gameSize = (await stat(new URL(`../dist/assets/${gameScripts[0]}`, import.meta.url))).size;
if (gameSize > 100_000) throw new Error(`Mini-game lazy chunk exceeds 100 KiB: ${String(gameSize)} bytes.`);
console.log(`Production TMA excludes its mock and emits a ${String(gameSize)} byte lazy mini-game chunk.`);
