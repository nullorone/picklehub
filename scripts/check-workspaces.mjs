import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedWorkspaces = new Map([
    ['backend', '@picklehub/backend'],
    ['frontend/web', '@picklehub/web'],
    ['frontend/tg', '@picklehub/tg'],
    ['frontend/packages/analytics', '@picklehub/analytics'],
    ['frontend/packages/api-client', '@picklehub/api-client'],
    ['frontend/packages/domain', '@picklehub/domain'],
    ['frontend/packages/i18n', '@picklehub/i18n'],
    ['frontend/packages/validation', '@picklehub/validation'],
]);
const sharedNames = new Set(
    [...expectedWorkspaces.entries()].filter(([path]) => path.startsWith('frontend/packages/')).map(([, name]) => name)
);
const requiredTasks = ['build', 'lint', 'test', 'typecheck'];

async function readJson(path) {
    return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));
}

async function filesBelow(path) {
    const entries = await readdir(path, { withFileTypes: true });
    const files = await Promise.all(
        entries.map((entry) => {
            const child = resolve(path, entry.name);
            if (entry.isDirectory() && ['.git', '.turbo', 'node_modules', 'dist', 'coverage'].includes(entry.name)) {
                return [];
            }
            return entry.isDirectory() ? filesBelow(child) : [child];
        })
    );
    return files.flat();
}

const rootPackage = await readJson('package.json');
const turbo = await readJson('turbo.json');
const errors = [];

for (const task of requiredTasks) {
    if (rootPackage.scripts?.[task] !== `turbo run ${task}`) {
        errors.push(`Root task ${task} must delegate to Turbo.`);
    }
    if (turbo.tasks?.[task] === undefined) {
        errors.push(`Turbo task ${task} is missing.`);
    }
}

const lockfiles = (await filesBelow(repositoryRoot)).filter(
    (path) => !path.includes('/node_modules/') && !path.includes('/.git/') && path.endsWith('/package-lock.json')
);
if (lockfiles.length !== 1 || relative(repositoryRoot, lockfiles[0] ?? '') !== 'package-lock.json') {
    errors.push(
        `Expected one root package-lock.json, found: ${lockfiles.map((path) => relative(repositoryRoot, path)).join(', ')}`
    );
}

for (const [workspacePath, expectedName] of expectedWorkspaces) {
    const workspacePackage = await readJson(`${workspacePath}/package.json`);
    if (workspacePackage.name !== expectedName) {
        errors.push(`${workspacePath} must be named ${expectedName}.`);
    }
    for (const task of requiredTasks) {
        if (workspacePackage.scripts?.[task] === undefined) {
            errors.push(`${expectedName} has no ${task} script.`);
        }
    }

    const internalDependencies = Object.keys({
        ...workspacePackage.dependencies,
        ...workspacePackage.devDependencies,
        ...workspacePackage.peerDependencies,
    }).filter((name) => name.startsWith('@picklehub/'));

    if (workspacePath === 'backend' && internalDependencies.length > 0) {
        errors.push(`${expectedName} must not depend on frontend workspaces: ${internalDependencies.join(', ')}.`);
    }
    if (workspacePath.startsWith('frontend/packages/')) {
        const invalid = internalDependencies.filter((name) => !sharedNames.has(name));
        if (invalid.length > 0) {
            errors.push(`${expectedName} has forbidden internal dependencies: ${invalid.join(', ')}.`);
        }
        const forbiddenPackages = [
            'react',
            'react-dom',
            '@telegram-apps/sdk-react',
            '@nestjs/common',
            '@prisma/client',
        ];
        const platformDependencies = Object.keys({
            ...workspacePackage.dependencies,
            ...workspacePackage.devDependencies,
            ...workspacePackage.peerDependencies,
        }).filter((name) => forbiddenPackages.includes(name));
        if (platformDependencies.length > 0) {
            errors.push(`${expectedName} has platform dependencies: ${platformDependencies.join(', ')}.`);
        }
    }
}

for (const [workspacePath, workspaceName] of expectedWorkspaces) {
    if (!workspacePath.startsWith('frontend/packages/')) continue;
    const sourceFiles = (await filesBelow(resolve(repositoryRoot, workspacePath, 'src'))).filter((path) =>
        /\.[cm]?[jt]sx?$/u.test(path)
    );
    for (const sourceFile of sourceFiles) {
        const source = await readFile(sourceFile, 'utf8');
        const forbiddenImport =
            /(?:from\s*|import\s*\()\s*['"]([^'"]*(?:backend|frontend\/(?:web|tg)|@nestjs|@prisma|@telegram-apps|react(?:-dom)?)[^'"]*)['"]/gu;
        for (const match of source.matchAll(forbiddenImport)) {
            errors.push(
                `${workspaceName} imports forbidden platform code in ${relative(repositoryRoot, sourceFile)}: ${match[1]}.`
            );
        }
    }
}

if (errors.length > 0) {
    throw new Error(`Workspace verification failed:\n- ${errors.join('\n- ')}`);
}

process.stdout.write(
    `Workspace verification passed for ${expectedWorkspaces.size} workspaces and one root lockfile.\n`
);
