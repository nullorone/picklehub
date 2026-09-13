import { Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

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

function privateAddress(address: string): boolean {
    if (address === '::1' || address === '0.0.0.0' || address.startsWith('fe80:') || address.startsWith('fc'))
        return true;
    const parts = address.split('.').map(Number);
    return (
        parts.length === 4 &&
        (parts[0] === 10 ||
            parts[0] === 127 ||
            (parts[0] === 169 && parts[1] === 254) ||
            (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            (parts[0] === 100 && (parts[1] ?? 0) >= 64 && (parts[1] ?? 0) <= 127))
    );
}

function decodedXml(value: string): string {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/&lt;/gu, '<')
        .replace(/&gt;/gu, '>')
        .replace(/&amp;/gu, '&')
        .replace(/&quot;/gu, '"')
        .replace(/&#39;/gu, "'")
        .replace(/\s+/gu, ' ')
        .trim();
}

function xmlField(item: string, names: string[]): string | null {
    for (const name of names) {
        const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'iu').exec(item);
        if (match?.[1] !== undefined) return decodedXml(match[1]);
    }
    return null;
}

@Injectable()
export class AllowlistedContentSourceAdapter extends ContentSourceAdapterPort {
    async fetch(policy: ContentFetchPolicy): Promise<ContentFetchResult> {
        if (!policy.useClasses.includes('FETCH_METADATA') || !policy.useClasses.includes('STORE_METADATA'))
            throw contentError('RIGHTS_HOLD', 409);
        const endpoint = new URL(policy.endpoint);
        if (endpoint.protocol !== 'https:' || endpoint.username !== '' || endpoint.password !== '')
            throw contentError('RIGHTS_HOLD', 409);
        await this.assertPublicHost(endpoint.hostname);
        const response = await fetch(endpoint, {
            redirect: 'manual',
            headers: {
                Accept:
                    policy.integrationKind === 'RSS' ? 'application/rss+xml, application/atom+xml' : 'application/json',
                ...(policy.etag === undefined ? {} : { 'If-None-Match': policy.etag }),
                ...(policy.lastModified === undefined ? {} : { 'If-Modified-Since': policy.lastModified }),
            },
            signal: AbortSignal.timeout(policy.timeoutMs),
        });
        if (response.status === 304)
            return {
                outcome: 'NOT_MODIFIED',
                ...((response.headers.get('etag') ?? policy.etag) === undefined
                    ? {}
                    : { etag: response.headers.get('etag') ?? policy.etag }),
                ...((response.headers.get('last-modified') ?? policy.lastModified) === undefined
                    ? {}
                    : { lastModified: response.headers.get('last-modified') ?? policy.lastModified }),
                items: [],
            };
        if (response.status >= 300 && response.status < 400) throw new Error('CONTENT_SOURCE_REDIRECT_REJECTED');
        if (!response.ok) throw new Error(`CONTENT_SOURCE_HTTP_${String(response.status)}`);
        const maximumBytes = 2 * 1024 * 1024;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > maximumBytes) throw new Error('CONTENT_SOURCE_RESPONSE_TOO_LARGE');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const items = policy.integrationKind === 'RSS' ? this.parseRss(text, policy) : this.parseApi(text, policy);
        bytes.fill(0);
        return {
            outcome: 'SUCCESS',
            ...(response.headers.get('etag') === null ? {} : { etag: response.headers.get('etag') ?? '' }),
            ...(response.headers.get('last-modified') === null
                ? {}
                : { lastModified: response.headers.get('last-modified') ?? '' }),
            items,
        };
    }

    private async assertPublicHost(hostname: string): Promise<void> {
        if (hostname === 'localhost' || (isIP(hostname) !== 0 && privateAddress(hostname)))
            throw new Error('CONTENT_SOURCE_PRIVATE_NETWORK_REJECTED');
        const addresses = await lookup(hostname, { all: true, verbatim: true });
        if (addresses.length === 0 || addresses.some(({ address }) => privateAddress(address)))
            throw new Error('CONTENT_SOURCE_PRIVATE_NETWORK_REJECTED');
    }

    private parseRss(xml: string, policy: ContentFetchPolicy): ContentSourceItem[] {
        const blocks = xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/giu) ?? [];
        return blocks.slice(0, 200).flatMap((block) => {
            const title = xmlField(block, ['title']);
            const canonicalUrl =
                xmlField(block, ['link']) ??
                /<link[^>]+href=["'](https:\/\/[^"']+)["'][^>]*\/?\s*>/iu.exec(block)?.[1] ??
                null;
            if (title === null || canonicalUrl === null) return [];
            return this.item(
                {
                    providerId: xmlField(block, ['guid', 'id']),
                    canonicalUrl,
                    title,
                    author: xmlField(block, ['author', 'dc:creator']),
                    publisher: xmlField(block, ['source']),
                    excerpt: xmlField(block, ['description', 'summary']),
                    originallyPublishedAt: xmlField(block, ['pubDate', 'published', 'updated']),
                },
                policy
            );
        });
    }

    private parseApi(json: string, policy: ContentFetchPolicy): ContentSourceItem[] {
        const parsed = JSON.parse(json) as { items?: unknown };
        if (!Array.isArray(parsed.items)) throw new Error('CONTENT_SOURCE_RESPONSE_INVALID');
        return parsed.items.slice(0, 200).flatMap((value) => {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
            return this.item(value as Record<string, unknown>, policy);
        });
    }

    private item(value: Record<string, unknown>, policy: ContentFetchPolicy): ContentSourceItem[] {
        if (typeof value.title !== 'string' || typeof value.canonicalUrl !== 'string') return [];
        let url: URL;
        try {
            url = new URL(value.canonicalUrl);
        } catch {
            return [];
        }
        if (url.protocol !== 'https:' || value.title.length < 1 || value.title.length > 300) return [];
        const excerptAllowed = policy.useClasses.includes('STORE_EXCERPT');
        const excerpt =
            excerptAllowed && typeof value.excerpt === 'string'
                ? decodedXml(value.excerpt).slice(0, policy.maximumExcerptCharacters)
                : null;
        const date = typeof value.originallyPublishedAt === 'string' ? new Date(value.originallyPublishedAt) : null;
        return [
            {
                providerId: typeof value.providerId === 'string' ? value.providerId.slice(0, 500) : null,
                canonicalUrl: url.toString(),
                title: value.title.normalize('NFC').trim(),
                author: typeof value.author === 'string' ? value.author.normalize('NFC').trim().slice(0, 200) : null,
                publisher:
                    typeof value.publisher === 'string' ? value.publisher.normalize('NFC').trim().slice(0, 200) : null,
                excerpt,
                originallyPublishedAt: date !== null && !Number.isNaN(date.getTime()) ? date : null,
            },
        ];
    }
}
