import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const identity = await readFile(new URL('../../backend/src/identity/identity.service.ts', import.meta.url), 'utf8');
const browser = await readFile(
    new URL('../../backend/src/identity/browser-security.service.ts', import.meta.url),
    'utf8'
);
const communication = await readFile(
    new URL('../../backend/src/communications/communication.service.ts', import.meta.url),
    'utf8'
);
const gateway = await readFile(
    new URL('../../backend/src/communications/communication.gateway.ts', import.meta.url),
    'utf8'
);
const tickets = await readFile(
    new URL('../../backend/src/communications/realtime-ticket.service.ts', import.meta.url),
    'utf8'
);
const providers = await readFile(
    new URL('../../backend/src/communications/notification-provider.ts', import.meta.url),
    'utf8'
);
const worker = await readFile(
    new URL('../../backend/src/communications/notification-delivery-worker.service.ts', import.meta.url),
    'utf8'
);

test('native credentials remain proof-bound, body-only and family-revocable', () => {
    assert.match(identity, /codeChallenge\(codeVerifier\)/u);
    assert.match(identity, /clientPlatform !== ClientPlatform\.MOBILE/u);
    assert.match(identity, /expectedPlatforms !== undefined && !expectedPlatforms\.includes\(session\.platform\)/u);
    assert.match(identity, /credential\.rotatedAt !== null[\s\S]*revokeSession/u);
    assert.match(identity, /notificationDevice\.updateMany/u);
});

test('mobile bearer mutations cannot weaken browser origin and CSRF checks', () => {
    assert.match(browser, /platform === 'MOBILE'/u);
    assert.match(browser, /origin !== undefined \|\| csrf !== undefined/u);
    assert.match(browser, /await this\.assertMutation\(request\)/u);
});

test('push tokens are keyed, encrypted, rotated and erased on every revoke path', () => {
    assert.match(communication, /tokenKey\(body\.environment, body\.token\)/u);
    assert.match(communication, /tokenCiphertext: this\.crypto\.encrypt\(body\.token\)/u);
    assert.match(communication, /revokeReasonCode: 'TOKEN_ROTATED'/u);
    assert.match(communication, /revokeReasonCode: reason/u);
    const projection = communication.slice(
        communication.indexOf('private projectPushRegistration'),
        communication.indexOf('private assertText')
    );
    assert.doesNotMatch(projection, /token(?:Key|Ciphertext)/u);
});

test('realtime and push delivery are single-use, neutral and fail closed', () => {
    assert.match(tickets, /getdel\(this\.key\(ticket\)\)/u);
    assert.match(gateway, /this\.tickets\.consume\(ticket\)/u);
    assert.match(providers, /class DisabledPushNotificationProvider/u);
    assert.match(providers, /readonly enabled = false/u);
    assert.match(worker, /action: 'OPEN_NOTIFICATION'/u);
    assert.doesNotMatch(worker, /payload:[\s\S]{0,300}(?:chat|venue|address|safety|route|url|secret)/iu);
    assert.match(worker, /revokeReasonCode: 'PROVIDER_INVALID_TOKEN'/u);
});
