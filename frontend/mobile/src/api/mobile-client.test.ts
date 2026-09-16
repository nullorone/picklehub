import { describe, expect, it, vi } from 'vitest';

import type { SecureSessionStore } from '../security/secure-session';
import { createMobileApiClient } from './mobile-client';

const session = {
    accessExpiresAt: '2026-09-16T10:05:00Z',
    accessToken: 'access-secret',
    destination: null,
    refreshExpiresAt: '2026-09-23T10:00:00Z',
    refreshToken: 'rotated-refresh-secret',
    session: {
        absoluteExpiresAt: '2026-10-01T10:00:00Z',
        createdAt: '2026-09-16T10:00:00Z',
        id: 'session-id',
        idleExpiresAt: '2026-09-23T10:00:00Z',
        status: 'ACTIVE',
    },
    tokenType: 'Bearer',
    user: {
        completedAt: '2026-09-16T10:00:00Z',
        createdAt: '2026-09-16T10:00:00Z',
        id: 'user-id',
        onboardingStatus: 'COMPLETED',
        requiredConsentsSatisfied: true,
        status: 'ACTIVE',
    },
} as const;

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });
}

function store(): SecureSessionStore {
    return {
        clear: vi.fn(() => Promise.resolve()),
        getCacheKey: vi.fn(() => Promise.resolve(null)),
        getRefreshToken: vi.fn(() => Promise.resolve('old-refresh-secret')),
        getVerifier: vi.fn(() => Promise.resolve(null)),
        replaceRefreshToken: vi.fn(() => Promise.resolve()),
        setCacheKey: vi.fn(() => Promise.resolve()),
        setVerifier: vi.fn(() => Promise.resolve()),
    };
}

describe('native API transport', () => {
    it('rotates a body refresh without browser cookie, Origin or CSRF headers', async () => {
        const secureStore = store();
        const calls: (readonly [RequestInfo | URL, RequestInit | undefined])[] = [];
        const fetch: typeof globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            calls.push([input, init]);
            return Promise.resolve(response(session));
        });
        const client = createMobileApiClient({ baseUrl: 'https://api.picklehub.ru/v1', fetch, secureStore });
        await client.bootstrap();
        const [url, init] = calls[0] ?? ['', undefined];
        expect(url).toBe('https://api.picklehub.ru/v1/auth/mobile/refresh');
        expect(init?.headers).not.toHaveProperty('Cookie');
        expect(init?.headers).not.toHaveProperty('Origin');
        expect(init?.headers).not.toHaveProperty('X-CSRF-Token');
        expect(init?.body).toBe(JSON.stringify({ refreshToken: 'old-refresh-secret' }));
    });

    it('keeps an access token in memory and sends it only as bearer auth', async () => {
        const calls: (readonly [RequestInfo | URL, RequestInit | undefined])[] = [];
        let nextBody: unknown = session;
        const fetch: typeof globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            calls.push([input, init]);
            return Promise.resolve(response(nextBody));
        });
        const client = createMobileApiClient({ baseUrl: 'https://api.picklehub.ru/v1', fetch, secureStore: store() });
        await client.bootstrap();
        nextBody = { identities: [], session: session.session, user: session.user };
        await client.authenticatedCall('/me');
        expect(calls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer access-secret' });
    });

    it('coalesces concurrent refreshes and persists rotation before exposing access', async () => {
        const secureStore = store();
        let release: ((value: Response) => void) | undefined;
        const fetch: typeof globalThis.fetch = vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    release = resolve;
                })
        );
        const client = createMobileApiClient({ baseUrl: 'https://api.picklehub.ru/v1', fetch, secureStore });
        const first = client.bootstrap();
        const second = client.bootstrap();
        await vi.waitFor(() => {
            expect(fetch).toHaveBeenCalledOnce();
        });
        release?.(response(session));
        await Promise.all([first, second]);
        expect(Reflect.get(secureStore, 'replaceRefreshToken')).toHaveBeenCalledOnce();
        expect(client.getAccessToken()).toBe('access-secret');
    });

    it('clears the local session when refresh rotation fails', async () => {
        const secureStore = store();
        const fetch: typeof globalThis.fetch = vi.fn(() =>
            Promise.resolve(response({ error: { code: 'SESSION_REVOKED', message: 'Revoked.' } }, 401))
        );
        const client = createMobileApiClient({ baseUrl: 'https://api.picklehub.ru/v1', fetch, secureStore });
        await expect(client.bootstrap()).rejects.toMatchObject({ code: 'SESSION_REVOKED', status: 401 });
        expect(Reflect.get(secureStore, 'clear')).toHaveBeenCalledOnce();
        expect(client.getAccessToken()).toBeUndefined();
    });

    it('makes local logout final even when server revocation is unavailable', async () => {
        const secureStore = store();
        const fetch: typeof globalThis.fetch = vi
            .fn()
            .mockResolvedValueOnce(response(session))
            .mockRejectedValueOnce(new Error('offline'));
        const client = createMobileApiClient({ baseUrl: 'https://api.picklehub.ru/v1', fetch, secureStore });
        await client.bootstrap();
        await expect(client.logout()).resolves.toBeUndefined();
        expect(Reflect.get(secureStore, 'clear')).toHaveBeenCalled();
        expect(client.getAccessToken()).toBeUndefined();
        expect(client.getUserId()).toBeUndefined();
    });
});
