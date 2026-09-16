import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Expo client uses native transport and secure session storage', async () => {
    const [client, session] = await Promise.all([
        read('frontend/mobile/src/api/mobile-client.ts'),
        read('frontend/mobile/src/security/secure-session.ts'),
    ]);
    assert.match(client, /\/auth\/mobile\/refresh/u);
    assert.doesNotMatch(client, /credentials:\s*['"]include/u);
    assert.doesNotMatch(client, /X-CSRF-Token/u);
    assert.match(session, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/u);
    assert.doesNotMatch(session, /AsyncStorage/u);
});

test('mobile links and push payloads pass a closed resolver', async () => {
    const resolver = await read('frontend/mobile/src/navigation/deep-links.ts');
    assert.match(resolver, /url\.protocol === 'https:'/u);
    assert.match(resolver, /OPEN_NOTIFICATION/u);
    assert.doesNotMatch(resolver, /navigate\(.*url/iu);
});

test('restricted safety data is not added to the persistent cache allowlist', async () => {
    const cache = await read('frontend/mobile/src/cache/read-cache.ts');
    assert.doesNotMatch(cache, /SAFETY/u);
    assert.match(cache, /CHAT_READ/u);
    assert.match(cache, /xchacha20poly1305/u);
});

test('mobile scope excludes post-MVP clients and browser wrappers', async () => {
    const files = await Promise.all([
        read('frontend/mobile/App.tsx'),
        read('frontend/mobile/src/screens/main-tabs.tsx'),
    ]);
    const source = files.join('\n');
    assert.doesNotMatch(source, /WebView|Admin|Tournament|Gamification|Advertising/u);
});
