import assert from 'node:assert/strict';

export const gamificationOperations = {
    '/gamification/progress': ['get'],
    '/gamification/achievements': ['get'],
    '/gamification/seasons/{seasonId}/leaderboard': ['get'],
    '/gamification/seasons/{seasonId}/leaderboard-consent': ['put'],
    '/gamification/admin/definitions': ['get'],
    '/clubs/{clubId}/gamification/progress': ['get'],
    '/clubs/{clubId}/gamification/configuration': ['get', 'put'],
};

export const gamificationEventFields = {
    'gamification.xp-ledger-entry.recorded.v1': ['ledgerEntryId', 'projectionRevision', 'outcome'],
    'gamification.achievement-award.changed.v1': ['achievementAwardId', 'state'],
    'gamification.leaderboard-consent.changed.v1': ['consentId', 'revision', 'action'],
    'gamification.leaderboard-projection.changed.v1': ['seasonId', 'projectionRevision', 'outcome'],
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

export function checkGamificationContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(gamificationOperations)) {
        assert(openApi.paths[path], `Missing gamification path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort());
        for (const method of methods) {
            const operation = openApi.paths[path][method];
            assert(
                operation.security?.some((entry) => entry.BearerAuth),
                `${operation.operationId} requires bearer.`
            );
            for (const responseValue of Object.values(operation.responses)) {
                const response = dereference(openApi, responseValue);
                const header = dereference(openApi, response.headers?.['Cache-Control']);
                assert(header?.required, `${operation.operationId} must return private no-store.`);
            }
            if (method === 'put') {
                for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
                }
            }
        }
    }

    for (const model of [
        'XpLedgerEntry',
        'LevelDefinition',
        'AchievementDefinition',
        'AchievementAward',
        'LeaderboardSeason',
        'LeaderboardEntry',
        'LeaderboardConsent',
        'GamificationProgress',
    ]) {
        assert(openApi.components.schemas[model], `Missing ${model} wire model.`);
    }
    const sources = dereference(openApi, openApi.components.schemas.XpSourceKind).enum;
    assert.deepEqual(sources, ['CONFIRMED_PLAY', 'CONFIRMED_MATCH_ORGANIZED', 'ELIGIBLE_STRUCTURED_REVIEW']);
    assert.match(openApi.paths['/gamification/seasons/{seasonId}/leaderboard'].get.description, /explicitly opted-in/u);
    assert.match(openApi.paths['/clubs/{clubId}/gamification/progress'].get.description, /independent/u);

    const channel = asyncApi.channels.gamificationEvents;
    assert.equal(channel?.address, 'gamification.events.v1');
    assert.deepEqual(channel.servers, [{ $ref: '#/servers/outbox' }]);
    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        message.name.startsWith('gamification.')
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(gamificationEventFields).sort());
    const forbidden = new Set([
        'userId',
        'clubId',
        'sourceEventId',
        'sourceKind',
        'matchId',
        'reviewId',
        'score',
        'winnerId',
        'amount',
        'rank',
        'displayName',
        'avatarUrl',
        'reasonCode',
        'evidence',
    ]);
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert.equal(schema.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert.deepEqual(Object.keys(data.properties).sort(), [...gamificationEventFields[message.name]].sort());
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert(
            !Object.keys(data.properties).some((name) => forbidden.has(name)),
            `${message.name} leaks private data.`
        );
    }
}
