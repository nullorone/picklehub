import type {
    SchemaAuthenticatedSession,
    SchemaConsent,
    SchemaConsentChange,
    SchemaConsentDocuments,
    SchemaErrorEnvelope,
    SchemaFinishIdentityAttempt,
    SchemaHealthResponse,
    SchemaIdentityAttempt,
    SchemaIdentityList,
    SchemaLocalityPage,
    SchemaMe,
    SchemaOnboarding,
    SchemaOnboardingOptions,
    SchemaStartIdentityAttempt,
    SchemaUpdateDraft,
    SchemaCreateVenueCandidate,
    SchemaCreateVenueReport,
    SchemaGeocodingSuggestions,
    SchemaProposeVenueRevision,
    SchemaVenue,
    SchemaVenueCandidate,
    SchemaVenuePage,
    SchemaVenueReport,
    SchemaVenueRevision,
} from './generated/openapi';
import type { operations } from './generated/openapi';

export type { components, operations, paths } from './generated/openapi';

export type ClientPlatform = 'WEB' | 'TMA';

export interface ApiClientOptions {
    readonly baseUrl: string;
    readonly fetch?: typeof globalThis.fetch;
    readonly locale?: string;
}

export class ApiError extends Error {
    readonly status: number;
    readonly response: SchemaErrorEnvelope | undefined;
    readonly retryAfterSeconds: number | undefined;

