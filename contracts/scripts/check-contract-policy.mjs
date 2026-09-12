import { readFile } from 'node:fs/promises';

import { Parser } from '@asyncapi/parser';
import { parse } from 'yaml';
import {
    checkCommunicationContract,
    communicationMessageNames,
    communicationOperations,
} from './communications-policy.mjs';
import { checkIdentityContract, identityOperations, identityEventFields } from './identity-policy.mjs';
import { checkMatchContract, matchOperations, matchEventFields } from './matches-policy.mjs';
import { checkProfileContract, profileOperations, profileEventFields } from './profiles-policy.mjs';
import { checkTrustSafetyContract, trustSafetyEventFields, trustSafetyOperations } from './trust-safety-policy.mjs';
import { checkVenueContract, venueOperations, venueEventFields } from './venues-policy.mjs';
import { checkAdministrationContract, administrationOperations } from './administration-policy.mjs';
import { checkClubContract, clubEventFields, clubOperations } from './clubs-policy.mjs';
import { checkTournamentContract, tournamentEventFields, tournamentOperations } from './tournaments-policy.mjs';
import { checkGamificationContract, gamificationEventFields, gamificationOperations } from './gamification-policy.mjs';

const allowedPaths = new Set([
    '/health/live',
    '/health/ready',
    ...Object.keys(communicationOperations),
    ...Object.keys(identityOperations),
    ...Object.keys(matchOperations),
    ...Object.keys(profileOperations),
    ...Object.keys(trustSafetyOperations),
    ...Object.keys(venueOperations),
    ...Object.keys(administrationOperations),
    ...Object.keys(clubOperations),
    ...Object.keys(tournamentOperations),
    ...Object.keys(gamificationOperations),
]);
const allowedProtocolMessages = new Set([
    'session.authenticate.v1',
    'session.authenticated.v1',
    'protocol.error.v1',
    'protocol.ping.v1',
    'protocol.pong.v1',
]);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function unique(values, label) {
    assert(new Set(values).size === values.length, `${label} must be globally unique.`);
}

const openApiSource = await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8');
const asyncApiSource = await readFile(new URL('../../asyncapi.yaml', import.meta.url), 'utf8');
const openApi = parse(openApiSource);
const asyncApi = parse(asyncApiSource);

assert(openApi.openapi === '3.1.0', 'OpenAPI must use version 3.1.0.');
assert(
    openApi.servers?.length === 1 && openApi.servers[0].url === '/v1',
    'OpenAPI must expose one relative /v1 server.'
);
assert(
    Object.keys(openApi.paths).every((path) => allowedPaths.has(path)) &&
        Object.keys(openApi.paths).length === allowedPaths.size,
    'OpenAPI may expose only approved owning-feature paths.'
);

const operationIds = Object.values(openApi.paths).flatMap((pathItem) =>
    Object.values(pathItem)
        .filter((operation) => operation && typeof operation === 'object' && 'operationId' in operation)
        .map((operation) => operation.operationId)
);
unique(operationIds, 'OpenAPI operationId values');
assert(operationIds.every(Boolean), 'Every OpenAPI operation must have an operationId.');
assert(
    openApi.components.schemas.Timestamp.pattern.endsWith('Z$'),
    'OpenAPI Timestamp must require an uppercase UTC Z suffix.'
);
const errorEnvelope = openApi.components.schemas.ErrorEnvelope;
assert(
    errorEnvelope.additionalProperties === false || errorEnvelope.unevaluatedProperties?.not !== undefined,
    'ErrorEnvelope must reject unknown fields.'
);
assert(openApi.components.schemas.PageInfo.required.includes('nextCursor'), 'PageInfo must expose nextCursor.');
const typeSpecSource = await readFile(new URL('../rest/main.tsp', import.meta.url), 'utf8');
assert(typeSpecSource.includes('@header("Idempotency-Key")'), 'TypeSpec must define the Idempotency-Key header.');
assert(typeSpecSource.includes('idempotencyKey: Key;'), 'Idempotency-Key must be required when referenced.');
assert(typeSpecSource.includes('Key extends UuidV4'), 'Idempotency-Key must require a random UUIDv4.');

const parser = new Parser();
const parsed = await parser.parse(asyncApiSource);
const parserErrors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity <= 1);
if (!parsed.document || parserErrors.length > 0) {
    for (const diagnostic of parsed.diagnostics) {
        console.error(`[AsyncAPI:${diagnostic.severity}] ${diagnostic.message} at ${diagnostic.path.join('/')}`);
    }
    throw new Error('AsyncAPI parser reported errors or warnings.');
}

assert(asyncApi.asyncapi === '3.1.0', 'AsyncAPI must use version 3.1.0.');
assert(asyncApi.channels.control.address === '/v1/ws', 'AsyncAPI control channel must use /v1/ws.');
const messages = Object.values(asyncApi.components.messages);
const messageNames = messages.map((message) => message.name);
unique(messageNames, 'AsyncAPI message names');
assert(
    messageNames.every(
        (name) =>
            allowedProtocolMessages.has(name) ||
            communicationMessageNames.has(name) ||
            name in identityEventFields ||
            name in matchEventFields ||
            name in profileEventFields ||
            name in trustSafetyEventFields ||
            name in venueEventFields ||
            name in clubEventFields ||
            name in tournamentEventFields ||
            name in gamificationEventFields
    ),
    'AsyncAPI may define only approved protocol and owning-feature messages.'
);
assert(
    messageNames.every((name) => /\.v[1-9][0-9]*$/.test(name)),
    'Every AsyncAPI message name must end with a schema version.'
);
assert(
    new Set(messageNames).size ===
        allowedProtocolMessages.size +
            Object.keys(identityEventFields).length +
            communicationMessageNames.size +
            Object.keys(matchEventFields).length +
            Object.keys(profileEventFields).length +
            Object.keys(trustSafetyEventFields).length +
            Object.keys(venueEventFields).length +
            Object.keys(clubEventFields).length +
            Object.keys(tournamentEventFields).length +
            Object.keys(gamificationEventFields).length,
    'AsyncAPI must define all approved protocol and owning-feature messages.'
);

for (const message of messages) {
    assert(
        message.correlationId?.location === '$message.payload#/correlationId',
        `${message.name} must locate correlationId.`
    );
    for (const example of message.examples ?? []) {
        assert(example.payload?.type === message.name, `Example ${example.name} must use the owning message type.`);
        assert(example.payload?.occurredAt?.endsWith('Z'), `Example ${example.name} must use a UTC timestamp.`);
    }
}

const envelope = asyncApi.components.schemas.MessageEnvelope;
for (const field of ['messageId', 'type', 'occurredAt', 'correlationId', 'data']) {
    assert(envelope.required.includes(field), `MessageEnvelope must require ${field}.`);
}
assert(
    asyncApi.components.schemas.Timestamp.pattern.endsWith('Z$'),
    'AsyncAPI Timestamp must require an uppercase UTC Z suffix.'
);

checkIdentityContract(openApi, asyncApi);
checkCommunicationContract(openApi, asyncApi);
checkMatchContract(openApi, asyncApi);
checkProfileContract(openApi, asyncApi);
checkTrustSafetyContract(openApi, asyncApi);
checkVenueContract(openApi, asyncApi);
checkAdministrationContract(openApi);
checkClubContract(openApi, asyncApi);
checkTournamentContract(openApi, asyncApi);
checkGamificationContract(openApi, asyncApi);

console.log(`Contract policy passed: ${operationIds.length} REST operations, ${messageNames.length} messages.`);
