import { canonicalAdvertisingRequest } from '../../src/advertising/advertising-idempotency.service';
import { DisabledAdvertisingProvider } from '../../src/advertising/advertising-provider';

describe('advertising privacy and fallback policy', () => {
    it('canonicalizes idempotency payloads independent of key order without exposing them as a scope', () => {
        expect(canonicalAdvertisingRequest({ b: 2, a: { d: true, c: 'value' } })).toBe(
            canonicalAdvertisingRequest({ a: { c: 'value', d: true }, b: 2 })
        );
        expect(canonicalAdvertisingRequest({ a: 1 })).not.toBe(canonicalAdvertisingRequest({ a: 2 }));
    });

    it('keeps the external provider adapter disabled by default', async () => {
        const provider = new DisabledAdvertisingProvider();
        await expect(
            provider.decide({
                placementCode: 'NEWS_FEED_BOTTOM',
                surface: 'NEWS_FEED',
                clientKind: 'WEB',
                locale: 'ru-RU',
                formFactor: 'REGULAR',
                connectivity: 'REGULAR',
                criticalState: false,
                providerConsent: false,
            })
        ).resolves.toBeNull();
    });
});
