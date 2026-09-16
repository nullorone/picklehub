import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [
    contractMigration,
    service,
    reward,
    gamificationWorker,
    runtime,
    runtimeTests,
    webBuild,
    tmaBuild,
    mobileScreen,
    mobileBridge,
    mobileTests,
    e2e,
    verification,
] = await Promise.all([
    read('backend/prisma/migrations/20260916130000_mini_game_contract_data/migration.sql'),
    read('backend/src/mini-game/mini-game.service.ts'),
    read('backend/src/mini-game/mini-game-reward.service.ts'),
    read('backend/src/gamification/gamification-projection.service.ts'),
    read('frontend/packages/mini-game/src/index.tsx'),
    read('frontend/packages/mini-game/src/index.test.tsx'),
    read('frontend/web/scripts/check-build.mjs'),
    read('frontend/tg/scripts/check-build.mjs'),
    read('frontend/mobile/src/screens/mini-game-screen.tsx'),
    read('frontend/mobile/src/screens/mini-game-bridge.ts'),
    read('frontend/mobile/src/screens/mini-game-screen.test.ts'),
    read('test/e2e/mini-game.spec.ts'),
    read('llm/_docs/mini-game-verification.md'),
]);

test('replay, concurrent claims and UTC caps have independent database and runtime guards', () => {
    assert.match(contractMigration, /UNIQUE \("session_id"\)/u);
    assert.match(contractMigration, /processed_game_nonces/u);
    assert.match(contractMigration, /reward_grants_semantic_state_key/u);
    assert.match(contractMigration, /XP daily, UTC-week or 84-day season cap reached/u);
    assert.match(service, /pg_advisory_xact_lock/u);
    assert.match(service, /GAME_CHALLENGE_EXPIRED/u);
    assert.match(service, /RESULT_NONCE_REUSED/u);
    assert.match(reward, /pg_advisory_xact_lock/u);
    assert.match(reward, /startOfUtcWeek/u);
    assert.match(reward, /weekly >= 5 \|\| seasonal >= 30/u);
    assert.match(gamificationWorker, /reconcileMiniGameGrant/u);
    assert.doesNotMatch(`${service}\n${reward}`, /xpLedgerEntry\.(?:create|update|upsert)|xpBalance/iu);
});

test('shared runtime verifies deterministic accessible play, pause, offline and ad-free critical phases', () => {
    assert.match(runtime, /mode === 'STANDARD' && now - lastStrike\.current < 450/u);
    assert.match(runtime, /window\.addEventListener\('blur', pause\)/u);
    assert.match(runtime, /document\.addEventListener\('visibilitychange', visibility\)/u);
    assert.match(runtime, /data-ad-free=\{active/u);
    assert.match(runtime, /Тренировка · без награды и отложенной отправки/u);
    assert.match(runtimeTests, /defaults to calm mode for reduced motion/u);
    assert.match(runtimeTests, /pauses input on blur until explicit resume/u);
    assert.match(runtimeTests, /keeps sound opt-in/u);
    assert.match(e2e, /web.*TMA/su);
    assert.match(e2e, /Рекламное объявление/u);
    assert.doesNotMatch(runtime, /localStorage|indexedDB|serviceWorker/u);
});

test('WebView messages, navigation and launch capability are deny-by-default and body-only', () => {
    assert.match(mobileScreen, /body: JSON\.stringify\(\{ capability: launch\.capability \}\)/u);
    assert.match(mobileScreen, /method: 'POST'/u);
    assert.match(mobileScreen, /isAllowedGameNavigation/u);
    assert.match(mobileScreen, /isExpectedGameOrigin\(event\.nativeEvent\.url/u);
    assert.match(mobileScreen, /acceptUniqueBridgeMessage/u);
    assert.match(mobileScreen, /incognito/u);
    assert.match(mobileScreen, /sharedCookiesEnabled=\{false\}/u);
    assert.doesNotMatch(mobileScreen, /injectedJavaScript|refreshToken|initData/u);
    assert.match(mobileBridge, /new TextEncoder\(\)\.encode\(raw\)\.byteLength > 2048/u);
    assert.match(mobileBridge, /new URL\(url\)\.origin === expectedOrigin/u);
    assert.match(mobileBridge, /seenMessages\.has\(envelope\.messageId\)/u);
    assert.match(mobileTests, /evil\.example/u);
    assert.match(mobileTests, /OPEN_URL_V1/u);
    assert.match(contractMigration, /game_launch_capabilities/u);
});

test('production builds enforce one shared bounded chunk and browser verification covers representative widths', () => {
    for (const build of [webBuild, tmaBuild]) {
        assert.match(build, /gameScripts\.length !== 1/u);
        assert.match(build, /gameSize > 100_000/u);
    }
    assert.match(webBuild, /serviceWorker\.includes\(gameScripts\[0\]\)/u);
    assert.match(e2e, /width: 1280/u);
    assert.match(e2e, /width: 360/u);
    assert.match(e2e, /reducedMotion: 'reduce'/u);
    assert.match(verification, /NO-GO/u);
    assert.match(verification, /PostgreSQL/u);
    assert.match(verification, /WKWebView/u);
    assert.match(verification, /FPS/u);
});

test('result transport and verification evidence exclude score and sporting influence', () => {
    assert.match(e2e, /not\.toMatch\(\/score\|trajectory\|coordinate\|device\|rating\|dupr/iu);
    assert.match(verification, /не влия(?:ет|ют) на спортивную статистику/u);
    assert.match(verification, /MINI_GAME_DAILY_COMPLETION/u);
});
