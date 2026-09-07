import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function compareSchema(previous, current, location, changes, visited = new Set()) {
    if (!previous || !current || typeof previous !== 'object' || typeof current !== 'object') {
        return;
    }

    const visitKey = `${location}:${previous.$ref ?? ''}:${current.$ref ?? ''}`;
    if (visited.has(visitKey)) {
        return;
    }
    visited.add(visitKey);

    for (const keyword of ['type', 'format', 'const', 'pattern', '$ref']) {
        if (previous[keyword] !== undefined && !same(previous[keyword], current[keyword])) {
            changes.push(`${location}: ${keyword} changed`);
        }
    }

    for (const keyword of ['minimum', 'minLength', 'minItems']) {
        if (
            current[keyword] !== undefined &&
            (previous[keyword] === undefined || current[keyword] > previous[keyword])
        ) {
            changes.push(`${location}: ${keyword} became stricter`);
        }
    }
    for (const keyword of ['maximum', 'maxLength', 'maxItems']) {
        if (
            current[keyword] !== undefined &&
            (previous[keyword] === undefined || current[keyword] < previous[keyword])
        ) {
            changes.push(`${location}: ${keyword} became stricter`);
        }
    }

    if (previous.additionalProperties !== false && current.additionalProperties === false) {
        changes.push(`${location}: additional properties are no longer accepted`);
    }
    if (previous.unevaluatedProperties === undefined && current.unevaluatedProperties?.not !== undefined) {
        changes.push(`${location}: unevaluated properties are no longer accepted`);
    }

    const previousEnum = previous.enum ?? [];
    const currentEnum = new Set(current.enum ?? []);
    for (const value of previousEnum) {
        if (!currentEnum.has(value)) {
            changes.push(`${location}: enum value ${JSON.stringify(value)} was removed`);
        }
    }

    const previousProperties = previous.properties ?? {};
    const currentProperties = current.properties ?? {};
    for (const property of Object.keys(previousProperties)) {
        if (!(property in currentProperties)) {
            changes.push(`${location}.${property}: property was removed`);
        } else {
            compareSchema(
                previousProperties[property],
                currentProperties[property],
                `${location}.${property}`,
                changes,
                visited
            );
        }
    }

    const previousRequired = new Set(previous.required ?? []);
    const currentRequired = new Set(current.required ?? []);
    for (const property of previousRequired) {
        if (!currentRequired.has(property)) {
            changes.push(`${location}.${property}: property is no longer guaranteed`);
        }
    }
    for (const property of current.required ?? []) {
        if (!previousRequired.has(property)) {
            changes.push(`${location}.${property}: property became required`);
        }
    }

    for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
        const previousVariants = previous[keyword] ?? [];
        const currentVariants = current[keyword] ?? [];
        if (previousVariants.length !== currentVariants.length) {
            changes.push(`${location}: ${keyword} variant count changed`);
            continue;
        }
        previousVariants.forEach((variant, index) =>
            compareSchema(variant, currentVariants[index], `${location}.${keyword}[${index}]`, changes, visited)
        );
    }

    if (previous.items && !current.items) {
        changes.push(`${location}.items: item schema was removed`);
    } else if (previous.items) {
        compareSchema(previous.items, current.items, `${location}.items`, changes, visited);
    }
}

function compareNamedMap(previous = {}, current = {}, location, changes, compareValue) {
    for (const [name, value] of Object.entries(previous)) {
        if (!(name in current)) {
            changes.push(`${location}.${name}: removed`);
        } else if (compareValue) {
            compareValue(value, current[name], `${location}.${name}`, changes);
        }
    }
}

