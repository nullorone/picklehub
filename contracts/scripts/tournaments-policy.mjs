import assert from 'node:assert/strict';

export const tournamentOperations = {
    '/tournaments': ['get', 'post'],
    '/tournaments/{tournamentId}': ['get', 'patch'],
    '/tournaments/{tournamentId}/publish': ['post'],
    '/tournaments/{tournamentId}/registrations': ['post'],
    '/tournaments/{tournamentId}/entrants': ['get'],
    '/tournaments/{tournamentId}/entrants/{entrantId}/check-in': ['post'],
    '/tournaments/{tournamentId}/entrants/{entrantId}/withdraw': ['post'],
    '/tournaments/{tournamentId}/entrants/{entrantId}/payment-mark': ['put'],
    '/tournaments/{tournamentId}/seed': ['post'],
    '/tournaments/{tournamentId}/start': ['post'],
    '/tournaments/{tournamentId}/plan': ['get'],
    '/tournaments/{tournamentId}/rounds/{roundId}/start': ['post'],
    '/tournaments/{tournamentId}/rounds/{roundId}/complete': ['post'],
    '/tournaments/{tournamentId}/matches/{tournamentMatchId}/score': ['put'],
    '/tournaments/{tournamentId}/matches/{tournamentMatchId}/walkover': ['put'],
    '/tournaments/{tournamentId}/matches/{tournamentMatchId}/corrections': ['post'],
    '/tournaments/{tournamentId}/pause': ['post'],
    '/tournaments/{tournamentId}/resume': ['post'],
    '/tournaments/{tournamentId}/complete': ['post'],
    '/tournaments/{tournamentId}/cancel': ['post'],
};

export const tournamentEventFields = {
    'tournament.created.v1': ['tournamentId', 'aggregateVersion', 'formatCode'],
    'tournament.state.changed.v1': ['tournamentId', 'aggregateVersion', 'state'],
    'tournament.entrant.changed.v1': ['tournamentId', 'aggregateVersion', 'entrantId', 'entrantRevision', 'state'],
    'tournament.plan.changed.v1': ['tournamentId', 'aggregateVersion', 'projectionRevision', 'outcome'],
    'tournament.result.changed.v1': [
        'tournamentId',
        'aggregateVersion',
        'tournamentMatchId',
        'resultRevision',
        'outcome',
    ],
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

export function checkTournamentContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(tournamentOperations)) {
        assert(openApi.paths[path], `Missing tournament path ${path}`);
        assert.deepEqual(
            Object.keys(openApi.paths[path]).sort(),
            [...methods].sort(),
            `Unexpected tournament methods on ${path}`
        );
    }

    const publicReads = new Set(['searchTournaments', 'getTournament', 'getTournamentPlan']);
    for (const [path, methods] of Object.entries(tournamentOperations)) {
        for (const method of methods) {
            const operation = openApi.paths[path][method];
            for (const responseValue of Object.values(operation.responses)) {
                const response = dereference(openApi, responseValue);
                assert(
                    dereference(openApi, response.headers?.['Cache-Control'])?.required,
                    `${operation.operationId} must be no-store.`
                );
            }
            if (!publicReads.has(operation.operationId)) {
                assert(isBearerProtected(openApi, operation), `${operation.operationId} requires bearer auth.`);
                if (method !== 'get') {
                    for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                        assert(
                            parameter(openApi, operation, name)?.required,
                            `${operation.operationId} requires ${name}.`
                        );
                    }
                }
            }
        }
    }
    assert(!openApi.paths['/tournaments/{tournamentId}'].delete, 'Tournament hard delete is forbidden.');
    const search = openApi.paths['/tournaments'].get;
    assert(!isBearerProtected(openApi, search), 'Tournament search is public.');
    assert(parameter(openApi, search, 'cursor'), 'Tournament search requires an opaque cursor.');

    for (const name of [
        'Tournament',
        'Entrant',
        'EntrantMember',
        'Stage',
        'Round',
        'TournamentMatch',
        'CourtAssignment',
        'Standing',
        'FormatDefinition',
        'PaymentMark',
        'TournamentFormatStrategyInput',
        'TournamentFormatStrategyOutput',
    ]) {
        assert(openApi.components.schemas[name], `Missing ${name} wire model.`);
    }
    const formatCodes = dereference(openApi, openApi.components.schemas.TournamentFormatCode).enum;
    assert.deepEqual(formatCodes, [
        'AMERICANO',
        'ROUND_ROBIN',
        'SINGLE_ELIMINATION',
        'DOUBLE_ELIMINATION',
        'POOL_PLAY',
        'SWISS',
        'LADDER',
        'KING_OF_COURT',
        'CUSTOM_DSL',
    ]);
    assert.match(openApi.paths['/tournaments'].post.description, /CUSTOM_DSL_DISABLED/u);
    assert.match(
        openApi.paths['/tournaments/{tournamentId}/matches/{tournamentMatchId}/score'].put.description,
        /draw/u
    );
    assert.match(
        openApi.paths['/tournaments/{tournamentId}/matches/{tournamentMatchId}/walkover'].put.description,
        /empty elimination source/u
    );

    const channel = asyncApi.channels.tournamentEvents;
    assert.equal(channel?.address, 'tournament.events.v1');
    assert.deepEqual(channel.servers, [{ $ref: '#/servers/outbox' }]);
    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        message.name.startsWith('tournament.')
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(tournamentEventFields).sort());
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert.equal(schema.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert.deepEqual(Object.keys(data.properties).sort(), [...tournamentEventFields[message.name]].sort());
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        const forbidden = new Set([
            'userId',
            'memberId',
            'roster',
            'paymentState',
            'price',
            'score',
            'winnerEntrantId',
            'seed',
            'rating',
            'schedule',
            'venueId',
            'clubId',
            'actorId',
            'reason',
            'reasonCode',
            'name',
            'description',
        ]);
        assert(
            !Object.keys(data.properties).some((name) => forbidden.has(name)),
            `${message.name} exposes a forbidden tournament event field.`
        );
    }
}
