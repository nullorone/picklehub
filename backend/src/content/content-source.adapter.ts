import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { contentError } from './content.errors';

export interface ContentFetchPolicy {
    sourceId: string;
    endpoint: string;
    integrationKind: 'RSS' | 'API';
    maximumExcerptCharacters: number;
    useClasses: string[];
    timeoutMs: number;
    etag?: string;
    lastModified?: string;
}

export interface ContentSourceItem {
    providerId: string | null;
    canonicalUrl: string;
    title: string;
    author: string | null;
    publisher: string | null;
    excerpt: string | null;
    originallyPublishedAt: Date | null;
}

export interface ContentFetchResult {
    outcome: 'NOT_MODIFIED' | 'SUCCESS';
    etag?: string;
    lastModified?: string;
    items: ContentSourceItem[];
}

export abstract class ContentSourceAdapterPort {
    abstract fetch(policy: ContentFetchPolicy): Promise<ContentFetchResult>;
}

const MAXIMUM_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAXIMUM_REDIRECTS = 5;
const ACCEPTED_RSS_TYPES = new Set(['application/atom+xml', 'application/rss+xml', 'application/xml', 'text/xml']);
const ACCEPTED_API_TYPES = new Set(['application/json', 'application/feed+json']);

function privateIpv4(parts: number[]): boolean {
    return (
        parts[0] === 0 ||
        parts[0] === 10 ||
        parts[0] === 127 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 100 && (parts[1] ?? 0) >= 64 && (parts[1] ?? 0) <= 127) ||
        (parts[0] ?? 0) >= 224
    );
}

export function isPrivateNetworkAddress(address: string): boolean {
    const normalized = address.toLowerCase().split('%')[0] ?? address.toLowerCase();
    if (isIP(normalized) === 4) return privateIpv4(normalized.split('.').map(Number));
    if (isIP(normalized) !== 6) return true;
    if (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
    )
        return true;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(normalized)?.[1];
    return mapped !== undefined && privateIpv4(mapped.split('.').map(Number));
}

