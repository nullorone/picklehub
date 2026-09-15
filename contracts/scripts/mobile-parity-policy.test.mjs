import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
const asyncApi = parse(await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8'));
const migration = await readFile(
    new URL(
        '../../backend/prisma/migrations/20260916090000_mobile_parity_contract_data/migration.sql',
        import.meta.url
    ),
    'utf8'
);
const prisma = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');

function dereference(document, value) {
    if (!value?.$ref) return value;
    return value.$ref
        .slice(2)
        .split('/')
        .reduce((node, key) => node[key], document);
}

function parameters(operation) {
    return (operation.parameters ?? []).map((value) => dereference(openApi, value));
}

test('native session is proof-bound, non-cookie and rotating without weakening browser auth', () => {
    assert.deepEqual(openApi.components.schemas.ClientPlatform.enum, ['WEB', 'TMA', 'MOBILE']);
    const request = openApi.paths['/auth/mobile/magic-links/request'].post;
    const consume = openApi.paths['/auth/mobile/magic-links/consume'].post;
    const refresh = openApi.paths['/auth/mobile/refresh'].post;
    for (const operation of [request, consume, refresh]) {
        assert.deepEqual(operation.security, [{}]);
        assert.equal(
            parameters(operation).some((value) => ['Origin', 'X-CSRF-Token'].includes(value.name)),
            false
        );
        assert.equal(
            Object.values(operation.responses).some(
                (response) => dereference(openApi, response).headers?.['Set-Cookie']
            ),
            false
        );
    }
    const nativeSession = openApi.components.schemas.NativeAuthenticatedSession;
    assert(nativeSession.required.includes('refreshToken'));
    assert(nativeSession.required.includes('destination'));
    assert.deepEqual(openApi.components.schemas.NativeLoginEmailRequest.properties.platform.enum, ['MOBILE']);
    assert.equal(openApi.components.schemas.NativeCodeChallenge.pattern, '^[A-Za-z0-9_-]{43}$');

    const browserRefresh = openApi.paths['/auth/refresh'].post;
    assert(browserRefresh.security.some((requirement) => 'ApiKeyAuth' in requirement));
    assert(parameters(browserRefresh).find((value) => value.name === 'X-CSRF-Token')?.required);
    assert(dereference(openApi, browserRefresh.responses['200']).headers['Set-Cookie']);
});

test('bearer mutations express conditional browser CSRF and retain idempotency', () => {
    const operation = openApi.paths['/matches'].post;
    const values = parameters(operation);
    assert.equal(values.find((value) => value.name === 'Origin')?.required, false);
    assert.equal(values.find((value) => value.name === 'X-CSRF-Token')?.required, false);
    assert.equal(values.find((value) => value.name === 'Idempotency-Key')?.required, true);
    assert.match(openApi.components.parameters['SessionMutationHeaders.origin'].description, /WEB\/TMA.*MOBILE/u);
});

test('push registration is revocable, secret-minimized and lock-screen neutral', () => {
    const register = openApi.paths['/notification-devices/{installationId}/push-registrations'].post;
    const revoke = openApi.paths['/notification-devices/{installationId}/push-registrations/{registrationId}'].delete;
    const list = openApi.paths['/notification-devices'].get;
    for (const operation of [register, revoke, list]) {
        assert(operation.security.some((requirement) => 'BearerAuth' in requirement));
    }
    assert.equal(openApi.components.schemas.RegisterPushToken.required.includes('token'), true);
    for (const schema of ['PushRegistration', 'NotificationDevice', 'NotificationDevicePage']) {
        assert.equal(JSON.stringify(openApi.components.schemas[schema]).includes('tokenCiphertext'), false);
        assert.equal(JSON.stringify(openApi.components.schemas[schema]).includes('tokenKey'), false);
    }
    assert.deepEqual(Object.keys(asyncApi.components.schemas.NeutralPushPayload.properties), [
        'schemaVersion',
        'notificationId',
        'action',
    ]);
    assert.doesNotMatch(
        Object.keys(asyncApi.components.schemas.NeutralPushPayload.properties).join(' '),
        /chat|venue|safety|route|url|token/iu
    );
});

test('realtime, cursor recovery and direct upload are runtime-neutral', () => {
    const ticket = openApi.paths['/realtime/tickets'].post;
    assert(ticket.security.some((requirement) => 'BearerAuth' in requirement));
    assert.match(ticket.description, /60 seconds.*first WebSocket message.*REST resync/u);
    assert.equal(asyncApi.components.schemas.AuthenticateData.properties.ticket.pattern, '^ws1_[A-Za-z0-9_-]+$');
    assert.match(asyncApi.channels.matchChat.description, /Sequence gaps.*snapshot/isu);
    assert(asyncApi.components.schemas.ChatSubscribeEnvelope.allOf[1].properties.data.required.includes('cursor'));
    assert.deepEqual(openApi.components.schemas.AvatarUploadPolicy.properties.method.enum, ['PUT']);
    assert.match(openApi.paths['/me/profile/avatar-uploads'].post.description, /single-object PUT/u);
});

test('database binds native login and protects bounded push token history', () => {
    assert.match(migration, /"platform" IN \('WEB', 'TMA', 'MOBILE'\)/u);
    assert.match(migration, /magic_links_native_binding_check/u);
    assert.match(migration, /"native_code_challenge" ~ '\^\[A-Za-z0-9_-\]\{43\}\$'/u);
    assert.match(migration, /CREATE TABLE "push_registrations"/u);
    assert.match(migration, /"token_key" CHAR\(64\)/u);
    assert.match(migration, /"token_ciphertext" BYTEA/u);
    assert.match(migration, /"expires_at" = "last_seen_at" \+ INTERVAL '90 days'/u);
    assert.match(migration, /push_registrations_installation_environment_active_key/u);
    assert.match(migration, /revocation must erase push token key and ciphertext/u);
    assert.match(migration, /notification_devices_revoke_push/u);
    assert.match(migration, /CREATE TABLE "push_delivery_attempts"/u);
    for (const table of ['push_registrations', 'push_delivery_attempts']) {
        assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
    }
});

test('mobile uses shared domain DTOs and only closed structured destinations', () => {
    const names = Object.keys(openApi.components.schemas);
    assert.equal(
        names.some((name) => /^Mobile(?:Match|Venue|Profile|Notification|Safety)/u.test(name)),
        false
    );
    const targets = openApi.components.schemas.MobileDeepLinkTarget.oneOf.map((value) => dereference(openApi, value));
    assert(targets.length >= 10);
    assert.equal(JSON.stringify(targets).includes('url'), false);
    assert.equal(JSON.stringify(targets).includes('query'), false);
    assert.equal(JSON.stringify(targets).includes('fragment'), false);
});
