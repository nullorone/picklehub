// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { IdentityClient } from '@picklehub/api-client';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdvertisingSlot } from './advertising-ui';

function client(decision: unknown) {
    return {
        recordAdvertisingClick: vi.fn(),
        recordViewableAdvertisingImpression: vi.fn(),
        selectAdvertisingDecision: vi.fn().mockResolvedValue(decision),
    } as unknown as IdentityClient;
}

describe('TMA advertising placement', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('registers the TMA bottom placement without precise geography or free text', async () => {
        const api = client({
            campaignId: crypto.randomUUID(),
            campaignRevisionId: crypto.randomUUID(),
            clickToken: 'c'.repeat(43),
            creative: {
                altText: 'Мячи для пиклбола',
                assetUrl: 'https://assets.example.test/ad.webp',
                body: null,
                byteLength: 100,
                format: 'STATIC_IMAGE',
                headline: null,
                mediaType: 'image/webp',
            },
            creativeId: crypto.randomUUID(),
            deliveryToken: 'd'.repeat(43),
            expiresAt: '2026-09-15T12:15:00.000Z',
            legal: { advertiserName: 'Корт', disclosure: null, label: 'Реклама', registrationToken: null },
            placementId: crypto.randomUUID(),
            refreshAfterSeconds: 300,
            source: 'HOUSE',
        });
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        render(<AdvertisingSlot client={api} clientKind="TMA" online pathname="/venues" />);
        await act(async () => Promise.resolve());

        expect(screen.getByRole('link', { name: /Реклама от Корт/ })).toBeInTheDocument();
        expect(api.selectAdvertisingDecision).toHaveBeenCalledWith({
            context: {
                clientKind: 'TMA',
                connectivity: 'REGULAR',
                criticalState: false,
                formFactor: 'REGULAR',
                locale: 'ru-RU',
                placementCode: 'TMA_SCREEN_BOTTOM',
                providerConsent: false,
                surface: 'VENUES',
            },
        });
        expect(api.recordViewableAdvertisingImpression).not.toHaveBeenCalled();
    });

    it('never requests advertising on score entry', () => {
        const api = client({ source: 'NO_FILL' });
        render(<AdvertisingSlot client={api} clientKind="TMA" online pathname="/matches/new" />);
        expect(api.selectAdvertisingDecision).not.toHaveBeenCalled();
    });
});
