// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createAppI18n } from '@picklehub/i18n';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });
}

describe('Telegram identity', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    it('automatically exchanges init data through the backend', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(response({ csrfToken: 'c'.repeat(43) }))
            .mockResolvedValueOnce(
                response(
                    { requestId: crypto.randomUUID(), error: { code: 'SESSION_INVALID', message: 'invalid' } },
                    401
                )
            )
            .mockResolvedValueOnce(
                response(
                    { requestId: crypto.randomUUID(), error: { code: 'TELEGRAM_AUTH_INVALID', message: 'invalid' } },
                    401
                )
            );
        vi.stubGlobal('fetch', fetch);
        const i18n = await createAppI18n();
        render(
            <I18nextProvider i18n={i18n}>
                <MemoryRouter initialEntries={['/login']}>
                    <App config={{ apiBaseUrl: '/v1', environment: 'test' }} initData="signed-init-data" />
                </MemoryRouter>
            </I18nextProvider>
        );
        expect(screen.getByRole('heading', { name: 'Проверяем вход…' })).toBeInTheDocument();
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledTimes(3);
        });
        expect(fetch.mock.calls[2]?.[0]).toBe('/v1/auth/telegram');
        const request = fetch.mock.calls[2]?.[1] as RequestInit | undefined;
        expect(request?.body).toBe(JSON.stringify({ initData: 'signed-init-data', platform: 'TMA' }));
        expect(await screen.findByRole('heading', { name: 'Не удалось войти' })).toBeInTheDocument();
    });

    it('does not attempt authentication while offline', async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const i18n = await createAppI18n();
        render(
            <I18nextProvider i18n={i18n}>
                <MemoryRouter initialEntries={['/login']}>
                    <App config={{ apiBaseUrl: '/v1', environment: 'test' }} initData="signed-init-data" />
                </MemoryRouter>
            </I18nextProvider>
        );
        expect(screen.getByRole('status')).toHaveTextContent('Нет подключения к интернету');
        expect(fetch).not.toHaveBeenCalled();
    });
});
