import { describe, expect, it, vi } from 'vitest';

import { createApiClient, createIdentityClient } from './index';

describe('createApiClient', () => {
    it('uses the generated health route and Russian locale', async () => {
        const body = { checkedAt: '2026-09-04T00:00:00.000Z', requestId: crypto.randomUUID(), status: 'ok' };
        const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(body));
        const client = createApiClient({ baseUrl: '/v1/', fetch });

        await expect(client.getLiveness()).resolves.toEqual(body);
        expect(fetch).toHaveBeenCalledWith('/v1/health/live', {
            headers: { Accept: 'application/json', 'Accept-Language': 'ru-RU' },
        });
    });
});

describe('createIdentityClient', () => {
    it('keeps access credentials in memory and sends cookies through fetch', async () => {
        const session = {
            accessExpiresAt: '2026-09-09T12:05:00.000Z',
            accessToken: 'a'.repeat(43),
            csrfToken: 'c'.repeat(43),
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
        } as const;
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(Response.json({ csrfToken: 'b'.repeat(43) }))
            .mockResolvedValueOnce(Response.json(session))
            .mockResolvedValueOnce(Response.json({ identities: [], session: session.session, user: session.user }));
        const client = createIdentityClient({ baseUrl: '/v1', fetch }, 'WEB');

        await client.consumeMagicLink('t'.repeat(43));
        await client.getMe();

        expect(fetch.mock.calls[1]?.[0]).toBe('/v1/auth/magic-links/consume');
        expect(fetch.mock.calls[1]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'include' });
        expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe(
            `Bearer ${session.accessToken}`
        );
        expect(fetch.mock.calls[1]?.[1]?.body).not.toContain(session.accessToken);
    });

    it('uses typed venue queries and protects venue mutations', async () => {
        const session = {
            accessExpiresAt: '2026-09-10T12:05:00.000Z',
            accessToken: 'a'.repeat(43),
            csrfToken: 'c'.repeat(43),
            session: {
                absoluteExpiresAt: '2026-10-10T12:00:00.000Z',
                createdAt: '2026-09-10T12:00:00.000Z',
                id: crypto.randomUUID(),
                idleExpiresAt: '2026-09-17T12:00:00.000Z',
                status: 'ACTIVE',
            },
            tokenType: 'Bearer',
            user: {
                completedAt: '2026-09-10T12:00:00.000Z',
                createdAt: '2026-09-09T12:00:00.000Z',
                id: crypto.randomUUID(),
                onboardingStatus: 'COMPLETED',
                requiredConsentsSatisfied: true,
                status: 'ACTIVE',
            },
        } as const;
        const page = {
            items: [],
            pageInfo: { hasMore: false, nextCursor: null },
            snapshotAt: '2026-09-10T12:00:00.000Z',
        };
        const report = {
            createdAt: '2026-09-10T12:00:00.000Z',
            id: crypto.randomUUID(),
            reason: 'CLOSED',
            resolvedAt: null,
            state: 'PENDING_REVIEW',
            venueId: crypto.randomUUID(),
        } as const;
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(Response.json({ csrfToken: 'b'.repeat(43) }))
            .mockResolvedValueOnce(Response.json(session))
            .mockResolvedValueOnce(Response.json(page))
            .mockResolvedValueOnce(Response.json(report, { status: 201 }));
        const client = createIdentityClient({ baseUrl: '/v1', fetch }, 'WEB');
        await client.consumeMagicLink('t'.repeat(43));
        await client.searchVenues({ environment: 'OUTDOOR', latitude: 55.75, longitude: 37.61, radiusMeters: 5_000 });
        await client.reportVenue(report.venueId, { reason: 'CLOSED' });

        expect(fetch.mock.calls[2]?.[0]).toBe(
            '/v1/venues?environment=OUTDOOR&latitude=55.75&longitude=37.61&radiusMeters=5000'
        );
        const mutationHeaders = new Headers(fetch.mock.calls[3]?.[1]?.headers);
        expect(mutationHeaders.get('Authorization')).toBe(`Bearer ${session.accessToken}`);
        expect(mutationHeaders.get('X-CSRF-Token')).toBe(session.csrfToken);
        expect(mutationHeaders.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/u);
    });
});
