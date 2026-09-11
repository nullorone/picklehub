// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createIdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClubDetailsScreen, ClubsScreen } from './clubs-ui';

const clubId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    return input instanceof URL ? input.href : input.url;
}

const club = {
    createdAt: '2026-09-12T10:00:00.000Z',
    description: 'Дружелюбное сообщество',
    id: clubId,
    locality: 'Москва',
    memberCount: 1,
    membershipPolicy: 'APPROVAL',
    name: 'Пикл на районе',
    state: 'ACTIVE',
    updatedAt: '2026-09-12T10:00:00.000Z',
    venues: [],
    version: 3,
} as const;

describe('club interface', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    it('discovers a club with no venues and keeps that state visible', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                response({
                    items: [
                        {
                            id: clubId,
                            locality: 'Москва',
                            memberCount: 1,
                            membershipPolicy: 'OPEN',
                            name: club.name,
                            state: 'ACTIVE',
                            venueIds: [],
                        },
                    ],
                    pageInfo: { hasMore: false, nextCursor: null },
                    snapshotAt: '2026-09-12T10:00:00.000Z',
                })
            )
        );
        render(
            <MemoryRouter>
                <ClubsScreen channel="web" client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')} online signedIn />
            </MemoryRouter>
        );
        expect(await screen.findByRole('link', { name: /Пикл на районе/u })).toHaveTextContent(
            'Без привязанных площадок'
        );
    });

    it('renders public details and an accessible empty venue state', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = requestUrl(input);
                return response(url.endsWith('/venues') ? { items: [] } : club);
            })
        );
        render(
            <MemoryRouter initialEntries={[`/clubs/${clubId}`]}>
                <Routes>
                    <Route
                        path="/clubs/:clubId"
                        element={
                            <ClubDetailsScreen
                                client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')}
                                online
                                signedIn={false}
                                userId={undefined}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(await screen.findByRole('heading', { name: club.name })).toBeInTheDocument();
        expect(screen.getByText(/У клуба пока нет привязанных площадок/u)).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Управление клубом' })).not.toBeInTheDocument();
    });

    it('sends a protected join command and surfaces backend denial', async () => {
        const fetch = vi.fn((input: RequestInfo | URL) => {
            const url = requestUrl(input);
            if (url.endsWith('/venues')) return response({ items: [] });
            if (url.endsWith('/members'))
                return response(
                    { requestId: crypto.randomUUID(), error: { code: 'FORBIDDEN', message: 'Нет доступа' } },
                    403
                );
            if (url.endsWith('/auth/context')) return response({ csrfToken: 'c'.repeat(43) });
            if (url.endsWith('/join'))
                return response(
                    { requestId: crypto.randomUUID(), error: { code: 'FORBIDDEN', message: 'Нет доступа' } },
                    403
                );
            return response(club);
        });
        vi.stubGlobal('fetch', fetch);
        render(
            <MemoryRouter initialEntries={[`/clubs/${clubId}`]}>
                <Routes>
                    <Route
                        path="/clubs/:clubId"
                        element={
                            <ClubDetailsScreen
                                client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')}
                                online
                                signedIn
                                userId={userId}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Подать заявку' }));
        expect(await screen.findByText('У вас нет разрешения на это действие.')).toBeInTheDocument();
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(`/v1/clubs/${clubId}/join`, expect.objectContaining({ method: 'POST' }));
        });
    });

    it('disables mutations and labels cached data while offline', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = requestUrl(input);
                if (url.endsWith('/venues') || url.endsWith('/members')) return response({ items: [] });
                return response(club);
            })
        );
        render(
            <MemoryRouter initialEntries={[`/clubs/${clubId}`]}>
                <Routes>
                    <Route
                        path="/clubs/:clubId"
                        element={
                            <ClubDetailsScreen
                                client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')}
                                online={false}
                                signedIn
                                userId={userId}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(await screen.findByText(/Показаны последние загруженные данные/u)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Подать заявку' })).toBeDisabled();
    });
});
