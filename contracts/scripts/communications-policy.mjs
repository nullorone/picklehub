import assert from 'node:assert/strict';

export const communicationOperations = {
    '/matches/{matchId}/conversation': ['get'],
    '/matches/{matchId}/conversation/messages': ['get', 'post'],
    '/matches/{matchId}/conversation/messages/{messageId}': ['patch', 'delete'],
    '/matches/{matchId}/conversation/read': ['post'],
    '/matches/{matchId}/conversation/messages/{messageId}/reports': ['post'],
    '/communication-blocks/{blockedUserId}': ['put', 'delete'],
    '/notifications': ['get'],
    '/notifications/{notificationId}/read': ['post'],
    '/notification-preferences': ['get', 'put'],
    '/notification-devices': ['post'],
    '/notification-devices/{installationId}': ['delete'],
};

export const communicationMessageNames = new Set([
    'chat.subscribe.v1',
    'chat.message.create.v1',
    'chat.message.update.v1',
    'chat.message.delete.v1',
    'chat.subscribed.v1',
    'chat.message.created.v1',
    'chat.message.updated.v1',
    'chat.message.deleted.v1',
    'chat.system.event.v1',
    'notification.created.v1',
    'communication.error.v1',
    'communication.chat.stream.changed.v1',
    'communication.notification.fanout.requested.v1',
    'notification.delivery.requested.v1',
]);

function dereference(document, value) {
    if (value?.$ref) {
        assert(value.$ref.startsWith('#/'), 'Only local references are allowed.');
        return value.$ref
            .slice(2)
            .split('/')
            .reduce((node, key) => node[key], document);
    }
    return value;
}

function parameter(openApi, operation, name) {
    return (operation.parameters ?? []).map((item) => dereference(openApi, item)).find((item) => item.name === name);
}

function bearerProtected(openApi, operation) {
    return operation.security?.some((requirement) =>
        Object.keys(requirement).some(
            (name) => openApi.components.securitySchemes[name]?.scheme?.toLowerCase() === 'bearer'
        )
    );
}

function schemaPropertyNames(document, schema, seen = new Set()) {
    const resolved = dereference(document, schema);
    if (!resolved || seen.has(resolved)) return [];
    seen.add(resolved);
    return [
        ...Object.keys(resolved.properties ?? {}),
        ...Object.values(resolved.properties ?? {}).flatMap((property) =>
            schemaPropertyNames(document, property, seen)
        ),
        ...(resolved.allOf ?? []).flatMap((part) => schemaPropertyNames(document, part, seen)),
        ...(resolved.oneOf ?? []).flatMap((part) => schemaPropertyNames(document, part, seen)),
        ...schemaPropertyNames(document, resolved.items, seen),
    ];
}

function schemaProperty(document, schema, propertyName) {
    const resolved = dereference(document, schema);
    if (resolved?.properties?.[propertyName]) {
        const candidate = dereference(document, resolved.properties[propertyName]);
        if (Object.keys(candidate).length > 0) return candidate;
    }
    for (const part of resolved?.allOf ?? []) {
        const found = schemaProperty(document, part, propertyName);
        if (found) return found;
    }
    return undefined;
}

export function checkCommunicationContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(communicationOperations)) {
        assert(openApi.paths[path], `Missing communication path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort(), `Unexpected methods on ${path}`);
        for (const method of methods) {
            const operation = openApi.paths[path][method];
            assert(bearerProtected(openApi, operation), `${operation.operationId} requires bearer auth.`);
            for (const responseValue of Object.values(operation.responses)) {
                const response = dereference(openApi, responseValue);
                assert(
                    dereference(openApi, response.headers?.['Cache-Control'])?.required,
                    `${operation.operationId} must be no-store.`
                );
            }
            if (
                ![
                    'getMatchConversation',
                    'listConversationMessages',
                    'listNotifications',
                    'getNotificationPreferences',
                ].includes(operation.operationId)
            ) {
                for (const header of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    assert(
                        parameter(openApi, operation, header)?.required,
                        `${operation.operationId} requires ${header}.`
                    );
                }
            }
        }
    }

    const history = openApi.paths['/matches/{matchId}/conversation/messages'].get;
    assert(parameter(openApi, history, 'cursor')?.required, 'Conversation history requires an opaque cursor.');
    assert.equal(parameter(openApi, history, 'limit').schema.maximum, 50);
    assert.match(history.description, /RESYNC_REQUIRED.*reopen the snapshot/u);

    for (const model of ['Conversation', 'Message', 'Notification', 'NotificationDelivery', 'NotificationPreference']) {
        assert(openApi.components.schemas[model], `Missing ${model} wire model.`);
    }
    const text = openApi.components.schemas.ChatText;
    assert.equal(text.maxLength, 2000);
    assert.equal(openApi.components.schemas.NotificationChannel.enum.includes('PUSH'), false);

    for (const channel of ['matchChat', 'notificationStream']) {
        assert.equal(asyncApi.channels[channel].address, '/v1/ws');
        assert.deepEqual(asyncApi.channels[channel].servers, [{ $ref: '#/servers/local' }]);
    }
    assert.equal(asyncApi.channels.communicationEvents.address, 'communication.events.v1');
    assert.equal(asyncApi.channels.notificationDeliveryJobs.address, 'notification-delivery-v1');

    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        communicationMessageNames.has(message.name)
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), [...communicationMessageNames].sort());

    const internalNames = new Set([
        'communication.chat.stream.changed.v1',
        'communication.notification.fanout.requested.v1',
        'notification.delivery.requested.v1',
    ]);
    for (const message of messages.filter((item) => internalNames.has(item.name))) {
        const fields = schemaPropertyNames(asyncApi, message.payload).join(' ');
        assert.doesNotMatch(
            fields,
            /\b(text|revisionText|evidence|route|email|telegram|contact|providerPayload|preview|token)\b/i,
            `${message.name} includes sensitive delivery data.`
        );
    }

    const deliveryPayload = dereference(asyncApi, asyncApi.components.messages.NotificationDeliveryRequested.payload);
    const deliveryData = schemaProperty(asyncApi, deliveryPayload, 'data');
    assert.deepEqual(Object.keys(deliveryData.properties), ['deliveryId']);
    assert.deepEqual(deliveryData.required, ['deliveryId']);
}
