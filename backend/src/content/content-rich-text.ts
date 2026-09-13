import { createHash } from 'node:crypto';

import { contentError } from './content.errors';

const BLOCK_KEYS = new Set(['kind', 'headingLevel', 'inlines', 'items']);
const INLINE_KEYS = new Set(['text', 'marks', 'href']);
const BLOCK_KINDS = new Set(['PARAGRAPH', 'HEADING', 'BULLETED_LIST', 'NUMBERED_LIST', 'QUOTE']);
const MARKS = new Set(['STRONG', 'EMPHASIS', 'CODE']);

export interface SafeRichTextInline {
    text: string;
    marks?: string[];
    href?: string;
}

export interface SafeRichTextBlock {
    kind: string;
    headingLevel?: number;
    inlines?: SafeRichTextInline[];
    items?: SafeRichTextInline[][];
}

export interface SafeRichTextDocument {
    format: 'SAFE_RICH_TEXT_V1';
    blocks: SafeRichTextBlock[];
}

function exactKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
    return Object.keys(value).every((key) => keys.has(key));
}

function isHttps(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.username === '' && url.password === '';
    } catch {
        return false;
    }
}

function validateInline(value: unknown): value is SafeRichTextInline {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const inline = value as Record<string, unknown>;
    if (!exactKeys(inline, INLINE_KEYS) || typeof inline.text !== 'string') return false;
    if (inline.text.length < 1 || inline.text.length > 4000) return false;
    if (
        inline.marks !== undefined &&
        (!Array.isArray(inline.marks) ||
            inline.marks.length > 3 ||
            new Set(inline.marks).size !== inline.marks.length ||
            !inline.marks.every((mark) => typeof mark === 'string' && MARKS.has(mark)))
    )
        return false;
    return inline.href === undefined || (typeof inline.href === 'string' && isHttps(inline.href));
}

export function assertSafeRichText(value: unknown): asserts value is SafeRichTextDocument {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw contentError('CONTENT_FORMAT_REJECTED', 422);
    const document = value as Record<string, unknown>;
    if (
        !exactKeys(document, new Set(['format', 'blocks'])) ||
        document.format !== 'SAFE_RICH_TEXT_V1' ||
        !Array.isArray(document.blocks) ||
        document.blocks.length < 1 ||
        document.blocks.length > 300 ||
        JSON.stringify(value).length > 250_000
    )
        throw contentError('CONTENT_FORMAT_REJECTED', 422);
    for (const valueBlock of document.blocks) {
        if (typeof valueBlock !== 'object' || valueBlock === null || Array.isArray(valueBlock))
            throw contentError('CONTENT_FORMAT_REJECTED', 422);
        const block = valueBlock as Record<string, unknown>;
        if (!exactKeys(block, BLOCK_KEYS) || typeof block.kind !== 'string' || !BLOCK_KINDS.has(block.kind))
            throw contentError('CONTENT_FORMAT_REJECTED', 422);
        const isHeading = block.kind === 'HEADING';
        const isList = block.kind === 'BULLETED_LIST' || block.kind === 'NUMBERED_LIST';
        if (
            (isHeading && block.headingLevel !== 2 && block.headingLevel !== 3) ||
            (!isHeading && block.headingLevel !== undefined)
        )
            throw contentError('CONTENT_FORMAT_REJECTED', 422);
        if (isList) {
            if (
                block.inlines !== undefined ||
                !Array.isArray(block.items) ||
                block.items.length < 1 ||
                block.items.length > 50 ||
                !block.items.every(
                    (item) => Array.isArray(item) && item.length > 0 && item.length <= 100 && item.every(validateInline)
                )
            )
                throw contentError('CONTENT_FORMAT_REJECTED', 422);
        } else if (
            block.items !== undefined ||
            !Array.isArray(block.inlines) ||
            block.inlines.length > 100 ||
            !block.inlines.every(validateInline)
        ) {
            throw contentError('CONTENT_FORMAT_REJECTED', 422);
        }
    }
}

export function richTextHash(document: SafeRichTextDocument): string {
    return createHash('sha256').update(JSON.stringify(document)).digest('hex');
}

export function richTextPlainText(document: SafeRichTextDocument): string {
    return document.blocks
        .flatMap((block) => block.inlines ?? block.items?.flat() ?? [])
        .map((inline) => inline.text)
        .join(' ')
        .normalize('NFC');
}
