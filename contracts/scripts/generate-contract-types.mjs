import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { TypeScriptGenerator } from '@asyncapi/modelina';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import { format } from 'prettier';
import { parse } from 'yaml';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const generatedHeader = '// Generated from the root contract. Do not edit manually.\n\n';

function indent(source) {
    return source
        .split('\n')
        .map((line) => (line ? `    ${line}` : line))
        .join('\n');
}

function exportDeclarations(source) {
    return source
        .replace(/^\s*(?:'additionalProperties'|additionalProperties)\?: Map<string, any>;\r?\n/gm, '')
        .replace(/^interface MessageEnvelopeData \{\s*\}$/gm, 'type MessageEnvelopeData = Record<string, never>;')
        .replace(/^(interface|type|enum|class) /gm, 'export $1 ');
}

async function generateAsyncApiTypes() {
    const source = await readFile(resolve(repositoryRoot, 'asyncapi.yaml'), 'utf8');
    const document = parse(source);
    const schemas = JSON.parse(
        JSON.stringify(document.components.schemas).replaceAll('#/components/schemas/', '#/definitions/')
    );
    const generator = new TypeScriptGenerator({
        enumType: 'union',
        modelType: 'interface',
        moduleSystem: 'ESM',
        rawPropertyNames: true,
    });
    const sections = [];
    const aliases = [];

    for (const [messageKey, message] of Object.entries(document.components.messages).sort(([left], [right]) =>
        left.localeCompare(right)
    )) {
        const schemaName = message.payload.$ref.split('/').at(-1);
        const input = { ...schemas[schemaName], title: schemaName, definitions: schemas };
        const models = await generator.generate(input);
        const namespace = `${messageKey}Message`;
        const body = models.map((model) => exportDeclarations(model.result.trim())).join('\n\n');
        sections.push(`export namespace ${namespace} {\n${indent(body)}\n}`);
        aliases.push(`export type ${schemaName} = ${namespace}.${schemaName};`);
    }

    aliases.push(
        `export type WebSocketMessage = ${Object.values(document.components.messages)
            .map((message) => message.payload.$ref.split('/').at(-1))
            .sort()
            .join(' | ')};`
    );
    return format(`${generatedHeader}${sections.join('\n\n')}\n\n${aliases.join('\n')}\n`, {
        parser: 'typescript',
        printWidth: 120,
        singleQuote: true,
        tabWidth: 4,
        trailingComma: 'es5',
    });
}

export async function generateContractTypes(outputDirectory, openApiSource = resolve(repositoryRoot, 'openapi.yaml')) {
    const output = resolve(outputDirectory);
    await mkdir(output, { recursive: true });

    const openApiAst = await openapiTS(pathToFileURL(openApiSource), {
        alphabetize: true,
        exportType: true,
        immutable: true,
        rootTypes: true,
    });
    const openApi = await format(`${COMMENT_HEADER}${astToString(openApiAst)}`, {
        parser: 'typescript',
        printWidth: 120,
        singleQuote: true,
        tabWidth: 4,
        trailingComma: 'es5',
    });
    const asyncApi = await generateAsyncApiTypes();

    await Promise.all([
        writeFile(resolve(output, 'openapi.ts'), openApi),
        writeFile(resolve(output, 'asyncapi.ts'), asyncApi),
    ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const output = process.argv[2] ?? resolve(repositoryRoot, 'contracts/generated');
    await generateContractTypes(output);
    console.log(`Generated contract types in ${output}.`);
}
