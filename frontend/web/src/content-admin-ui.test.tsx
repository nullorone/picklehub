// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { type components } from '@picklehub/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { createAdminClient } from './admin-client';
import { ContentDashboard } from './content-admin-ui';

const session: components['schemas']['AdminSessionContext'] = {
    absoluteExpiresAt: '2026-09-15T18:00:00.000Z',
    activeRole: 'EDITOR',
    capabilities: [
        'CONTENT_SOURCE_READ',
        'CONTENT_SOURCE_PROPOSE',
        'CONTENT_SOURCE_PAUSE',
        'CONTENT_CANDIDATE_REVIEW',
        'CONTENT_EDIT',
        'CONTENT_PREVIEW',
        'CONTENT_PUBLISH',
    ],
    idleExpiresAt: '2026-09-15T14:00:00.000Z',
    mfaVerifiedAt: '2026-09-15T12:00:00.000Z',
    reauthenticatedAt: null,
    sessionId: '11111111-1111-4111-8111-111111111111',
};

function response(body: unknown): Response {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('content backoffice', () => {
    it('keeps source, candidate and revision queues inside an authenticated editor session', async () => {
        const fetch = vi.fn((input: RequestInfo | URL, _options?: RequestInit) => {
            void _options;
            const path = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (path.endsWith('/admin/session')) return Promise.resolve(response(session));
            if (path.includes('/admin/content/sources')) {
                return Promise.resolve(response({ items: [], pageInfo: { hasMore: false, nextCursor: null } }));
            }
            if (path.includes('/admin/content/candidates')) {
                return Promise.resolve(response({ items: [], pageInfo: { hasMore: false, nextCursor: null } }));
            }
            return Promise.resolve(response({ items: [], pageInfo: { hasMore: false, nextCursor: null } }));
        });
        vi.stubGlobal('fetch', fetch);
        const client = createAdminClient({ baseUrl: '/v1' });
        await client.authenticate('staff-session');
        render(
            <MemoryRouter>
                <ContentDashboard client={client} online={false} session={session} />
            </MemoryRouter>
        );
        expect(await screen.findByRole('heading', { name: 'Источники' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Кандидаты' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Статьи' })).toBeInTheDocument();
        expect(screen.getByText(/не предложены/u)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Новый оригинальный материал' })).toBeDisabled();
        expect(fetch).toHaveBeenCalledTimes(4);
        for (const call of fetch.mock.calls.slice(1)) {
            expect(call[1]).toMatchObject({ cache: 'no-store', credentials: 'include' });
        }
    });
});
