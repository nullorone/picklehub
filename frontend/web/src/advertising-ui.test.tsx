// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { IdentityClient } from '@picklehub/api-client';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdvertisingSlot } from './advertising-ui';
import { createViewabilityTracker } from './advertising-viewability';

const creative = {
    campaignId: crypto.randomUUID(),
    campaignRevisionId: crypto.randomUUID(),
    clickToken: 'k'.repeat(43),
    creative: {
        altText: 'Ракетка для пиклбола',
        assetUrl: 'https://assets.example.test/ad.webp',
        body: 'Для игры на корте',
        byteLength: 1024,
        format: 'TEXT_IMAGE_CARD',
        headline: 'Новая ракетка',
        mediaType: 'image/webp',
    },
    creativeId: crypto.randomUUID(),
    deliveryToken: 'd'.repeat(43),
    expiresAt: '2026-09-15T12:15:00.000Z',
    legal: { advertiserName: 'Спорт', disclosure: null, label: 'Реклама', registrationToken: 'ERID-TEST' },
    placementId: crypto.randomUUID(),
    refreshAfterSeconds: 300,
    source: 'DIRECT',
} as const;

let intersection: IntersectionObserverCallback;

function client(decision: unknown = creative) {
    return {
        recordAdvertisingClick: vi.fn(),
        recordViewableAdvertisingImpression: vi.fn().mockResolvedValue({ accepted: true }),
        selectAdvertisingDecision: vi.fn().mockResolvedValue(decision),
    } as unknown as IdentityClient;
}

describe('web advertising placement', () => {
    beforeEach(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        vi.stubGlobal(
            'IntersectionObserver',
            class {
                constructor(callback: IntersectionObserverCallback) {
                    intersection = callback;
                }
                disconnect() {
                    return undefined;
                }
                observe() {
                    return undefined;
                }
                takeRecords() {
                    return [];
                }
                unobserve() {
                    return undefined;
                }
                root = null;
                rootMargin = '0px';
                thresholds = [0, 0.5, 1];
            }
        );
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('uses only allowlisted coarse context and ignores a creative below the viewability threshold', async () => {
        const api = client();
        render(<AdvertisingSlot client={api} clientKind="WEB" online pathname="/news/ru-RU/article" />);
        await act(async () => Promise.resolve());

        expect(screen.getByRole('link', { name: /Реклама от Спорт/ })).toBeInTheDocument();
        expect(api.selectAdvertisingDecision).toHaveBeenCalledWith({
            context: {
                clientKind: 'WEB',
                connectivity: 'REGULAR',
                criticalState: false,
                formFactor: 'REGULAR',
                locale: 'ru-RU',
                placementCode: 'WEB_SCREEN_BOTTOM',
                providerConsent: false,
                surface: 'NEWS',
            },
        });

        act(() => {
            intersection(
                [{ intersectionRatio: 0.49, isIntersecting: true } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });
        expect(api.recordViewableAdvertisingImpression).not.toHaveBeenCalled();
    });

    it('records a qualifying continuous view once with the fixed one-second delay', () => {
        const record = vi.fn();
        let scheduled: (() => void) | undefined;
        const cancel = vi.fn();
        const tracker = createViewabilityTracker(record, (callback, delay) => {
            expect(delay).toBe(1000);
            scheduled = callback;
            return cancel;
        });
        tracker.update(0.75, true);
        scheduled?.();
        tracker.update(1, true);
        scheduled?.();
        expect(record).toHaveBeenCalledTimes(1);
        expect(record).toHaveBeenCalledWith(75);
    });

    it('does not request or render on a report flow and collapses no-fill', async () => {
        const blocked = client();
        const noFill = client({ source: 'NO_FILL', reason: 'NO_ELIGIBLE_CAMPAIGN', retryAfterSeconds: null });
        const { rerender } = render(
            <AdvertisingSlot client={blocked} clientKind="WEB" online pathname="/safety/report" />
        );
        expect(blocked.selectAdvertisingDecision).not.toHaveBeenCalled();

        rerender(<AdvertisingSlot client={noFill} clientKind="WEB" online pathname="/news" />);
        await act(async () => Promise.resolve());
        expect(screen.queryByLabelText('Рекламное объявление')).not.toBeInTheDocument();
    });

    it('removes a loaded creative when a critical form gains focus without removing the form', async () => {
        const api = client();
        const { container } = render(
            <>
                <form aria-label="Подтверждение результата">
                    <label>
                        Счёт
                        <input name="score" />
                    </label>
                    <button type="submit">Подтвердить</button>
                </form>
                <AdvertisingSlot client={api} clientKind="WEB" online pathname="/matches/match-id" />
            </>
        );
        await act(async () => Promise.resolve());
        expect(screen.getByLabelText('Рекламное объявление')).toBeInTheDocument();

        act(() => {
            screen.getByRole('textbox', { name: 'Счёт' }).focus();
        });

        expect(screen.queryByLabelText('Рекламное объявление')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeEnabled();
        expect(container.querySelector('form')).toContainElement(document.activeElement as HTMLElement);
    });

    it('renders creative copy as text and collapses a broken static asset', async () => {
        const hostile = {
            ...creative,
            creative: {
                ...creative.creative,
                altText: '<img src=x onerror=alert(1)>',
                body: '<script>window.__ad_xss = true</script>',
                headline: '<iframe src="https://tracker.example.test">',
            },
        };
        render(<AdvertisingSlot client={client(hostile)} clientKind="WEB" online pathname="/news" />);
        await act(async () => Promise.resolve());

        expect(screen.getByText(hostile.creative.body)).toBeVisible();
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('iframe')).toBeNull();
        const image = screen.getByRole('img', { name: hostile.creative.altText });
        image.dispatchEvent(new Event('error'));
        await act(async () => Promise.resolve());
        expect(screen.queryByLabelText('Рекламное объявление')).not.toBeInTheDocument();
    });
});
