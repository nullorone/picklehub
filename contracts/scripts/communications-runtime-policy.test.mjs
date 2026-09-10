import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);

async function source(path) {
    return readFile(new URL(path, root), 'utf8');
}

test('runtime fan-out and delivery jobs contain opaque references instead of chat text', async () => {
    const [service, eventWorker, deliveryQueue, provider] = await Promise.all([
        source('backend/src/communications/communication.service.ts'),
        source('backend/src/communications/communication-event-worker.service.ts'),
        source('backend/src/communications/notification-delivery-queue.service.ts'),
        source('backend/src/communications/notification-provider.ts'),
    ]);

    assert.match(service, /data: \{ conversationId: message\.conversationId, chatMessageId: message\.id, change \}/u);
    assert.doesNotMatch(service.match(/private async chatChanged[\s\S]*?\n    \}/u)?.[0] ?? '', /\btext\b/u);
    assert.match(deliveryQueue, /readonly deliveryId: string/u);
    assert.doesNotMatch(deliveryQueue, /readonly (?:text|recipient|route|email|chatId):/iu);
    assert.doesNotMatch(eventWorker, /data\.(?:text|body|preview)/u);
    assert.doesNotMatch(provider, /message\.(?:text|body|preview)/u);
});

test('communication clients do not write chat content or credentials to console or analytics', async () => {
    const clients = await Promise.all([
        source('frontend/web/src/communications-ui.tsx'),
        source('frontend/tg/src/communications-ui.tsx'),
    ]);
    for (const client of clients) {
        assert.doesNotMatch(client, /console\.(?:debug|info|log|warn|error)/u);
        const analyticsCalls = client.match(/disabledAnalytics\.track\(\{[\s\S]*?\}\);/gu) ?? [];
        assert.ok(analyticsCalls.length >= 3);
        for (const call of analyticsCalls) {
            assert.doesNotMatch(call, /\b(?:text|draft|messageId|conversationId|matchId|route|token|ticket)\s*:/u);
        }
    }
});

test('privacy canary is absent from communication production sources', async () => {
    const paths = [
        'backend/src/communications/communication.service.ts',
        'backend/src/communications/communication-event-worker.service.ts',
        'backend/src/communications/notification-delivery-worker.service.ts',
        'backend/src/communications/notification-provider.ts',
        'frontend/web/src/communications-ui.tsx',
        'frontend/tg/src/communications-ui.tsx',
    ];
    const productionSources = (await Promise.all(paths.map(source))).join('\n');
    assert.doesNotMatch(productionSources, /privacy-canary-chat-text/u);
});
