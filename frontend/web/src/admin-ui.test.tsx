// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { components } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApp } from './admin-ui';

const caseId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const venueId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const narrative = 'RESTRICTED-NARRATIVE-CANARY';

type Role = components['schemas']['PlatformRole'];
type Capability = components['schemas']['AdminCapability'];

function json(body: unknown, status = 200): Response {
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' }, status });
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    return input instanceof URL ? input.href : input.url;
}

function requestBody(body: BodyInit | null | undefined): string {
    return typeof body === 'string' ? body : '';
}

function session(activeRole: Role, capabilities: readonly Capability[]) {
    return {
        absoluteExpiresAt: '2026-09-11T18:00:00.000Z',
        activeRole,
        capabilities,
        idleExpiresAt: '2026-09-11T12:15:00.000Z',
        mfaVerifiedAt: '2026-09-11T11:50:00.000Z',
        reauthenticatedAt: '2026-09-11T11:59:00.000Z',
        sessionId,
    } as const;
}

function caseDetail(revision = 3) {
    return {
        policyVersion: 'safety-v1',
        restrictedAppeal: null,
        restrictedNarrative: narrative,
        restrictedResponses: [],
        sourceCount: 1,
        summary: {
            actionableAt: '2026-09-11T10:00:00.000Z',
            assignmentState: 'ASSIGNED_TO_ME',
            caseId,
            kind: 'SAFETY',
            priority: 'HIGH',
            revision,
            state: 'INVESTIGATING',
        },
    } as const;
}

function renderAdmin(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <AdminApp config={{ apiBaseUrl: '/v1', environment: 'test' }} online />
        </MemoryRouter>
    );
}

