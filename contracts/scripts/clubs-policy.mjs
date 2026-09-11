import assert from 'node:assert/strict';

export const clubOperations = {
    '/clubs': ['get', 'post'],
    '/clubs/{clubId}': ['get', 'patch'],
    '/clubs/{clubId}/archive': ['post'],
    '/clubs/{clubId}/restore': ['post'],
    '/clubs/{clubId}/join': ['post'],
    '/clubs/{clubId}/members': ['get'],
    '/clubs/{clubId}/members/{membershipId}/leave': ['post'],
    '/clubs/{clubId}/members/{membershipId}/exclude': ['post'],
    '/clubs/{clubId}/members/{membershipId}/role': ['patch'],
    '/clubs/{clubId}/members/{membershipId}/block': ['post'],
    '/clubs/{clubId}/ownership/transfer': ['post'],
    '/clubs/{clubId}/join-requests': ['get'],
    '/clubs/{clubId}/join-requests/{joinRequestId}/cancel': ['post'],
    '/clubs/{clubId}/join-requests/{joinRequestId}/approve': ['post'],
    '/clubs/{clubId}/join-requests/{joinRequestId}/reject': ['post'],
    '/clubs/{clubId}/invitations': ['get', 'post'],
    '/clubs/{clubId}/invitations/{invitationId}/revoke': ['post'],
    '/clubs/{clubId}/blocks/{blockId}/lift': ['post'],
    '/clubs/{clubId}/venues': ['get', 'post'],
    '/clubs/{clubId}/venues/{venueId}': ['delete'],
    '/clubs/{clubId}/matches': ['post'],
    '/clubs/{clubId}/recurring-match-rules': ['get', 'post'],
    '/clubs/{clubId}/recurring-match-rules/{ruleId}': ['get', 'patch'],
    '/clubs/{clubId}/recurring-match-rules/{ruleId}/pause': ['post'],
    '/clubs/{clubId}/recurring-match-rules/{ruleId}/resume': ['post'],
    '/clubs/{clubId}/recurring-match-rules/{ruleId}/end': ['post'],
    '/clubs/{clubId}/recurring-match-rules/{ruleId}/occurrences': ['get'],
    '/club-invitations/{invitationToken}': ['get'],
    '/club-invitations/{invitationToken}/accept': ['post'],
    '/club-invitations/{invitationToken}/decline': ['post'],
};

export const clubEventFields = {
    'club.created.v1': ['clubId', 'clubVersion', 'state', 'membershipPolicy'],
    'club.state.changed.v1': ['clubId', 'clubVersion', 'state'],
    'club.membership.changed.v1': ['clubId', 'clubVersion', 'membershipId', 'membershipRevision', 'state', 'role'],
    'club.venue.link.changed.v1': ['clubId', 'clubVersion', 'venueId', 'change'],
    'club.recurring.rule.changed.v1': ['clubId', 'clubVersion', 'ruleId', 'ruleRevision', 'state'],
    'club.recurring.occurrence.recorded.v1': [
        'clubId',
        'clubVersion',
        'ruleId',
        'occurrenceId',
        'calendarKey',
        'state',
        'matchId',
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

export function checkClubContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(clubOperations)) {
        assert(openApi.paths[path], `Missing club path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort(), `Unexpected methods on ${path}`);
    }

    const search = openApi.paths['/clubs'].get;
    const detail = openApi.paths['/clubs/{clubId}'].get;
    const venues = openApi.paths['/clubs/{clubId}/venues'].get;
    assert(!isBearerProtected(openApi, search), 'Club search is public.');
    assert(!isBearerProtected(openApi, detail), 'Active club public detail is public.');
    assert(!isBearerProtected(openApi, venues), 'Linked public venue references are public.');
    assert.match(search.description, /zero venues/u);
    assert(parameter(openApi, search, 'cursor'), 'Club search needs cursor pagination.');
    assert.equal(parameter(openApi, search, 'limit').schema.maximum, 100);
    assert(!openApi.paths['/clubs/{clubId}'].delete, 'Club hard-delete API is forbidden.');

    const protectedReads = new Set([
        'getClubInvitation',
        'listClubMembers',
        'listClubJoinRequests',
        'listClubInvitations',
        'listRecurringMatchRules',
        'getRecurringMatchRule',
        'listRecurringMatchOccurrences',
    ]);
    const publicReads = new Set(['searchClubs', 'getClub', 'listClubVenues']);
    for (const [path, methods] of Object.entries(clubOperations)) {
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
            }
            if (!publicReads.has(operation.operationId) && !protectedReads.has(operation.operationId)) {
                for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
                }
            }
        }
    }

    for (const name of [
        'Club',
        'ClubMembership',
        'ClubInvitation',
        'ClubVenue',
        'RecurringMatchRule',
        'RecurringMatchOccurrence',
        'ClubMatchSource',
    ]) {
        assert(openApi.components.schemas[name], `Missing ${name} wire model.`);
    }
    const rule = openApi.components.schemas.RecurringMatchRule;
    assert.equal(rule.properties.generationHorizonDays.maximum, 42);
    assert.deepEqual(dereference(openApi, rule.properties.dstGapPolicy).enum, ['SKIP']);
    assert.match(openApi.paths['/clubs/{clubId}/recurring-match-rules'].post.description, /IANA timezone/u);
    assert.match(
        openApi.paths['/clubs/{clubId}/recurring-match-rules/{ruleId}/resume'].post.summary,
        /without backfilling/u
    );

    const channel = asyncApi.channels.clubEvents;
    assert.equal(channel?.address, 'club.events.v1');
    assert.deepEqual(channel.servers, [{ $ref: '#/servers/outbox' }]);
    const messages = Object.values(asyncApi.components.messages).filter((message) => message.name.startsWith('club.'));
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(clubEventFields).sort());
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert.equal(schema.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert.deepEqual(Object.keys(data.properties).sort(), [...clubEventFields[message.name]].sort());
        assert(data.required.includes('clubId'), `${message.name} must include clubId.`);
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert(
            !Object.keys(data.properties).some((name) =>
                /user|invitee|token|name|description|locality|coordinate|latitude|longitude|organizer|reason|roster/i.test(
                    name
                )
            ),
            `${message.name} exposes a forbidden club event field.`
        );
    }
}
