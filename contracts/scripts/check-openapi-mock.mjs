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

function requireNoStore(response, label) {
    if (response.headers.get('cache-control') !== 'no-store') {
        throw new Error(`${label} must be no-store.`);
    }
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

    const context = await fetch(`http://${host}:${port}/auth/context`, {
        headers: { 'accept-language': 'ru-RU' },
    });
    const contextBody = await context.json();
    requireNoStore(context, 'Browser auth context');
    if (context.status !== 200 || !/^[A-Za-z0-9_-]{43}$/.test(contextBody.csrfToken)) {
        throw new Error(`Unexpected browser context mock: ${context.status} ${JSON.stringify(contextBody)}`);
    }

    const magicRequest = await fetch(`http://${host}:${port}/auth/magic-links/request`, {
        method: 'POST',
        headers: {
            'accept-language': 'ru-RU',
            'content-type': 'application/json',
            origin: 'https://app.example.test',
            'x-csrf-token': contextBody.csrfToken,
        },
        body: JSON.stringify({ email: 'player@example.test', platform: 'WEB' }),
    });
    const magicBody = await magicRequest.json();
    requireNoStore(magicRequest, 'Magic-link request');
    if (magicRequest.status !== 202 || magicBody.status !== 'ACCEPTED' || !magicBody.message) {
        throw new Error(`Unexpected magic-link mock: ${magicRequest.status} ${JSON.stringify(magicBody)}`);
    }

    const me = await fetch(`http://${host}:${port}/me`, {
        headers: {
            'accept-language': 'ru-RU',
            authorization: `Bearer ${'A'.repeat(43)}`,
        },
    });
    const meBody = await me.json();
    requireNoStore(me, 'Current-user response');
    if (me.status !== 200 || !meBody.user?.id || !meBody.session?.id || !Array.isArray(meBody.identities)) {
        throw new Error(`Unexpected current-user mock: ${me.status} ${JSON.stringify(meBody)}`);
    }

    const productPath = await fetch(`http://${host}:${port}/matches`);
    if (productPath.status !== 404) {
        throw new Error(`Identity mock unexpectedly exposes unowned /matches with status ${productPath.status}.`);
    }
    console.log('OpenAPI mock passed: health and identity examples are valid; unowned paths are absent.');
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