    constructor(status: number, response?: SchemaErrorEnvelope, retryAfterSeconds?: number) {
        super(response?.error.message ?? `API request failed with status ${String(status)}`);
        this.name = 'ApiError';
        this.status = status;
        this.response = response;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/$/u, '')}${path}`;
}

function isErrorEnvelope(value: unknown): value is SchemaErrorEnvelope {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.requestId === 'string' && typeof candidate.error === 'object' && candidate.error !== null;
}

export function createApiClient(options: ApiClientOptions) {
    const request = options.fetch ?? globalThis.fetch;
    const getHealth = async (path: '/health/live' | '/health/ready'): Promise<SchemaHealthResponse> => {
        const response = await request(joinUrl(options.baseUrl, path), {
            headers: { Accept: 'application/json', 'Accept-Language': options.locale ?? 'ru-RU' },
        });
        const body: unknown = await response.json();
        if (!response.ok) throw new ApiError(response.status, isErrorEnvelope(body) ? body : undefined);
        return body as SchemaHealthResponse;
    };

    return {
        getLiveness: () => getHealth('/health/live'),
        getReadiness: () => getHealth('/health/ready'),
    } as const;
}

type JsonBody = Record<string, unknown>;
interface RequestOptions {
    readonly auth?: boolean;
    readonly idempotent?: boolean;
    readonly method?: 'GET' | 'POST' | 'PATCH';
    readonly mutation?: boolean;
    readonly query?: URLSearchParams;
    readonly retrySession?: boolean;
}

export function createIdentityClient(options: ApiClientOptions, platform: ClientPlatform) {
    const request = options.fetch ?? globalThis.fetch;
    let accessToken: string | undefined;
    let csrfToken: string | undefined;
    let refreshPromise: Promise<SchemaAuthenticatedSession> | undefined;

    async function parse<T>(response: Response): Promise<T> {
        const body: unknown = await response.json().catch(() => undefined);
        if (!response.ok) {
            const retryAfterHeader = response.headers.get('Retry-After');
            const retryAfter = retryAfterHeader === null ? undefined : Number(retryAfterHeader);
            throw new ApiError(
                response.status,
                isErrorEnvelope(body) ? body : undefined,
                Number.isFinite(retryAfter) ? retryAfter : undefined
            );
        }
        return body as T;
    }

    async function call<T>(path: string, body?: JsonBody, settings: RequestOptions = {}): Promise<T> {
        const method = settings.method ?? (body === undefined ? 'GET' : 'POST');
        const query = settings.query?.toString();
        const target = `${joinUrl(options.baseUrl, path)}${query ? `?${query}` : ''}`;
        const requestHeaders: Record<string, string> = {
            Accept: 'application/json',
            'Accept-Language': options.locale ?? 'ru-RU',
        };
        if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
        if (settings.auth && accessToken) requestHeaders.Authorization = `Bearer ${accessToken}`;
        if (settings.mutation) {
            if (!csrfToken) await context();
            if (!csrfToken) throw new Error('Browser security context is unavailable');
            requestHeaders['X-CSRF-Token'] = csrfToken;
        }
        if (settings.idempotent) requestHeaders['Idempotency-Key'] = crypto.randomUUID();
        const requestInit: RequestInit = {
            cache: 'no-store',
            credentials: 'include',
            headers: requestHeaders,
            method,
        };
        if (body !== undefined) requestInit.body = JSON.stringify(body);
        const response = await request(target, requestInit);
        if (response.status === 401 && settings.auth && settings.retrySession !== false) {
            await refresh();
            return call<T>(path, body, { ...settings, retrySession: false });
        }
        return parse<T>(response);
    }

    function query(parameters: Readonly<Record<string, unknown>>): URLSearchParams {
        const result = new URLSearchParams();
        for (const [key, value] of Object.entries(parameters)) {
            if (typeof value === 'string' && value !== '') result.set(key, value);
            if (typeof value === 'number' || typeof value === 'boolean') result.set(key, String(value));
        }
        return result;
    }

    function remember(session: SchemaAuthenticatedSession): SchemaAuthenticatedSession {
        accessToken = session.accessToken;
        csrfToken = session.csrfToken;
        return session;
    }

    async function context(): Promise<void> {
        const value = await call<{ readonly csrfToken: string }>('/auth/context');
        csrfToken = value.csrfToken;
    }

    async function refresh(): Promise<SchemaAuthenticatedSession> {
        refreshPromise ??= call<SchemaAuthenticatedSession>(
            '/auth/refresh',
            {},
            { mutation: true, retrySession: false }
        )
            .then(remember)
            .catch((error: unknown) => {
                accessToken = undefined;
                throw error;
            })
            .finally(() => {
                refreshPromise = undefined;
            });
        return refreshPromise;
    }

    return {
        bootstrap: async () => {
            await context();
            return refresh();
        },
        changeConsent: (body: Omit<SchemaConsentChange, 'platform'>) =>
            call<SchemaConsent>(
                '/me/consents',
                { ...body, platform },
                { auth: true, idempotent: true, mutation: true }
            ),
        completeOnboarding: (expectedVersion: number, termsVersion: string, personalDataVersion: string) =>
            call<SchemaOnboarding>(
                '/me/onboarding/complete',
                { expectedVersion, personalDataVersion, termsVersion },
                { auth: true, idempotent: true, mutation: true }
            ),
        consumeEmailProof: (attemptId: string, token: string) =>
            call<SchemaIdentityAttempt>(
                `/me/identity-attempts/${attemptId}/email/consume`,
                { token },
                { auth: true, mutation: true, retrySession: false }
            ),
        consumeMagicLink: (token: string) =>
            call<SchemaAuthenticatedSession>(
                '/auth/magic-links/consume',
                { platform, token },
                { mutation: true, retrySession: false }
            ).then(remember),
        exchangeTelegram: (initData: string) =>
            call<SchemaAuthenticatedSession>(
                '/auth/telegram',
                { initData, platform },
                { mutation: true, retrySession: false }
            ).then(remember),
        getDocuments: () => call<SchemaConsentDocuments>('/identity/documents'),
        getIdentities: () => call<SchemaIdentityList>('/me/identities', undefined, { auth: true }),
        getMe: () => call<SchemaMe>('/me', undefined, { auth: true }),
        getOnboarding: () => call<SchemaOnboarding>('/me/onboarding', undefined, { auth: true }),
        getOnboardingOptions: () =>
            call<SchemaOnboardingOptions>('/identity/onboarding-options', undefined, { auth: true }),
        getVenue: (venueId: string) => call<SchemaVenue>(`/venues/${venueId}`),
        getVenueCandidate: (candidateId: string) =>
            call<SchemaVenueCandidate>(`/venue-candidates/${candidateId}`, undefined, { auth: true }),
        listLocalities: (query = '') => {
            const parameters = new URLSearchParams({ limit: '50' });
            if (query.trim()) parameters.set('query', query.trim());
            return call<SchemaLocalityPage>('/identity/onboarding-options/localities', undefined, {
                auth: true,
                query: parameters,
            });
        },
        linkIdentity: (body: SchemaFinishIdentityAttempt) =>
            call<SchemaAuthenticatedSession>('/me/identities/link', body, {
                auth: true,
                mutation: true,
                retrySession: false,
            }).then(remember),
        logout: async () => {
            await call('/auth/logout', {}, { mutation: true, retrySession: false });
            accessToken = undefined;
        },
        logoutAll: async () => {
            await call('/auth/logout-all', {}, { auth: true, mutation: true, retrySession: false });
            accessToken = undefined;
        },
        proveTelegram: (attemptId: string, side: 'CURRENT' | 'TARGET', initData: string) =>
            call<SchemaIdentityAttempt>(
                `/me/identity-attempts/${attemptId}/telegram`,
                { initData, side },
                { auth: true, mutation: true }
            ),
        requestEmailProof: (attemptId: string, side: 'CURRENT' | 'TARGET', email: string) =>
            call(`/me/identity-attempts/${attemptId}/email/request`, { email, side }, { auth: true, mutation: true }),
        requestMagicLink: (email: string) =>
            call('/auth/magic-links/request', { email, platform }, { mutation: true, retrySession: false }),
        searchVenueMap: (parameters: operations['searchVenueMap']['parameters']['query']) =>
            call<SchemaVenuePage>('/venues/map', undefined, { query: query(parameters) }),
        searchVenues: (parameters: NonNullable<operations['searchVenues']['parameters']['query']>) =>
            call<SchemaVenuePage>('/venues', undefined, { query: query(parameters) }),
        suggestVenueAddresses: (searchQuery: string) =>
            call<SchemaGeocodingSuggestions>('/venues/geocoding/suggestions', undefined, {
                auth: true,
                query: query({ limit: 5, query: searchQuery }),
            }),
        startIdentityAttempt: (body: SchemaStartIdentityAttempt) =>
            call<SchemaIdentityAttempt>('/me/identity-attempts', body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        unlinkIdentity: (identityId: string, body: SchemaFinishIdentityAttempt) =>
            call<SchemaAuthenticatedSession>(`/me/identities/${identityId}/unlink`, body, {
                auth: true,
                mutation: true,
                retrySession: false,
            }).then(remember),
        updateOnboarding: (body: SchemaUpdateDraft) =>
            call<SchemaOnboarding>('/me/onboarding', body, {
                auth: true,
                idempotent: true,
                method: 'PATCH',
                mutation: true,
            }),
        createVenueCandidate: (body: SchemaCreateVenueCandidate) =>
            call<SchemaVenueCandidate>('/venues/candidates', body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        proposeVenueRevision: (venueId: string, body: SchemaProposeVenueRevision) =>
            call<SchemaVenueRevision>(`/venues/${venueId}/revisions`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        reportVenue: (venueId: string, body: SchemaCreateVenueReport) =>
            call<SchemaVenueReport>(`/venues/${venueId}/reports`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
    } as const;
}

export type IdentityClient = ReturnType<typeof createIdentityClient>;
