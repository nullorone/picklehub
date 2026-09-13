import { AllowlistedContentSourceAdapter } from '../../src/content/content-source.adapter';

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
});