function enterCredential() {
    fireEvent.change(screen.getByLabelText('Код административной сессии'), { target: { value: 'a'.repeat(32) } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить доступ' }));
}

describe('web administration', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        window.history.replaceState(null, '', '/');
    });

    it('reauthenticates a deep link, keeps the credential out of URLs and uses no-store', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((input) => {
            const url = requestUrl(input);
            if (url === '/v1/admin/session')
                return Promise.resolve(session('MODERATOR', ['ADMIN_SESSION_ACCESS', 'SAFETY_CASE_ROUTE'])).then(json);
            if (url === `/v1/admin/cases/${caseId}`) return Promise.resolve(json(caseDetail()));
            return Promise.resolve(json({}, 404));
        });
        vi.stubGlobal('fetch', fetch);
        renderAdmin(`/admin/cases/${caseId}`);

        expect(screen.getByRole('heading', { name: 'Вход для сотрудников' })).toBeInTheDocument();
        enterCredential();

        expect(await screen.findByText(narrative)).toBeInTheDocument();
        expect(fetch.mock.calls.every(([url]) => !requestUrl(url).includes('a'.repeat(32)))).toBe(true);
        expect(fetch.mock.calls.every(([, init]) => init?.cache === 'no-store')).toBe(true);
        expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(`Bearer ${'a'.repeat(32)}`);
        expect(screen.queryByRole('link', { name: 'Матчи' })).not.toBeInTheDocument();
    });

    it.each([
        ['EDITOR' as const, [] as const],
        ['ADS_MANAGER' as const, [] as const],
    ])('does not expose safety navigation or data to %s', async (role, capabilities) => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(session(role, capabilities)));
        vi.stubGlobal('fetch', fetch);
        renderAdmin('/admin/cases');
        enterCredential();

        expect(
            await screen.findByText(`Текущая роль: ${role === 'EDITOR' ? 'Редактор' : 'Менеджер рекламы'}`)
        ).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Обращения' })).not.toBeInTheDocument();
        expect(screen.queryByText(narrative)).not.toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('shows only capabilities returned for a moderator', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((input) => {
            if (requestUrl(input) === '/v1/admin/session')
                return Promise.resolve(json(session('MODERATOR', ['ADMIN_SESSION_ACCESS', 'SAFETY_CASE_ROUTE'])));
            if (requestUrl(input) === '/v1/admin/cases')
                return Promise.resolve(
                    json({
                        items: [],
                        pageInfo: { hasMore: false, nextCursor: null },
                        snapshotAt: '2026-09-11T12:00:00Z',
                    })
                );
            return Promise.resolve(json({}, 404));
        });
        vi.stubGlobal('fetch', fetch);
        renderAdmin('/admin/cases');
        enterCredential();

        expect(await screen.findByRole('link', { name: 'Обращения' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Пользователи' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Аудит' })).not.toBeInTheDocument();
    });

    it('requires a second confirmation before recording a case decision', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((input, init) => {
            const url = requestUrl(input);
            if (url === '/v1/admin/session')
                return Promise.resolve(
                    json(session('MODERATOR', ['ADMIN_SESSION_ACCESS', 'SAFETY_CASE_ROUTE', 'SAFETY_CASE_DECIDE']))
                );
            if (url === `/v1/admin/cases/${caseId}` && init?.method === 'GET')
                return Promise.resolve(json(caseDetail()));
            if (url === '/v1/auth/context') return Promise.resolve(json({ csrfToken: 'c'.repeat(43) }));
            if (url === `/v1/admin/cases/${caseId}/decision`) return Promise.resolve(json(caseDetail(4).summary));
            return Promise.resolve(json({}, 404));
        });
        vi.stubGlobal('fetch', fetch);
        renderAdmin(`/admin/cases/${caseId}`);
        enterCredential();
        await screen.findByText(narrative);

        fireEvent.click(screen.getByRole('button', { name: 'Подготовить решение' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(fetch.mock.calls.some(([url]) => requestUrl(url).endsWith('/decision'))).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Зафиксировать решение' }));

        await waitFor(() => {
            expect(fetch.mock.calls.some(([url]) => requestUrl(url).endsWith('/decision'))).toBe(true);
        });
        const decision = fetch.mock.calls.find(([url]) => requestUrl(url).endsWith('/decision'));
        expect(new Headers(decision?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/u);
        expect(JSON.parse(requestBody(decision?.[1]?.body))).toMatchObject({
            expectedRevision: 3,
            reasonCode: 'POLICY_VIOLATION',
        });
    });

    it('presents a stale-revision conflict without false success and offers a reload', async () => {
        let detailCalls = 0;
        const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((input, init) => {
            const url = requestUrl(input);
            if (url === '/v1/admin/session')
                return Promise.resolve(
                    json(session('MODERATOR', ['ADMIN_SESSION_ACCESS', 'SAFETY_CASE_ROUTE', 'SAFETY_CASE_DECIDE']))
                );
            if (url === `/v1/admin/cases/${caseId}` && init?.method === 'GET') {
                detailCalls += 1;
                return Promise.resolve(json(caseDetail(detailCalls === 1 ? 3 : 4)));
            }
            if (url === '/v1/auth/context') return Promise.resolve(json({ csrfToken: 'c'.repeat(43) }));
            if (url.endsWith('/decision'))
                return Promise.resolve(
                    json(
                        { error: { code: 'REVISION_CONFLICT', message: 'Conflict' }, requestId: crypto.randomUUID() },
                        409
                    )
                );
            return Promise.resolve(json({}, 404));
        });
        vi.stubGlobal('fetch', fetch);
        renderAdmin(`/admin/cases/${caseId}`);
        enterCredential();
        await screen.findByText(narrative);
        fireEvent.click(screen.getByRole('button', { name: 'Подготовить решение' }));
        fireEvent.click(screen.getByRole('button', { name: 'Зафиксировать решение' }));

        expect(await screen.findByText(/уже изменена другим сотрудником/)).toBeInTheDocument();
        expect(screen.queryByText(/Изменение сохранено/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Загрузить свежую версию' }));
        expect(await screen.findByText('Версия 4')).toBeInTheDocument();
    });

    it('clears restricted case content and returns to reauthentication on sign out', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((input) => {
            if (requestUrl(input) === '/v1/admin/session')
                return Promise.resolve(json(session('MODERATOR', ['ADMIN_SESSION_ACCESS', 'SAFETY_CASE_ROUTE'])));
            if (requestUrl(input) === `/v1/admin/cases/${caseId}`) return Promise.resolve(json(caseDetail()));
            return Promise.resolve(json({}, 404));
        });
        vi.stubGlobal('fetch', fetch);
        renderAdmin(`/admin/cases/${caseId}`);
        enterCredential();
        expect(await screen.findByText(narrative)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Завершить сессию' }));
        expect(screen.getByRole('heading', { name: 'Вход для сотрудников' })).toBeInTheDocument();
        expect(screen.queryByText(narrative)).not.toBeInTheDocument();
        expect(window.location.pathname).toBe('/admin/access');
    });

    it('compares venue identifiers and confirms merge before sending it', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((input) => {
            const url = requestUrl(input);
            if (url === '/v1/admin/session')
                return Promise.resolve(json(session('SUPERADMIN', ['ADMIN_SESSION_ACCESS', 'VENUE_MODERATE'])));
            if (url === `/v1/admin/venue-candidates/${itemId}`)
                return Promise.resolve(
                    json({
                        item: {
                            ageBucket: 'H1_24',
                            createdAt: '2026-09-11T10:00:00Z',
                            itemId,
                            kind: 'CANDIDATE',
                            locality: 'Москва',
                            revision: 2,
                            sourceClass: 'PLAYER',
                            state: 'PENDING_REVIEW',
                        },
                        latitude: 55.75,
                        longitude: 37.61,
                        name: 'Корт у парка',
                        nearbyPublishedVenueIds: [venueId],
                        normalizedAddress: 'Москва, Парк',
                        provenance: ['PLAYER'],
                    })
                );
            return Promise.resolve(json({ csrfToken: 'c'.repeat(43) }));
        });
        vi.stubGlobal('fetch', fetch);
        renderAdmin(`/admin/venues/${itemId}`);
        enterCredential();

        expect(await screen.findByRole('group', { name: 'Сравнение площадок' })).toHaveTextContent(venueId);
        fireEvent.change(screen.getByLabelText('Одноразовый код подтверждения'), { target: { value: 'proof' } });
        fireEvent.click(screen.getByRole('button', { name: 'Подготовить слияние' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(fetch.mock.calls.some(([url]) => requestUrl(url).endsWith('/merge'))).toBe(false);
    });
});
