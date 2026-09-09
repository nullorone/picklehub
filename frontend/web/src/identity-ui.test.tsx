// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { IdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnboardingScreen } from './identity-ui';

const localityId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const draft = {
    consents: [],
    draft: {
        completedAt: null,
        displayName: 'Игрок',
        duprProfileUrl: null,
        gameFormats: ['SINGLES'] as const,
        localityId,
        skillSelfAssessment: 2.5 as const,
        status: 'DRAFT' as const,
        timeZone: 'Europe/Moscow',
        updatedAt: '2026-09-09T12:00:00.000Z',
        userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        version: 1,
    },
    requiredConsentsSatisfied: false,
};

describe('OnboardingScreen', () => {
    afterEach(cleanup);

    it('reports activation only after the server returns COMPLETED', async () => {
        const completed = {
            ...draft,
            draft: {
                ...draft.draft,
                completedAt: '2026-09-09T12:02:00.000Z',
                status: 'COMPLETED' as const,
                version: 2,
            },
        };
        const client = {
            changeConsent: vi.fn().mockResolvedValue({}),
            completeOnboarding: vi.fn().mockResolvedValue(completed),
            getDocuments: vi.fn().mockResolvedValue({
                items: [
                    {
                        checksum: 'a'.repeat(64),
                        effectiveAt: '2026-09-01T00:00:00.000Z',
                        purpose: 'TERMS',
                        required: true,
                        text: 'Условия',
                        title: 'Условия использования',
                        version: 'v1',
                    },
                    {
                        checksum: 'b'.repeat(64),
                        effectiveAt: '2026-09-01T00:00:00.000Z',
                        purpose: 'PERSONAL_DATA',
                        required: true,
                        text: 'Согласие',
                        title: 'Персональные данные',
                        version: 'v1',
                    },
                ],
            }),
            getOnboarding: vi.fn().mockResolvedValue(draft),
            getOnboardingOptions: vi.fn().mockResolvedValue({
                catalogueVersion: 1,
                duprAllowedPatterns: [],
                duprLinksEnabled: false,
                supportedTimeZones: ['Europe/Moscow'],
            }),
            listLocalities: vi.fn().mockResolvedValue({
                items: [{ countryCode: 'RU', id: localityId, name: 'Москва', region: 'Москва' }],
                pageInfo: { hasMore: false, nextCursor: null },
            }),
            updateOnboarding: vi.fn().mockResolvedValue({ ...draft, draft: { ...draft.draft, version: 2 } }),
        } as unknown as IdentityClient;
        const onCompleted = vi.fn();
        render(<OnboardingScreen client={client} online onCompleted={onCompleted} />);

        const checks = await screen.findAllByRole('checkbox', { name: 'Принимаю обязательный документ' });
        for (const check of checks) fireEvent.click(check);
        expect(onCompleted).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Завершить настройку' }));

        await waitFor(() => {
            expect(onCompleted).toHaveBeenCalledTimes(1);
        });
        expect(client.completeOnboarding).toHaveBeenCalledWith(2, 'v1', 'v1');
    });
});