function compareOpenApi(previous, current) {
    const changes = [];
    compareNamedMap(previous.paths, current.paths, 'paths', changes, (previousPath, currentPath, location) => {
        for (const method of httpMethods) {
            const previousOperation = previousPath[method];
            if (!previousOperation) {
                continue;
            }
            const currentOperation = currentPath[method];
            if (!currentOperation) {
                changes.push(`${location}.${method}: operation was removed`);
                continue;
            }
            if (previousOperation.operationId !== currentOperation.operationId) {
                changes.push(`${location}.${method}: operationId changed`);
            }
            compareNamedMap(
                previousOperation.responses,
                currentOperation.responses,
                `${location}.${method}.responses`,
                changes
            );
            if (!previousOperation.requestBody?.required && currentOperation.requestBody?.required) {
                changes.push(`${location}.${method}: request body became required`);
            }
            const previousParameters = new Set(
                (previousOperation.parameters ?? []).map(
                    (parameter) => parameter.$ref ?? `${parameter.in}:${parameter.name}`
                )
            );
            for (const parameter of currentOperation.parameters ?? []) {
                const key = parameter.$ref ?? `${parameter.in}:${parameter.name}`;
                if (parameter.required && !previousParameters.has(key)) {
                    changes.push(`${location}.${method}: required parameter ${key} was added`);
                }
            }
        }
    });
    compareNamedMap(
        previous.components?.schemas,
        current.components?.schemas,
        'components.schemas',
        changes,
        compareSchema
    );
    return changes;
}

function compareAsyncApi(previous, current) {
    const changes = [];
    compareNamedMap(
        previous.channels,
        current.channels,
        'channels',
        changes,
        (previousChannel, currentChannel, location) => {
            if (previousChannel.address !== currentChannel.address) {
                changes.push(`${location}: address changed`);
            }
            compareNamedMap(previousChannel.messages, currentChannel.messages, `${location}.messages`, changes);
        }
    );
    compareNamedMap(
        previous.operations,
        current.operations,
        'operations',
        changes,
        (previousOperation, currentOperation, location) => {
            if (
                previousOperation.action !== currentOperation.action ||
                previousOperation.channel?.$ref !== currentOperation.channel?.$ref
            ) {
                changes.push(`${location}: action or channel changed`);
            }
        }
    );
    compareNamedMap(
        previous.components?.messages,
        current.components?.messages,
        'components.messages',
        changes,
        (previousMessage, currentMessage, location) => {
            if (
                previousMessage.name !== currentMessage.name ||
                previousMessage.payload?.$ref !== currentMessage.payload?.$ref
            ) {
                changes.push(`${location}: message name or payload changed`);
            }
        }
    );
    compareNamedMap(
        previous.components?.schemas,
        current.components?.schemas,
        'components.schemas',
        changes,
        compareSchema
    );
    return changes;
}

function readFromGit(reference, file) {
    const result = spawnSync('git', ['show', `${reference}:${file}`], { encoding: 'utf8' });
    return result.status === 0 ? result.stdout : null;
}

function runSelfTest() {
    const baseline = {
        components: {
            schemas: {
                Example: {
                    type: 'object',
                    required: ['status'],
                    properties: { status: { type: 'string', enum: ['OPEN', 'CLOSED'] } },
                },
            },
        },
        paths: {},
    };
    const compatible = structuredClone(baseline);
    compatible.components.schemas.Example.properties.note = { type: 'string' };
    const breaking = structuredClone(baseline);
    breaking.components.schemas.Example.required.push('note');
    breaking.components.schemas.Example.properties.note = { type: 'string' };
    breaking.components.schemas.Example.properties.status.enum = ['OPEN'];

    if (compareOpenApi(baseline, compatible).length !== 0 || compareOpenApi(baseline, breaking).length < 2) {
        throw new Error('Compatibility checker self-test failed.');
    }
}

runSelfTest();
const reference = process.env.CONTRACT_BASE_REF ?? 'HEAD';
const verifiedReference = spawnSync('git', ['rev-parse', '--verify', reference], { encoding: 'utf8' });
if (verifiedReference.status !== 0) {
    throw new Error(`CONTRACT_BASE_REF does not resolve to a commit: ${reference}`);
}

const definitions = [
    ['openapi.yaml', compareOpenApi],
    ['asyncapi.yaml', compareAsyncApi],
];
const breakingChanges = [];
let compared = 0;
for (const [file, compare] of definitions) {
    const previousSource = readFromGit(reference, file);
    if (!previousSource) {
        continue;
    }
    const currentSource = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    breakingChanges.push(...compare(parse(previousSource), parse(currentSource)).map((change) => `${file}: ${change}`));
    compared += 1;
}

if (breakingChanges.length > 0) {
    console.error(breakingChanges.join('\n'));
    throw new Error(`Detected ${breakingChanges.length} potentially breaking contract changes.`);
}

console.log(
    compared === 0
        ? `Compatibility self-test passed; ${reference} has no contract baseline (initial contract publication).`
        : `Compatibility check passed for ${compared} contracts against ${reference}.`
);
