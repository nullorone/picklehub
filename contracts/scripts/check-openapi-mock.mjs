import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const host = '127.0.0.1';

async function reservePort() {
    const server = createServer();
    await new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, host, resolveListen);
    });
    const address = server.address();
    await new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
    return address.port;
}

async function waitForMock(url, child, logs) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) {
            throw new Error(`Prism exited before becoming ready.\n${logs.join('')}`);
        }
        try {
            const response = await fetch(url, { headers: { 'accept-language': 'ru-RU' } });
            if (response.ok) {
                return response;
            }
        } catch {
            // The local listener is not ready yet.
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    throw new Error(`Prism did not become ready.\n${logs.join('')}`);
}

const port = await reservePort();
const prism = resolve(repositoryRoot, 'node_modules/.bin/prism');
const child = spawn(
    prism,
    ['mock', 'openapi.yaml', '--host', host, '--port', String(port), '--errors', '--verboseLevel', 'error'],
    {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
    }
);
const logs = [];
for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => logs.push(chunk.toString()));
}

try {
    const live = await waitForMock(`http://${host}:${port}/health/live`, child, logs);
    const liveBody = await live.json();
    if (liveBody.status !== 'ok' || !liveBody.checkedAt.endsWith('Z') || !liveBody.requestId) {
        throw new Error(`Unexpected liveness mock: ${JSON.stringify(liveBody)}`);
    }

    const ready = await fetch(`http://${host}:${port}/health/ready`, { headers: { 'accept-language': 'ru-RU' } });
    const readyBody = await ready.json();
    if (ready.status !== 200 || readyBody.status !== 'ok') {
        throw new Error(`Unexpected readiness mock: ${ready.status} ${JSON.stringify(readyBody)}`);
    }

    const productPath = await fetch(`http://${host}:${port}/matches`);
    if (productPath.status !== 404) {
        throw new Error(`Foundation mock unexpectedly exposes /matches with status ${productPath.status}.`);
    }
    console.log('OpenAPI mock passed: liveness/readiness examples are valid and product paths are absent.');
} finally {
    child.kill('SIGTERM');
    await new Promise((resolveExit) => {
        if (child.exitCode !== null) {
            resolveExit();
        } else {
            child.once('exit', resolveExit);
        }
    });
}
