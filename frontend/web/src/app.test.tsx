// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createAppI18n } from '@picklehub/i18n';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });
}

describe('web identity', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        history.replaceState(null, '', '/');
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    async function renderApp(path = '/') {
        const i18n = await createAppI18n();
        return render(
            <I18nextProvider i18n={i18n}>
                <MemoryRouter initialEntries={[path]}>
                    <App config={{ apiBaseUrl: '/v1', environment: 'test' }} />
                </MemoryRouter>
            </I18nextProvider>
        );
    }

    it('shows a neutral passwordless email entry point', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(response({ csrfToken: 'c'.repeat(43) }))
                .mockResolvedValue(
                    response(
                        {
                            requestId: crypto.randomUUID(),
                            error: { code: 'SESSION_INVALID', message: 'Войдите снова' },
                        },
                        401
                    )
                )
        );
        await renderApp('/login');
        expect(await screen.findByRole('heading', { name: 'Найдите свою игру' })).toBeInTheDocument();
        expect(screen.getByText(/не раскрывает наличие аккаунта/)).toBeInTheDocument();
    });

    it('does not consume a deep-link token until explicit confirmation and clears the fragment', async () => {
        const token = 'a'.repeat(43);
        history.replaceState(null, '', `/auth/email#token=${token}&next=https://evil.example`);
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(response({ csrfToken: 'c'.repeat(43) }))
            .mockResolvedValueOnce(
                response({
                    accessExpiresAt: '2026-09-09T12:05:00.000Z',
                    accessToken: 'b'.repeat(43),
                    csrfToken: 'd'.repeat(43),
                    session: {
                        absoluteExpiresAt: '2026-10-09T12:00:00.000Z',
                        createdAt: '2026-09-09T12:00:00.000Z',
                        id: crypto.randomUUID(),
                        idleExpiresAt: '2026-09-16T12:00:00.000Z',
                        status: 'ACTIVE',
                    },
                    tokenType: 'Bearer',
                    user: {
                        completedAt: null,
                        createdAt: '2026-09-09T12:00:00.000Z',
                        id: crypto.randomUUID(),
                        onboardingStatus: 'DRAFT',
                        requiredConsentsSatisfied: false,
                        status: 'ACTIVE',
                    },
                })
            );
        vi.stubGlobal('fetch', fetch);
        await renderApp('/auth/email');
        expect(location.hash).toBe('');
        expect(fetch).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Войти в PickleHub' }));
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledTimes(2);
        });
        expect(fetch.mock.calls[1]?.[0]).toBe('/v1/auth/magic-links/consume');
    });

    it('announces offline mode and disables sign-in mutation', async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        vi.stubGlobal('fetch', vi.fn());
        await renderApp('/login');
        expect(screen.getByRole('status')).toHaveTextContent('Нет подключения к интернету');
        expect(screen.getByRole('button', { name: 'Получить ссылку' })).toBeDisabled();
    });
});
