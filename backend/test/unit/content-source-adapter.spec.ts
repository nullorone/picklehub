import {
    AllowlistedContentSourceAdapter,
    isPrivateNetworkAddress,
    type ContentFetchPolicy,
} from '../../src/content/content-source.adapter';

const POLICY: ContentFetchPolicy = {
    sourceId: 'opaque',
    endpoint: 'https://feed.example.test/news',
    integrationKind: 'RSS',
    maximumExcerptCharacters: 20,
    useClasses: ['FETCH_METADATA', 'STORE_METADATA', 'STORE_EXCERPT'],
    timeoutMs: 1000,
};

class StubContentSourceAdapter extends AllowlistedContentSourceAdapter {
    readonly requests: string[] = [];
    readonly policies: ContentFetchPolicy[] = [];

    constructor(private readonly responses: Response[]) {
        super();
    }

    protected override resolve(hostname: string): Promise<string[]> {
        return Promise.resolve(hostname === 'private.example.test' ? ['127.0.0.1'] : ['203.0.113.10']);
    }

    protected override request(url: URL, policy: ContentFetchPolicy): Promise<Response> {
        this.requests.push(url.toString());
        this.policies.push(policy);
        const response = this.responses.shift();
        if (response === undefined) throw new Error('Unexpected request');
        return Promise.resolve(response);
    }
}

describe('content source adapter', () => {
    it('fails closed before network access for a private or non-HTTPS endpoint', async () => {
        const adapter = new AllowlistedContentSourceAdapter();
        await expect(
            adapter.fetch({
                sourceId: 'opaque',
                endpoint: 'https://127.0.0.1/feed',
                integrationKind: 'RSS',
                maximumExcerptCharacters: 200,
                useClasses: ['FETCH_METADATA', 'STORE_METADATA'],
                timeoutMs: 1000,
            })
        ).rejects.toThrow('CONTENT_SOURCE_PRIVATE_NETWORK_REJECTED');
        await expect(
            adapter.fetch({
                sourceId: 'opaque',
                endpoint: 'http://example.test/feed',
                integrationKind: 'RSS',
                maximumExcerptCharacters: 200,
                useClasses: ['FETCH_METADATA', 'STORE_METADATA'],
                timeoutMs: 1000,
            })
        ).rejects.toMatchObject({ code: 'RIGHTS_HOLD' });
    });

    it('requires explicit metadata fetch and storage rights', async () => {
        const adapter = new AllowlistedContentSourceAdapter();
        await expect(
            adapter.fetch({
                sourceId: 'opaque',
                endpoint: 'https://example.test/feed',
                integrationKind: 'RSS',
                maximumExcerptCharacters: 200,
                useClasses: [],
                timeoutMs: 1000,
            })
        ).rejects.toMatchObject({ code: 'RIGHTS_HOLD' });
    });

    it.each(['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '::1', 'fd00::1'])(
        'recognizes non-public address %s',
        (address) => {
            expect(isPrivateNetworkAddress(address)).toBe(true);
        }
    );

    it('checks every redirect target and blocks a redirect to a private address', async () => {
        const adapter = new StubContentSourceAdapter([
            new Response(null, { status: 302, headers: { location: 'https://private.example.test/internal' } }),
        ]);
        await expect(adapter.fetch(POLICY)).rejects.toThrow('CONTENT_SOURCE_PRIVATE_NETWORK_REJECTED');
        expect(adapter.requests).toEqual(['https://feed.example.test/news']);
    });

    it('parses bounded RSS metadata and carries conditional response validators', async () => {
        const adapter = new StubContentSourceAdapter([
            new Response(
                '<rss><channel><item><guid>42</guid><title>Новость</title><link>https://publisher.test/a</link>' +
                    '<description><![CDATA[<b>Короткая</b> выдержка для редактора]]></description>' +
                    '<pubDate>2026-09-14T10:00:00Z</pubDate></item></channel></rss>',
                {
                    headers: {
                        'content-type': 'application/rss+xml; charset=utf-8',
                        etag: '"revision-2"',
                        'last-modified': 'Sun, 14 Sep 2026 10:00:00 GMT',
                    },
                }
            ),
        ]);
        const result = await adapter.fetch(POLICY);
        expect(result).toMatchObject({
            outcome: 'SUCCESS',
            etag: '"revision-2"',
            lastModified: 'Sun, 14 Sep 2026 10:00:00 GMT',
            items: [
                {
                    providerId: '42',
                    canonicalUrl: 'https://publisher.test/a',
                    title: 'Новость',
                    excerpt: 'Короткая выдержка дл',
                },
            ],
        });
    });

    it('accepts 304 without parsing a body and preserves prior validators', async () => {
        const adapter = new StubContentSourceAdapter([new Response(null, { status: 304 })]);
        await expect(
            adapter.fetch({ ...POLICY, etag: '"revision-1"', lastModified: 'Sat, 13 Sep 2026 10:00:00 GMT' })
        ).resolves.toEqual({
            outcome: 'NOT_MODIFIED',
            etag: '"revision-1"',
            lastModified: 'Sat, 13 Sep 2026 10:00:00 GMT',
            items: [],
        });
        expect(adapter.policies).toEqual([
            expect.objectContaining({
                etag: '"revision-1"',
                lastModified: 'Sat, 13 Sep 2026 10:00:00 GMT',
            }),
        ]);
    });

    it('rejects entity declarations, wrong media types and oversized declared responses', async () => {
        const entityAdapter = new StubContentSourceAdapter([
            new Response('<!DOCTYPE rss [<!ENTITY x "secret">]><rss><channel /></rss>', {
                headers: { 'content-type': 'application/rss+xml' },
            }),
        ]);
        await expect(entityAdapter.fetch(POLICY)).rejects.toThrow('CONTENT_SOURCE_RESPONSE_INVALID');

        const mediaAdapter = new StubContentSourceAdapter([
            new Response('{}', { headers: { 'content-type': 'text/html' } }),
        ]);
        await expect(mediaAdapter.fetch(POLICY)).rejects.toThrow('CONTENT_SOURCE_CONTENT_TYPE_REJECTED');

        const largeAdapter = new StubContentSourceAdapter([
            new Response('{}', {
                headers: { 'content-type': 'application/rss+xml', 'content-length': String(2 * 1024 * 1024 + 1) },
            }),
        ]);
        await expect(largeAdapter.fetch(POLICY)).rejects.toThrow('CONTENT_SOURCE_RESPONSE_TOO_LARGE');
    });
});