function cleanText(value: unknown, maximum: number): string | null {
    if (typeof value !== 'string') return null;
    const cleaned = value
        .replace(/<[^>]*>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .normalize('NFC')
        .trim();
    return cleaned.length === 0 ? null : cleaned.slice(0, maximum);
}

function array(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function nestedText(value: unknown): string | null {
    if (typeof value === 'string') return value;
    const item = record(value);
    return typeof item?.['#text'] === 'string' ? item['#text'] : null;
}

@Injectable()
export class AllowlistedContentSourceAdapter extends ContentSourceAdapterPort {
    async fetch(policy: ContentFetchPolicy): Promise<ContentFetchResult> {
        this.assertRights(policy);
        let current = this.endpoint(policy.endpoint);
        const visited = new Set<string>();
        for (let redirect = 0; redirect <= MAXIMUM_REDIRECTS; redirect += 1) {
            if (visited.has(current.toString())) throw new Error('CONTENT_SOURCE_REDIRECT_LOOP');
            visited.add(current.toString());
            await this.assertPublicHost(current.hostname);
            const response = await this.request(current, policy);
            if (response.status === 304) return this.consume(response, policy);
            if (response.status >= 300 && response.status < 400) {
                if (redirect === MAXIMUM_REDIRECTS) throw new Error('CONTENT_SOURCE_TOO_MANY_REDIRECTS');
                const location = response.headers.get('location');
                if (location === null) throw new Error('CONTENT_SOURCE_REDIRECT_INVALID');
                current = this.endpoint(new URL(location, current).toString());
                continue;
            }
            return this.consume(response, policy);
        }
        throw new Error('CONTENT_SOURCE_TOO_MANY_REDIRECTS');
    }

    protected request(url: URL, policy: ContentFetchPolicy): Promise<Response> {
        return fetch(url, {
            redirect: 'manual',
            headers: {
                Accept:
                    policy.integrationKind === 'RSS'
                        ? 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8'
                        : 'application/json, application/feed+json;q=0.9',
                ...(policy.etag === undefined ? {} : { 'If-None-Match': policy.etag }),
                ...(policy.lastModified === undefined ? {} : { 'If-Modified-Since': policy.lastModified }),
            },
            signal: AbortSignal.timeout(policy.timeoutMs),
        });
    }

    protected async resolve(hostname: string): Promise<string[]> {
        return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
    }

    private assertRights(policy: ContentFetchPolicy): void {
        if (!policy.useClasses.includes('FETCH_METADATA') || !policy.useClasses.includes('STORE_METADATA'))
            throw contentError('RIGHTS_HOLD', 409);
    }

    private endpoint(value: string): URL {
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '')
                throw new Error('unsafe endpoint');
            return url;
        } catch {
            throw contentError('RIGHTS_HOLD', 409);
        }
    }

    private async assertPublicHost(hostname: string): Promise<void> {
        if (hostname === 'localhost' || (isIP(hostname) !== 0 && isPrivateNetworkAddress(hostname)))
            throw new Error('CONTENT_SOURCE_PRIVATE_NETWORK_REJECTED');
        const addresses = await this.resolve(hostname);
        if (addresses.length === 0 || addresses.some(isPrivateNetworkAddress))
            throw new Error('CONTENT_SOURCE_PRIVATE_NETWORK_REJECTED');
    }

    private async consume(response: Response, policy: ContentFetchPolicy): Promise<ContentFetchResult> {
        const validators = this.validators(response, policy);
        if (response.status === 304) return { outcome: 'NOT_MODIFIED', ...validators, items: [] };
        if (!response.ok) throw new Error(`CONTENT_SOURCE_HTTP_${String(response.status)}`);
        this.assertContentType(response, policy.integrationKind);
        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_RESPONSE_BYTES)
            throw new Error('CONTENT_SOURCE_RESPONSE_TOO_LARGE');
        const bytes = await this.readBounded(response);
        try {
            const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            const items =
                policy.integrationKind === 'RSS' ? this.parseRss(source, policy) : this.parseApi(source, policy);
            return { outcome: 'SUCCESS', ...validators, items };
        } finally {
            bytes.fill(0);
        }
    }

    private validators(
        response: Response,
        policy: ContentFetchPolicy
    ): Pick<ContentFetchResult, 'etag' | 'lastModified'> {
        const etag = response.headers.get('etag') ?? policy.etag;
        const lastModified = response.headers.get('last-modified') ?? policy.lastModified;
        return {
            ...(etag === undefined ? {} : { etag: etag.slice(0, 512) }),
            ...(lastModified === undefined ? {} : { lastModified: lastModified.slice(0, 128) }),
        };
    }

    private assertContentType(response: Response, kind: 'RSS' | 'API'): void {
        const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
        const allowed = kind === 'RSS' ? ACCEPTED_RSS_TYPES : ACCEPTED_API_TYPES;
        if (!allowed.has(contentType)) throw new Error('CONTENT_SOURCE_CONTENT_TYPE_REJECTED');
    }

    private async readBounded(response: Response): Promise<Uint8Array> {
        if (response.body === null) return new Uint8Array();
        const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
            for (;;) {
                const result = await reader.read();
                if (result.done) break;
                length += result.value.byteLength;
                if (length > MAXIMUM_RESPONSE_BYTES) throw new Error('CONTENT_SOURCE_RESPONSE_TOO_LARGE');
                chunks.push(result.value);
            }
            const bytes = new Uint8Array(length);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }
            return bytes;
        } finally {
            await reader.cancel().catch(() => undefined);
            for (const chunk of chunks) chunk.fill(0);
        }
    }

    private parseRss(xml: string, policy: ContentFetchPolicy): ContentSourceItem[] {
        // fast-xml-parser keeps this validator for compatibility; validation happens before the non-executing parser.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        if (/<!DOCTYPE|<!ENTITY/iu.test(xml) || XMLValidator.validate(xml) !== true)
            throw new Error('CONTENT_SOURCE_RESPONSE_INVALID');
        const parsed = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            parseAttributeValue: false,
            parseTagValue: false,
            processEntities: false,
            trimValues: true,
        }).parse(xml) as unknown;
        const root = record(parsed);
        const rss = record(root?.rss);
        const channel = record(rss?.channel);
        const feed = record(root?.feed);
        const entries = channel === null ? array(feed?.entry) : array(channel.item);
        return entries.slice(0, 200).flatMap((entry) => this.rssItem(record(entry), policy));
    }

    private rssItem(value: Record<string, unknown> | null, policy: ContentFetchPolicy): ContentSourceItem[] {
        if (value === null) return [];
        const links = array(value.link);
        const atomLink = links
            .map(record)
            .find((link) => link?.['@_rel'] === undefined || link['@_rel'] === 'alternate');
        const canonicalUrl =
            nestedText(value.link) ?? (typeof atomLink?.['@_href'] === 'string' ? atomLink['@_href'] : null);
        return this.item(
            {
                providerId: nestedText(value.guid) ?? nestedText(value.id),
                canonicalUrl,
                title: nestedText(value.title),
                author: nestedText(value.author) ?? nestedText(value['dc:creator']),
                publisher: nestedText(value.source),
                excerpt: nestedText(value.description) ?? nestedText(value.summary),
                originallyPublishedAt:
                    nestedText(value.pubDate) ?? nestedText(value.published) ?? nestedText(value.updated),
            },
            policy
        );
    }

    private parseApi(json: string, policy: ContentFetchPolicy): ContentSourceItem[] {
        let parsed: unknown;
        try {
            parsed = JSON.parse(json) as unknown;
        } catch {
            throw new Error('CONTENT_SOURCE_RESPONSE_INVALID');
        }
        const items = record(parsed)?.items;
        if (!Array.isArray(items)) throw new Error('CONTENT_SOURCE_RESPONSE_INVALID');
        return items.slice(0, 200).flatMap((value) => this.item(record(value), policy));
    }

    private item(value: Record<string, unknown> | null, policy: ContentFetchPolicy): ContentSourceItem[] {
        if (value === null || typeof value.title !== 'string' || typeof value.canonicalUrl !== 'string') return [];
        let canonicalUrl: URL;
        try {
            canonicalUrl = new URL(value.canonicalUrl);
            if (canonicalUrl.protocol !== 'https:' || canonicalUrl.username !== '' || canonicalUrl.password !== '')
                return [];
        } catch {
            return [];
        }
        const title = cleanText(value.title, 300);
        if (title === null) return [];
        const date = typeof value.originallyPublishedAt === 'string' ? new Date(value.originallyPublishedAt) : null;
        return [
            {
                providerId: cleanText(value.providerId, 500),
                canonicalUrl: canonicalUrl.toString(),
                title,
                author: cleanText(value.author, 200),
                publisher: cleanText(value.publisher, 200),
                excerpt: policy.useClasses.includes('STORE_EXCERPT')
                    ? cleanText(value.excerpt, policy.maximumExcerptCharacters)
                    : null,
                originallyPublishedAt: date !== null && !Number.isNaN(date.getTime()) ? date : null,
            },
        ];
    }
}
