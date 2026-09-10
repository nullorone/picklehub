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

    const venues = await fetch(`http://${host}:${port}/venues?query=%D0%BA%D0%BE%D1%80%D1%82`, {
        headers: { 'accept-language': 'ru-RU' },
    });
    const venuesBody = await venues.json();
    requireNoStore(venues, 'Venue catalogue response');
    if (venues.status !== 200 || !Array.isArray(venuesBody.items) || !venuesBody.pageInfo || !venuesBody.snapshotAt) {
        throw new Error(`Unexpected venue catalogue mock: ${venues.status} ${JSON.stringify(venuesBody)}`);
    }

    const candidate = await fetch(`http://${host}:${port}/venues/candidates`, {
        method: 'POST',
        headers: {
            'accept-language': 'ru-RU',
            authorization: `Bearer ${'A'.repeat(43)}`,
            'content-type': 'application/json',
            'idempotency-key': '45b02ea4-b8e7-46c9-bb0e-c6f2336b18bd',
            origin: 'https://app.example.test',
            'x-csrf-token': contextBody.csrfToken,
        },
        body: JSON.stringify({
            sourceMatchId: '77cab327-63d3-4cac-b660-a94959c05bd2',
            name: 'Тестовый спортивный объект',
            normalizedAddress: 'Москва, Тестовая улица, 1',
            locality: 'Москва',
            timeZone: 'Europe/Moscow',
            location: { longitude: 37.6173, latitude: 55.7558 },
            source: { kind: 'MANUAL_PIN' },
        }),
    });
    const candidateBody = await candidate.json();
    requireNoStore(candidate, 'Venue candidate response');
    if (
        candidate.status !== 201 ||
        !candidateBody.id ||
        !candidateBody.sourceMatchId ||
        'location' in candidateBody ||
        'normalizedAddress' in candidateBody
    ) {
        throw new Error(`Unexpected venue candidate mock: ${candidate.status} ${JSON.stringify(candidateBody)}`);
    }

    const matches = await fetch(`http://${host}:${port}/matches?format=SINGLES&limit=20`, {
        headers: { 'accept-language': 'ru-RU' },
    });
    const matchesBody = await matches.json();
    requireNoStore(matches, 'Match search response');
    if (
        matches.status !== 200 ||
        !Array.isArray(matchesBody.items) ||
        !matchesBody.pageInfo ||
        !matchesBody.snapshotAt
    ) {
        throw new Error(`Unexpected match search mock: ${matches.status} ${JSON.stringify(matchesBody)}`);
    }
    console.log('OpenAPI mock passed: health, identity, venue and match examples are valid.');
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
