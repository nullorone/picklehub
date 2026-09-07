import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export function generateOpenApi(outputDirectory = repositoryRoot) {
    const compiler = resolve(repositoryRoot, 'node_modules/.bin/tsp');
    const project = resolve(repositoryRoot, 'contracts/rest');
    const result = spawnSync(
        compiler,
        ['compile', project, '--output-dir', resolve(outputDirectory), '--pretty=false'],
        {
            cwd: repositoryRoot,
            encoding: 'utf8',
        }
    );

    if (result.status !== 0) {
        throw new Error(`TypeSpec compilation failed.\n${result.stdout}${result.stderr}`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateOpenApi(process.argv[2]);
    console.log('Generated openapi.yaml from contracts/rest/main.tsp.');
}
