import assert from 'node:assert/strict';

export const miniGameOperations = {
    '/mini-game/webview-launches': ['post'],
    '/mini-game/webview-launches/exchange': ['post'],
    '/mini-game/sessions': ['post'],
    '/mini-game/sessions/{sessionId}/results': ['post'],
    '/mini-game/progress': ['get'],
    '/mini-game/receipts/{receiptId}/reward-claim': ['post'],
};

export const miniGameEventFields = {
    'mini-game.result.recorded.v1': ['receiptId', 'outcome'],
    'mini-game.reward-grant.changed.v1': ['grantId', 'kind', 'state'],
    'mini-game.cosmetic-unlock.changed.v1': ['unlockId', 'state'],
};

function dereference(document, value) {
    if (!value?.$ref) return value;
    assert(value.$ref.startsWith('#/'));
    return value.$ref
        .slice(2)
        .split('/')
        .reduce((node, key) => node[key], document);
}

function parameter(openApi, operation, name) {
    return (operation.parameters ?? []).map((item) => dereference(openApi, item)).find((item) => item.name === name);
}

export function checkMiniGameContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(miniGameOperations)) {
        assert(openApi.paths[path], `Missing mini-game path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), methods);
        for (const method of methods) {
            const operation = openApi.paths[path][method];
            if (path === '/mini-game/webview-launches/exchange') {
                assert.deepEqual(operation.security, [{}], `${operation.operationId} uses only its body capability.`);
            } else {
                assert(
                    operation.security?.some((entry) => entry.BearerAuth),
                    `${operation.operationId} requires bearer.`
                );
            }
            for (const responseValue of Object.values(operation.responses)) {
                const response = dereference(openApi, responseValue);
                const header = dereference(openApi, response.headers?.['Cache-Control']);
                assert(header?.required, `${operation.operationId} must return private no-store.`);
            }
            if (method === 'post') {
                assert(
                    parameter(openApi, operation, 'Idempotency-Key')?.required,
                    `${operation.operationId} is idempotent.`
                );
                if (path === '/mini-game/webview-launches/exchange') {
                    assert(parameter(openApi, operation, 'Origin')?.required, `${operation.operationId} binds origin.`);
                } else {
                    assert.equal(parameter(openApi, operation, 'Origin')?.required, false);
                    assert.equal(parameter(openApi, operation, 'X-CSRF-Token')?.required, false);
                }
            }
        }
    }

    for (const model of ['GameSession', 'GameResult', 'RewardGrant', 'CosmeticUnlock', 'GameSeasonProgress']) {
        assert(openApi.components.schemas[model], `Missing ${model} wire model.`);
    }
    const counters = openApi.components.schemas.GameResultCounters.properties;
    for (const forbidden of [
        'score',
        'inputTrace',
        'pointerCoordinates',
        'keystrokeTiming',
        'frames',
        'fingerprint',
        'deviceId',
        'advertisingId',
        'latitude',
        'longitude',
    ]) {
        assert(!(forbidden in counters), `Game result must not expose ${forbidden}.`);
    }
    assert.equal(openApi.components.schemas.GameSession.properties.resultSubmissionLimit.enum[0], 1);
    assert.equal(openApi.components.schemas.GameConfiguration.properties.pauseResumeTtlSeconds.enum[0], 600);
    assert.match(openApi.paths['/mini-game/sessions'].post.description, /15 minutes/u);
    assert.match(openApi.paths['/mini-game/webview-launches'].post.description, /60-second single-use/u);
    assert.match(
        openApi.paths['/mini-game/receipts/{receiptId}/reward-claim'].post.description,
        /never written directly/u
    );

    const channel = asyncApi.channels.miniGameEvents;
    assert.equal(channel?.address, 'mini-game.events.v1');
    assert.deepEqual(channel.servers, [{ $ref: '#/servers/outbox' }]);
    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        message.name.startsWith('mini-game.')
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(miniGameEventFields).sort());
    const forbiddenEventFields = new Set([
        'userId',
        'sessionId',
        'taskId',
        'challenge',
        'nonce',
        'score',
        'counters',
        'mode',
        'duration',
        'cosmeticCode',
        'amount',
        'reasonCode',
    ]);
    for (const message of messages) {
        const envelope = dereference(asyncApi, message.payload);
        const data = envelope.properties.data;
        assert.equal(envelope.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert.deepEqual(Object.keys(data.properties).sort(), [...miniGameEventFields[message.name]].sort());
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert(!Object.keys(data.properties).some((field) => forbiddenEventFields.has(field)));
    }
}
