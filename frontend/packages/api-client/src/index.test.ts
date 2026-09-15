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
    it('keeps advertising tokens and coarse context in protected mutation bodies', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(Response.json({ csrfToken: 'c'.repeat(43) }))
            .mockResolvedValueOnce(
                Response.json({ source: 'NO_FILL', reason: 'NO_ELIGIBLE_CAMPAIGN', retryAfterSeconds: null })
            )
            .mockResolvedValueOnce(
                Response.json({
                    accepted: true,
                    duplicate: false,
                    event: 'VIEWABLE_IMPRESSION',
                    invalidReason: null,
                    receiptId: crypto.randomUUID(),
                    recordedAt: '2026-09-15T12:00:00.000Z',
                })
            );
        const client = createIdentityClient({ baseUrl: '/v1', fetch }, 'WEB');
        await client.selectAdvertisingDecision({
            context: {
                clientKind: 'WEB',
                connectivity: 'REGULAR',
                criticalState: false,
                formFactor: 'WIDE',
                locale: 'ru-RU',
                placementCode: 'WEB_SCREEN_BOTTOM',
                providerConsent: false,
                surface: 'NEWS',
            },
        });
        await client.recordViewableAdvertisingImpression({
            continuousForegroundMilliseconds: 1000,
            deliveryToken: 'd'.repeat(43),
            visiblePercent: 50,
        });

        expect(fetch.mock.calls[1]?.[0]).toBe('/v1/advertising/decisions');
        expect(fetch.mock.calls[2]?.[0]).toBe('/v1/advertising/impressions');
        expect(fetch.mock.calls[2]?.[0]).not.toContain('d'.repeat(43));
        expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('X-CSRF-Token')).toBe('c'.repeat(43));
        expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/u);
    });

    it('reuses an explicit client key for a failed chat retry without exposing text in the URL', async () => {
        const session = {
            accessExpiresAt: '2026-09-11T12:05:00.000Z',
            accessToken: 'a'.repeat(43),
            csrfToken: 'c'.repeat(43),
            session: {
                absoluteExpiresAt: '2026-10-11T12:00:00.000Z',
                createdAt: '2026-09-11T12:00:00.000Z',
                id: crypto.randomUUID(),
                idleExpiresAt: '2026-09-18T12:00:00.000Z',
                status: 'ACTIVE',
            },
            tokenType: 'Bearer',
            user: {
                completedAt: '2026-09-11T12:00:00.000Z',
                createdAt: '2026-09-10T12:00:00.000Z',
                id: crypto.randomUUID(),
                onboardingStatus: 'COMPLETED',
                requiredConsentsSatisfied: true,
                status: 'ACTIVE',
            },
        } as const;
        const created = {
            authorId: session.user.id,
            conversationId: crypto.randomUUID(),
            createdAt: '2026-09-11T12:00:00.000Z',
            deletedAt: null,
            editedAt: null,
            id: crypto.randomUUID(),
            kind: 'USER',
            revision: 1,
            sequence: 1,
            systemType: null,
            text: 'Секретный текст чата',
        } as const;
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(Response.json({ csrfToken: 'b'.repeat(43) }))
            .mockResolvedValueOnce(Response.json(session))
            .mockRejectedValueOnce(new TypeError('network'))
            .mockResolvedValueOnce(Response.json(created, { status: 201 }));
        const client = createIdentityClient({ baseUrl: '/v1', fetch }, 'WEB');
        await client.consumeMagicLink('t'.repeat(43));
        const key = crypto.randomUUID();
        const matchId = crypto.randomUUID();

        await expect(client.sendConversationMessage(matchId, { text: created.text }, key)).rejects.toBeInstanceOf(
            TypeError
        );
        await expect(client.sendConversationMessage(matchId, { text: created.text }, key)).resolves.toEqual(created);

        expect(fetch.mock.calls[2]?.[0]).toBe(`/v1/matches/${matchId}/conversation/messages`);
        expect(fetch.mock.calls[2]?.[0]).not.toContain(created.text);
        expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Idempotency-Key')).toBe(key);
        expect(new Headers(fetch.mock.calls[3]?.[1]?.headers).get('Idempotency-Key')).toBe(key);
    });

    it('uses an explicit idempotency key for a retried match command', async () => {
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
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(Response.json({ csrfToken: 'b'.repeat(43) }))
            .mockResolvedValueOnce(Response.json(session))
            .mockResolvedValue(Response.json({ id: crypto.randomUUID(), state: 'DRAFT', version: 0 }));
        const client = createIdentityClient({ baseUrl: '/v1', fetch }, 'WEB');
        await client.bootstrap();
        const key = crypto.randomUUID();
        await client.createMatchDraft({ format: 'SINGLES' }, key);
        await client.createMatchDraft({ format: 'SINGLES' }, key);

        expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Idempotency-Key')).toBe(key);
        expect(new Headers(fetch.mock.calls[3]?.[1]?.headers).get('Idempotency-Key')).toBe(key);
    });

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

    it('keeps safety evidence in the protected request body and preserves an explicit retry key', async () => {
        const session = {
            accessExpiresAt: '2026-09-11T12:05:00.000Z',
            accessToken: 'a'.repeat(43),
            csrfToken: 'c'.repeat(43),
            session: {
                absoluteExpiresAt: '2026-10-11T12:00:00.000Z',
                createdAt: '2026-09-11T12:00:00.000Z',
                id: crypto.randomUUID(),
                idleExpiresAt: '2026-09-18T12:00:00.000Z',
                status: 'ACTIVE',
            },
            tokenType: 'Bearer',
            user: {
                completedAt: '2026-09-11T12:00:00.000Z',
                createdAt: '2026-09-10T12:00:00.000Z',
                id: crypto.randomUUID(),
                onboardingStatus: 'COMPLETED',
                requiredConsentsSatisfied: true,
                status: 'ACTIVE',
            },
        } as const;
        const receipt = {
            appealDeadline: null,
            canAppeal: false,
            canRespond: false,
            canWithdraw: true,
            createdAt: '2026-09-11T12:00:00.000Z',
            kind: 'SAFETY',
            outcome: null,
            outcomeReason: null,
            receiptId: crypto.randomUUID(),
            status: 'RECEIVED',
            updatedAt: '2026-09-11T12:00:00.000Z',
        } as const;
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(Response.json({ csrfToken: 'b'.repeat(43) }))
            .mockResolvedValueOnce(Response.json(session))
            .mockResolvedValue(Response.json(receipt, { status: 201 }));
        const client = createIdentityClient({ baseUrl: '/v1', fetch }, 'WEB');
        await client.bootstrap();
        const key = crypto.randomUUID();
        const sourceId = crypto.randomUUID();
        const evidence = 'restricted evidence';
        await client.submitSafetyReport(
            {
                evidence,
                kind: 'SAFETY',
                reason: 'PHYSICAL_SAFETY',
                sourceId,
                sourceKind: 'MATCH',
                sourceRevision: 2,
                timeBucket: 'TODAY',
            },
            key
        );

        expect(fetch.mock.calls[2]?.[0]).toBe('/v1/safety-reports');
        expect(fetch.mock.calls[2]?.[0]).not.toContain(evidence);
        expect(fetch.mock.calls[2]?.[1]?.body).toBe(
            JSON.stringify({
                evidence,
                kind: 'SAFETY',
                reason: 'PHYSICAL_SAFETY',
                sourceId,
                sourceKind: 'MATCH',
                sourceRevision: 2,
                timeBucket: 'TODAY',
            })
        );
        const headers = new Headers(fetch.mock.calls[2]?.[1]?.headers);
        expect(headers.get('Idempotency-Key')).toBe(key);
        expect(headers.get('X-CSRF-Token')).toBe(session.csrfToken);
    });
});
