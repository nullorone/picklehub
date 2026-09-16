import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [controller, dto, service, reward, crypto, rateLimit, worker, queue, environment, logging, seed] =
    await Promise.all([
        read('../../backend/src/mini-game/mini-game.controller.ts'),
        read('../../backend/src/mini-game/mini-game.dto.ts'),
        read('../../backend/src/mini-game/mini-game.service.ts'),
        read('../../backend/src/mini-game/mini-game-reward.service.ts'),
        read('../../backend/src/mini-game/mini-game-crypto.service.ts'),
        read('../../backend/src/mini-game/mini-game-rate-limit.service.ts'),
        read('../../backend/src/gamification/gamification-event-worker.service.ts'),
        read('../../backend/src/outbox/outbox-queue.service.ts'),
        read('../../backend/src/common/config/environment.ts'),
        read('../../backend/src/common/logging/application-logger.service.ts'),
        read('../../backend/prisma/migrations/20260916160000_mini_game_backend/migration.sql'),
    ]);

test('mini-game routes preserve browser, mobile WebView and replay boundaries', () => {
    for (const route of ['webview-launches', 'sessions', 'results', 'progress', 'reward-claim']) {
        assert.match(controller, new RegExp(route));
    }
    assert.match(controller, /assertSessionMutation/u);
    assert.match(controller, /UUID_V4/u);
    assert.match(controller, /private, no-store/u);
    assert.match(controller, /Idempotency-Replayed/u);
    assert.match(crypto, /aes-256-gcm/u);
    assert.match(crypto, /createHmac\('sha256'/u);
});

test('result validation and daily caps remain transaction and database backed', () => {
    assert.match(service, /pg_advisory_xact_lock/u);
    assert.match(service, /MINI_GAME_DAILY_SESSION_LIMIT/u);
    assert.match(service, /MINI_GAME_DAILY_RESULT_LIMIT/u);
    assert.match(service, /processedGameTask\.create/u);
    assert.match(service, /processedGameNonce\.create/u);
    assert.match(service, /mini-game\.result\.recorded\.v1/u);
    assert.match(rateLimit, /GAME_REWARDS_UNAVAILABLE/u);
    assert.doesNotMatch(dto, /deviceId|advertisingId|fingerprint|latitude|longitude|pointer|keystroke|score/iu);
});

test('reward grants use the gamification port, fixed seasons and append-only compensation', () => {
    assert.match(reward, /mini-game\.reward-grant\.changed\.v1/u);
    assert.match(reward, /MINI_GAME_DAILY_COMPLETION/u);
    assert.match(reward, /weekly >= 5 \|\| seasonal >= 30/u);
    assert.match(reward, /REVERSED.*REINSTATED/su);
    assert.match(queue, /mini-game\.reward-grant\.changed\.v1/u);
    assert.match(worker, /reconcileMiniGameGrant/u);
    assert.match(seed, /INTERVAL|2026-12-09T00:00:00Z/u);
    assert.match(seed, /'STANDARD'.*90000/su);
    assert.match(seed, /'CALM'.*20/su);
});

test('kill switch, residency gate, metrics and logs are privacy bounded', () => {
    assert.match(service, /setRewardsEnabled/u);
    assert.match(service, /MINI_GAME_REWARDS_DISABLED/u);
    assert.match(environment, /MINI_GAME_RU_RESIDENCY_CONFIRMED/u);
    assert.match(environment, /Production mini-game rewards require confirmed Russian data residency/u);
    for (const field of ['challengeProof', 'resultProof', 'nonce', 'capability'])
        assert.match(logging, new RegExp(field));
    assert.doesNotMatch(rateLimit, /userAgent|remoteAddress|device|platform/iu);
});
