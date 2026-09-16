const options = Object.fromEntries(process.argv.slice(2).map((value) => value.split(/=(.*)/su).slice(0, 2)));
const webUrl = options['--web-url'];
const tmaUrl = options['--tma-url'];
const apiUrl = options['--api-url'];
const expectedRelease = options['--release'];
if (![webUrl, tmaUrl, apiUrl, expectedRelease].every(Boolean)) {
    throw new Error('Pass --web-url, --tma-url, --api-url and --release.');
}

async function fetchWithTimeout(url) {
    return fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
}

async function checkClient(name, origin, framePolicy) {
    const index = await fetchWithTimeout(origin);
    if (!index.ok) throw new Error(`${name} shell returned ${String(index.status)}.`);
    const csp = index.headers.get('content-security-policy') ?? '';
    if (!csp.includes("default-src 'self'") || !csp.includes(framePolicy)) {
        throw new Error(`${name} has an unexpected CSP.`);
    }
    if (index.headers.get('x-content-type-options') !== 'nosniff') throw new Error(`${name} lacks nosniff.`);
    if (!index.headers.get('cache-control')?.includes('no-store')) throw new Error(`${name} shell is cacheable.`);
    const configResponse = await fetchWithTimeout(new URL('/runtime-config.json', origin));
    const config = await configResponse.json();
    if (config.environment !== 'production' || config.apiBaseUrl !== '/v1') {
        throw new Error(`${name} runtime API configuration is not the reviewed production value.`);
    }
    const releaseResponse = await fetchWithTimeout(new URL('/release.json', origin));
    const release = await releaseResponse.json();
    if (release.release !== expectedRelease || release.compatibility?.backendRestMajors?.includes(1) !== true) {
        throw new Error(`${name} release or compatibility does not match.`);
    }
}

await Promise.all([
    checkClient('web', webUrl, "frame-ancestors 'none'"),
    checkClient('TMA', tmaUrl, 'frame-ancestors https://web.telegram.org'),
]);
const ready = await fetchWithTimeout(new URL('/v1/health/ready', apiUrl));
if (!ready.ok) throw new Error(`Backend readiness returned ${String(ready.status)}.`);
process.stdout.write(`Smoke passed for web/TMA ${expectedRelease} and REST v1.\n`);
