import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [
    mobilePackageSource,
    appConfig,
    runtimeConfig,
    releaseAudit,
    realtimeTest,
    ui,
    detailScreens,
    verification,
    coldLinkSource,
    warmLinkSource,
    locationSource,
    logoutSource,
] = await Promise.all([
    read('frontend/mobile/package.json'),
    read('frontend/mobile/app.config.ts'),
    read('frontend/mobile/src/config.ts'),
    read('frontend/mobile/scripts/check-release.mjs'),
    read('frontend/mobile/src/realtime/realtime-client.test.ts'),
    read('frontend/mobile/src/ui/components.tsx'),
    read('frontend/mobile/src/screens/detail-screens.tsx'),
    read('llm/_docs/mobile-parity-verification.md'),
    read('frontend/mobile/.maestro/flows/01-cold-magic-link.yaml'),
    read('frontend/mobile/.maestro/flows/02-warm-deep-link.yaml'),
    read('frontend/mobile/.maestro/flows/03-location-denied.yaml'),
    read('frontend/mobile/.maestro/flows/04-logout-purge.yaml'),
]);
const mobilePackage = JSON.parse(mobilePackageSource);
const flowCommands = (source) => parse(source.split(/^---$/mu)[1] ?? '[]');

test('production export fails closed and receives a separate artifact audit', () => {
    assert.match(appConfig, /isProduction && apiUrl === undefined/u);
    assert.match(runtimeConfig, /Mobile API URL is missing from Expo config/u);
    assert.match(mobilePackage.scripts['build:release:audit'], /APP_ENV=production/u);
    assert.match(mobilePackage.scripts['build:release:audit'], /check-release\.mjs/u);
    assert.match(releaseAudit, /http:\/\/10\.0\.2\.2/u);
    assert.match(releaseAudit, /BEGIN PRIVATE KEY/u);
    assert.match(releaseAudit, /\.mobileprovision/u);
    assert.match(releaseAudit, /\.keystore/u);
});

test('Maestro matrix keeps cold and warm links, denied location and logout executable', () => {
    for (const source of [coldLinkSource, warmLinkSource, locationSource, logoutSource]) {
        const commands = flowCommands(source);
        assert.ok(Array.isArray(commands));
        assert.ok(commands.length >= 3);
    }
    assert.match(coldLinkSource, /clearState: true/u);
    assert.match(coldLinkSource, /read-magic-link\.js/u);
    assert.match(warmLinkSource, /stopApp/u);
    assert.match(locationSource, /location: deny/u);
    assert.match(locationSource, /Название или район/u);
    assert.match(logoutSource, /Локальные данные этого аккаунта будут удалены/u);
});

test('lifecycle and offline safety have automated non-device evidence', () => {
    assert.match(realtimeTest, /REST snapshot cursor/u);
    assert.match(realtimeTest, /cursor gap/u);
    assert.match(realtimeTest, /cancels reconnect work/u);
    assert.match(detailScreens, /disabled=\{!online \|\| state\.staleAt !== undefined\}/u);
    assert.match(detailScreens, /disabled=\{!online \|\| draft\.trim\(\) === ''\}/u);
    assert.match(ui, /accessibilityRole="progressbar"/u);
    assert.match(ui, /accessibilityState=\{\{ disabled \}\}/u);
});

test('verification evidence explicitly separates passes from blocked external gates', () => {
    assert.match(verification, /## Матрица паритета/u);
    assert.match(verification, /BLOCKED/u);
    assert.match(verification, /Maestro/u);
    assert.match(verification, /VoiceOver\/TalkBack/u);
    assert.match(verification, /публикац/u);
    assert.match(verification, /не выполнялась/u);
});
