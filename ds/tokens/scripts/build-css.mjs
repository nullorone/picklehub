import { mkdir, readFile, writeFile } from 'node:fs/promises';

const tokens = JSON.parse(await readFile(new URL('../src/tokens.json', import.meta.url), 'utf8'));

function flatten(value, prefix = '--token') {
    return Object.entries(value).flatMap(([key, entry]) =>
        typeof entry === 'object' ? flatten(entry, `${prefix}-${key}`) : [`    ${prefix}-${key}: ${entry};`]
    );
}

const themes = Object.entries(tokens.ein.theme).map(([name, values]) => {
    const roles = Object.entries(values).map(([key, value]) => `    --ds-${key}: ${value};`);
    const glass = Object.entries(tokens.ein.glass).map(([key, value]) => `    --ds-glass-${key}: ${value};`);
    const selector = name === 'light' ? ':root, [data-ds-theme="light"]' : '[data-ds-theme="dark"]';
    return `${selector} {\n    color-scheme: ${name};\n${[...roles, ...glass].join('\n')}\n}`;
});

const css = `/* Generated from src/tokens.json. Do not edit. */\n:root {\n${flatten(tokens).join('\n')}\n}\n${themes.join('\n')}\n`;
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/tokens.css', import.meta.url), css);
