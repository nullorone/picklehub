import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('web and TMA lazy-load one shared mini-game runtime', async () => {
    const [web, tma, runtime, webPackage, tmaPackage] = await Promise.all([
        read('frontend/web/src/app.tsx'),
        read('frontend/tg/src/app.tsx'),
        read('frontend/packages/mini-game/src/index.tsx'),
        read('frontend/web/package.json'),
        read('frontend/tg/package.json'),
    ]);
    for (const shell of [web, tma]) {
        assert.match(shell, /lazy\(async \(\) =>/u);
        assert.match(shell, /import\('\.\/mini-game-ui'\)/u);
        assert.match(shell, /path="\/mini-game"/u);
    }
    assert.match(webPackage, /@picklehub\/mini-game/u);
    assert.match(tmaPackage, /@picklehub\/mini-game/u);
    assert.match(runtime, /data-ad-free=\{active/u);
    assert.match(runtime, /Тренировка · без награды и отложенной отправки/u);
    assert.doesNotMatch(runtime, /localStorage|indexedDB|serviceWorker/u);
});

test('browser mini-game uses bounded aggregate APIs without proof URLs', async () => {
    const [client, runtime] = await Promise.all([
        read('frontend/packages/api-client/src/index.ts'),
        read('frontend/packages/mini-game/src/index.tsx'),
    ]);
    for (const method of [
        'createMiniGameSession',
        'submitMiniGameResult',
        'getOwnMiniGameProgress',
        'claimMiniGameRewards',
    ]) {
        assert.match(client, new RegExp(method, 'u'));
    }
    assert.match(runtime, /pausedDurationMilliseconds/u);
    assert.match(runtime, /crypto\.getRandomValues/u);
    assert.match(runtime, /configurationVersion: '1\.0\.0'/u);
    assert.doesNotMatch(client, /mini-game[^'`]*\?(?:challenge|proof|nonce|capability)/u);
});

test('mobile WebView is POST-launched, ephemeral and deny-by-default', async () => {
    const [screen, bridge, config] = await Promise.all([
        read('frontend/mobile/src/screens/mini-game-screen.tsx'),
        read('frontend/mobile/src/screens/mini-game-bridge.ts'),
        read('frontend/mobile/app.config.ts'),
    ]);
    assert.match(screen, /method: 'POST'/u);
    assert.match(screen, /body: JSON\.stringify\(\{ capability: launch\.capability \}\)/u);
    assert.match(screen, /incognito/u);
    assert.match(screen, /cacheEnabled=\{false\}/u);
    assert.match(screen, /domStorageEnabled=\{false\}/u);
    assert.match(screen, /sharedCookiesEnabled=\{false\}/u);
    assert.match(screen, /thirdPartyCookiesEnabled=\{false\}/u);
    assert.match(screen, /mixedContentMode="never"/u);
    assert.match(screen, /onShouldStartLoadWithRequest=\{allowNavigation\}/u);
    assert.match(screen, /await api\.bootstrap\(\)/u);
    assert.doesNotMatch(screen, /injectedJavaScript|refreshToken|initData/u);
    assert.match(bridge, /2048/u);
    assert.match(bridge, /OPEN_SAFE_ROUTE_V1/u);
    assert.match(bridge, /MATCH_CREATE.*MATCH_LIST.*PROFILE_SELF/u);
    assert.match(config, /WKAppBoundDomains/u);
});
