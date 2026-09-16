import { access, cp, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const web = resolve(process.argv[2] ?? 'frontend/web/dist');
const tma = resolve(process.argv[3] ?? 'frontend/tg/dist');
const root = await mkdtemp(resolve(tmpdir(), 'picklehub-client-rollback-'));
try {
    for (const [name, source] of [
        ['web', web],
        ['tg', tma],
    ]) {
        const artifact = JSON.parse(await readFile(resolve(source, 'release.json'), 'utf8'));
        const previous = resolve(root, `${name}-${artifact.release}-previous`);
        const candidate = resolve(root, `${name}-${artifact.release}-candidate`);
        await cp(source, previous, { recursive: true });
        await cp(source, candidate, { recursive: true });
        await writeFile(resolve(candidate, '.canary'), 'candidate\n');
        const current = resolve(root, `${name}-current`);
        await symlink(previous, current);
        await rename(current, `${current}.old`);
        await symlink(candidate, current);
        await access(resolve(current, '.canary'));
        await rm(current);
        await rename(`${current}.old`, current);
        await access(resolve(current, '.canary')).then(
            () => {
                throw new Error(`${name} rollback still points at the canary.`);
            },
            () => undefined
        );
        const restored = JSON.parse(await readFile(resolve(current, 'release.json'), 'utf8'));
        if (restored.commit !== artifact.commit) throw new Error(`${name} rollback restored the wrong artifact.`);
    }
    process.stdout.write('Atomic client canary switch and rollback drill passed; immutable assets need no purge.\n');
} finally {
    await rm(root, { force: true, recursive: true });
}
