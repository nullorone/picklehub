import type { components } from '@picklehub/api-client';

import type { SecureSessionStore } from '../security/secure-session';

type Schemas = components['schemas'];
type Destination = Schemas['MobileDeepLinkTarget'];
type NativeSession = Schemas['NativeAuthenticatedSession'];

export class MobileApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly retryAfterSeconds?: number
    ) {
        super(message);
        this.name = 'MobileApiError';
    }
}

interface MobileApiClientOptions {
    readonly baseUrl: string;
    readonly fetch?: typeof globalThis.fetch;
    readonly locale?: string;
    readonly secureStore: SecureSessionStore;
}

interface CallOptions {
    readonly authenticated?: boolean;
    readonly body?: object;
    readonly idempotencyKey?: string;
    readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    readonly retryAuthentication?: boolean;
}

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/$/u, '')}${path}`;
}

export function createMobileApiClient(options: MobileApiClientOptions) {
    const request = options.fetch ?? globalThis.fetch;
    let accessToken: string | undefined;
    let userId: string | undefined;
    let refreshInFlight: Promise<NativeSession> | undefined;

    async function parse<T>(response: Response): Promise<T> {
        const value: unknown = await response.json().catch(() => undefined);
        if (!response.ok) {
            const envelope = value as Partial<Schemas['ErrorEnvelope']> | undefined;
            const retryAfter = Number(response.headers.get('Retry-After'));
            throw new MobileApiError(
                response.status,
                envelope?.error?.code ?? 'NETWORK_REQUEST_FAILED',
                envelope?.error?.message ?? 'Не удалось выполнить запрос.',
                Number.isFinite(retryAfter) ? retryAfter : undefined
            );
        }
        return value as T;
    }

    async function call<T>(path: string, settings: CallOptions = {}): Promise<T> {
        const headers: Record<string, string> = {
            Accept: 'application/json',
            'Accept-Language': options.locale ?? 'ru-RU',
        };
        if (settings.body !== undefined) headers['Content-Type'] = 'application/json';
        if (settings.authenticated && accessToken) headers.Authorization = `Bearer ${accessToken}`;
        if (settings.idempotencyKey !== undefined) headers['Idempotency-Key'] = settings.idempotencyKey;
        const init: RequestInit = {
            headers,
            method: settings.method ?? (settings.body === undefined ? 'GET' : 'POST'),
        };
        if (settings.body !== undefined) init.body = JSON.stringify(settings.body);
        const response = await request(joinUrl(options.baseUrl, path), init);
        if (response.status === 401 && settings.authenticated && settings.retryAuthentication !== false) {
            await refresh();
            return call<T>(path, { ...settings, retryAuthentication: false });
        }
        return parse<T>(response);
    }

    async function remember(session: NativeSession): Promise<NativeSession> {
        // Persist the rotated credential before exposing the new access token to callers.
        await options.secureStore.replaceRefreshToken(session.refreshToken);
        accessToken = session.accessToken;
        userId = session.user.id;
        return session;
    }

    async function refresh(): Promise<NativeSession> {
        refreshInFlight ??= (async () => {
            const refreshToken = await options.secureStore.getRefreshToken();
            if (refreshToken === null) throw new MobileApiError(401, 'SESSION_REQUIRED', 'Войдите снова.');
            try {
                return await remember(
                    await call<NativeSession>('/auth/mobile/refresh', {
                        body: { refreshToken },
                        method: 'POST',
                        retryAuthentication: false,
                    })
                );
            } catch (error) {
                accessToken = undefined;
                userId = undefined;
                await options.secureStore.clear();
                throw error;
            }
        })().finally(() => {
            refreshInFlight = undefined;
        });
        return refreshInFlight;
    }

    return {
        authenticatedCall: <T>(path: string, settings: Omit<CallOptions, 'authenticated'> = {}) =>
            call<T>(path, { ...settings, authenticated: true }),
        bootstrap: refresh,
        consumeMagicLink: async (token: string, codeVerifier: string) =>
            remember(
                await call<NativeSession>('/auth/mobile/magic-links/consume', {
                    body: { codeVerifier, platform: 'MOBILE', token },
                    method: 'POST',
                    retryAuthentication: false,
                })
            ),
        createRealtimeTicket: (idempotencyKey: string) =>
            call<Schemas['RealtimeTicket']>('/realtime/tickets', {
                authenticated: true,
                body: {},
                idempotencyKey,
                method: 'POST',
            }),
        getRealtimeUrl: () => {
            const url = new URL(joinUrl(options.baseUrl, '/ws'));
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            return url.toString();
        },
        getAccessToken: () => accessToken,
        getUserId: () => userId,
        createMiniGameWebViewLaunch: (idempotencyKey: string) =>
            call<Schemas['GameWebViewLaunch']>('/mini-game/webview-launches', {
                authenticated: true,
                body: {},
                idempotencyKey,
                method: 'POST',
            }),
        logout: async () => {
            const refreshToken = await options.secureStore.getRefreshToken();
            accessToken = undefined;
            userId = undefined;
            await options.secureStore.clear();
            if (refreshToken !== null) {
                await call('/auth/mobile/logout', {
                    body: { refreshToken },
                    method: 'POST',
                    retryAuthentication: false,
                }).catch(() => undefined);
            }
        },
        publicCall: <T>(path: string) => call<T>(path),
        requestMagicLink: (email: string, codeChallenge: string, destination?: Destination) =>
            call('/auth/mobile/magic-links/request', {
                body: { codeChallenge, destination, email, platform: 'MOBILE' },
                method: 'POST',
                retryAuthentication: false,
            }),
    } as const;
}

export type MobileApiClient = ReturnType<typeof createMobileApiClient>;
