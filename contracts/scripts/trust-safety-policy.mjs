import assert from 'node:assert/strict';

export const trustSafetyOperations = {
    '/matches/{matchId}/reviews/{subjectPlayerId}': ['put', 'delete'],
    '/matches/{matchId}/no-show-reports': ['post'],
    '/safety-reports': ['post'],
    '/me/safety-reports': ['get'],
    '/me/safety-reports/{receiptId}': ['get'],
    '/me/safety-reports/{receiptId}/withdrawal': ['post'],
    '/me/safety-reports/{receiptId}/responses': ['post'],
    '/me/safety-reports/{receiptId}/appeals': ['post'],
    '/me/blocks': ['get'],
    '/players/{playerId}/reputation': ['get'],
};

export const trustSafetyEventFields = {
    'safety.signal.received.v1': ['signalId', 'category'],
    'safety.case.status.changed.v1': ['caseId', 'category'],
    'safety.decision.recorded.v1': ['decisionId', 'category'],
    'safety.effect.requested.v1': ['effectId', 'category'],
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

function hasBearer(openApi, operation) {
    return operation.security?.some((requirement) =>
        Object.keys(requirement).some(
            (name) => openApi.components.securitySchemes[name]?.scheme?.toLowerCase() === 'bearer'
        )
    );
}

function allowsAnonymous(operation) {
    return operation.security?.some((requirement) => Object.keys(requirement).length === 0);
}

export function checkTrustSafetyContract(openApi, asyncApi) {
    for (const [path, methods] of Object.entries(trustSafetyOperations)) {
        assert(openApi.paths[path], `Missing trust/safety path ${path}`);
        assert.deepEqual(Object.keys(openApi.paths[path]).sort(), [...methods].sort(), `Unexpected methods on ${path}`);
    }

    const blockPath = openApi.paths['/communication-blocks/{blockedUserId}'];
    assert.match(blockPath.put.description, /platform-wide safety preference/u);
    assert.match(blockPath.put.description, /denied in both directions/u);
    assert.match(blockPath.delete.description, /no reciprocal block or moderation restriction/u);

    const publicOperationId = 'getPublicPlayerReputation';
    const readOperations = new Set(['listOwnSafetyReports', 'getOwnSafetyReport', 'listOwnBlocks', publicOperationId]);
    for (const [path, methods] of Object.entries(trustSafetyOperations)) {
        for (const method of methods) {
            const operation = openApi.paths[path][method];
            assert(hasBearer(openApi, operation), `${operation.operationId} must accept bearer authentication.`);
            assert.equal(
                allowsAnonymous(operation),
                operation.operationId === publicOperationId,
                `${operation.operationId} has the wrong anonymous access policy.`
            );
            for (const responseValue of Object.values(operation.responses)) {
                const response = dereference(openApi, responseValue);
                assert(
                    dereference(openApi, response.headers?.['Cache-Control'])?.required,
                    `${operation.operationId} must explicitly disable shared caching.`
                );
            }
            if (!readOperations.has(operation.operationId)) {
                for (const name of ['Origin', 'X-CSRF-Token', 'Idempotency-Key']) {
                    assert(parameter(openApi, operation, name)?.required, `${operation.operationId} requires ${name}.`);
                }
            }
        }
    }

    for (const operationId of ['listOwnSafetyReports', 'listOwnBlocks']) {
        const operation = Object.values(openApi.paths)
            .flatMap((pathItem) => Object.values(pathItem))
            .find((candidate) => candidate?.operationId === operationId);
        assert(parameter(openApi, operation, 'cursor'), `${operationId} needs an opaque cursor.`);
        assert.equal(parameter(openApi, operation, 'limit').schema.maximum, 100);
    }

    const receipt = openApi.components.schemas.SafetyReceipt;
    for (const forbidden of [
        'caseId',
        'reporterId',
        'subjectId',
        'sourceId',
        'evidence',
        'assignee',
        'priority',
        'sanction',
    ]) {
        assert(!(forbidden in receipt.properties), `Safety receipt must not expose ${forbidden}.`);
    }
    assert.deepEqual(Object.keys(receipt.properties).sort(), [
        'appealDeadline',
        'canAppeal',
        'canRespond',
        'canWithdraw',
        'createdAt',
        'kind',
        'outcome',
        'outcomeReason',
        'receiptId',
        'status',
        'updatedAt',
    ]);
    assert.match(openApi.paths['/me/safety-reports/{receiptId}'].get.description, /same SAFETY_RECEIPT_NOT_FOUND/u);
    const ownDetail = openApi.components.schemas.OwnSafetyReportDetail;
    assert.deepEqual(Object.keys(ownDetail.properties).sort(), [
        'ownAppeal',
        'ownResponses',
        'receipt',
        'submittedEvidence',
    ]);
    assert.match(ownDetail.description, /never another party's response or internal evidence/u);

    const aggregate = openApi.components.schemas.PublicReviewAggregate;
    assert.equal(aggregate.properties.reviewCount.minimum, 5);
    assert(
        !Object.keys(aggregate.properties).some((name) => /text|tag|report|block|sanction|match|reviewId/i.test(name))
    );
    assert.match(openApi.paths['/players/{playerId}/reputation'].get.description, /only a reversible average/u);

    for (const schemaName of ['ReviewText', 'SafetyEvidenceText']) {
        assert.match(openApi.components.schemas[schemaName].description, /encrypt/u);
    }
    assert.equal(openApi.components.schemas.ReviewText.maxLength, 500);
    assert.equal(openApi.components.schemas.SafetyEvidenceText.maxLength, 2000);
    for (const schemaName of [
        'SafetyIncidentReport',
        'ContentSafetyReport',
        'VenueSafetyReport',
        'ResultSafetyReport',
    ]) {
        assert(
            !Object.keys(openApi.components.schemas[schemaName].properties).some((name) =>
                /attachment|upload/i.test(name)
            ),
            `${schemaName} must not accept attachments or uploads.`
        );
    }

    const messages = Object.values(asyncApi.components.messages).filter((message) =>
        message.name.startsWith('safety.')
    );
    assert.deepEqual(messages.map((message) => message.name).sort(), Object.keys(trustSafetyEventFields).sort());
    for (const message of messages) {
        const schema = dereference(asyncApi, message.payload);
        const data = schema.properties.data;
        assert.equal(schema.additionalProperties, false);
        assert.equal(data.additionalProperties, false);
        assert(
            !Object.keys(data.properties).some((name) =>
                /reporter|subject|source|reason|status|text|rating|evidence|attachment|block|outcome|decisionDetail/i.test(
                    name
                )
            ),
            `${message.name} exposes a forbidden trust/safety field.`
        );
        assert.deepEqual(Object.keys(data.properties).sort(), [...trustSafetyEventFields[message.name]].sort());
        assert.deepEqual([...data.required].sort(), Object.keys(data.properties).sort());
        assert.equal(schema.properties.type.const, message.name);
    }
}
