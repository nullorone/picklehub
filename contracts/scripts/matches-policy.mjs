import assert from 'node:assert/strict';

export const matchOperations = {
    '/matches': ['get', 'post'],
    '/matches/recommendations': ['get'],
    '/matches/{matchId}': ['get', 'patch', 'delete'],
    '/matches/{matchId}/publish': ['post'],
    '/matches/{matchId}/invite/rotate': ['post'],
    '/matches/{matchId}/join': ['post'],
    '/matches/{matchId}/join-requests': ['get'],
    '/matches/{matchId}/join-requests/{joinRequestId}/approve': ['post'],
    '/matches/{matchId}/join-requests/{joinRequestId}/reject': ['post'],
    '/matches/{matchId}/join-requests/{joinRequestId}/withdraw': ['post'],
    '/matches/{matchId}/waitlist': ['get'],
    '/matches/{matchId}/waitlist/{entryId}/withdraw': ['post'],
    '/matches/{matchId}/waitlist/{entryId}/promote': ['post'],
    '/matches/{matchId}/participants/{participantId}/leave': ['post'],
    '/matches/{matchId}/cancel': ['post'],
    '/matches/{matchId}/start': ['post'],
    '/matches/{matchId}/results': ['post'],
    '/matches/{matchId}/results/{resultId}/confirm': ['post'],
    '/matches/{matchId}/results/{resultId}/dispute': ['post'],
    '/match-invites/{inviteToken}': ['get'],
};

export const matchEventFields = {
    'match.created.v1': ['matchId', 'aggregateVersion'],
    'match.published.v1': ['matchId', 'aggregateVersion', 'format', 'visibility', 'joinMode'],
    'match.join.intent.recorded.v1': ['matchId', 'aggregateVersion', 'outcome', 'teamChoice'],
    'match.roster.changed.v1': ['matchId', 'aggregateVersion', 'rosterComplete', 'completionSequence'],
    'match.started.v1': ['matchId', 'aggregateVersion', 'format', 'roster'],
    'match.result.proposed.v1': ['matchId', 'aggregateVersion', 'resultId', 'resultVersion', 'mode'],
    'match.result.disputed.v1': ['matchId', 'aggregateVersion', 'resultId', 'resultVersion', 'mode'],
    'match.completed.confirmed.v1': [
        'matchId',
        'aggregateVersion',
        'resultId',
        'resultVersion',
        'markerId',
        'mode',
        'format',
        'confirmationPath',
    ],
    'match.cancelled.v1': ['matchId', 'aggregateVersion', 'stage'],
};

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

function isBearerProtected(openApi, operation) {
    return operation.security?.some((requirement) =>
        Object.keys(requirement).some(
            (name) => openApi.components.securitySchemes[name]?.scheme?.toLowerCase() === 'bearer'
        )
    );
}

export function checkMatchContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(matchOperations)) {
        assert(openApi.paths[path], `Missing match path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort(), `Unexpected methods on ${path}`);
    }

    const search = openApi.paths['/matches'].get;
    const recommendations = openApi.paths['/matches/recommendations'].get;
    assert(!isBearerProtected(openApi, search), 'Public match search must not require authentication.');
    assert(isBearerProtected(openApi, recommendations), 'Recommendations require an authenticated profile.');
    assert.match(search.description, /only PUBLIC, PUBLISHED/u);
    assert.equal(parameter(openApi, search, 'radiusMeters').schema.maximum, 50000);
    for (const operation of [search, recommendations]) {
        assert(parameter(openApi, operation, 'cursor'), `${operation.operationId} needs cursor pagination.`);
        assert(parameter(openApi, operation, 'limit').schema.maximum === 100);
    }

    const invite = openApi.paths['/match-invites/{inviteToken}'].get;
    assert(!isBearerProtected(openApi, invite), 'Invite detail is a read-only capability.');
    assert.match(invite.description, /grants no mutation rights/u);
    const inviteSchema = dereference(openApi, parameter(openApi, invite, 'inviteToken').schema);
    assert(inviteSchema.minLength >= 22, 'Invite token must encode at least 128 random bits.');

    const readOnly = new Set(['searchMatches', 'getMatch', 'getMatchByInvite']);
    const protectedReads = new Set(['recommendMatches', 'listMatchJoinRequests', 'listMatchWaitlist']);
    for (const [path, methods] of Object.entries(matchOperations)) {
        for (const method of methods) {
            const operation = openApi.paths[path][method];
            for (const responseValue of Object.values(operation.responses)) {
                const response = dereference(openApi, responseValue);
                assert(
                    dereference(openApi, response.headers?.['Cache-Control'])?.required,
                    `${operation.operationId} is no-store.`
                );
            }
            if (!readOnly.has(operation.operationId)) {
                assert(isBearerProtected(openApi, operation), `${operation.operationId} requires bearer auth.`);
            }
            if (!readOnly.has(operation.operationId) && !protectedReads.has(operation.operationId)) {
                for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
                }
                assert(
                    parameter(openApi, operation, 'expectedVersion')?.required ||
                        dereference(openApi, operation.requestBody.content['application/json'].schema),
                    `${operation.operationId} must carry a versioned body or parameter.`
                );
            }
        }
    }

    for (const name of [
        'Match',
        'MatchTeam',
        'MatchParticipant',
        'JoinRequest',
        'WaitlistEntry',
        'MatchResult',
        'GameScore',
        'ResultConfirmation',
    ]) {
        assert(openApi.components.schemas[name], `Missing ${name} wire model.`);
    }
    const game = openApi.components.schemas.GameScore;
    assert.equal(game.properties.teamAPoints.minimum, 0);
    assert.equal(game.properties.teamAPoints.maximum, 99);
    assert.match(openApi.paths['/matches/{matchId}/results'].post.description, /11, 15 and 21/u);

    const channel = asyncApi.channels.matchEvents;
    assert(channel?.address === 'match.events.v1');
    assert.deepEqual(channel.servers, [{ $ref: '#/servers/outbox' }]);
    const messages = Object.values(asyncApi.components.messages).filter((message) => message.name.startsWith('match.'));
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(matchEventFields).sort());
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert.equal(schema.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert.deepEqual(Object.keys(data.properties).sort(), [...matchEventFields[message.name]].sort());
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert.equal(schema.properties.type.const, message.name);
        assert(
            !Object.keys(data.properties).some((name) =>
                /token|invite|user|player|participant|guest|score|point|note|text|reason|venue|location|level/i.test(
                    name
                )
            ),
            `${message.name} exposes a forbidden match field.`
        );
    }
}
