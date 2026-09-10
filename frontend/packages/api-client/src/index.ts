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
    SchemaDraftMatchInput,
    SchemaJoinRequest,
    SchemaMatch,
    SchemaMatchInvite,
    SchemaMatchJoinCommand,
    SchemaMatchJoinOutcome,
    SchemaMatchPage,
    SchemaMatchResult,
    SchemaProposeMatchResult,
    SchemaResolveMatchResult,
    SchemaUpdateMatchDraft,
    SchemaWaitlistEntry,
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
    readonly idempotencyKey?: string | undefined;
    readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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
        if (settings.idempotent) requestHeaders['Idempotency-Key'] = settings.idempotencyKey ?? crypto.randomUUID();
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
        createVenueCandidate: (body: SchemaCreateVenueCandidate, idempotencyKey?: string) =>
            call<SchemaVenueCandidate>('/venues/candidates', body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
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
        searchMatches: (parameters: NonNullable<operations['searchMatches']['parameters']['query']>) =>
            call<SchemaMatchPage>('/matches', undefined, { query: query(parameters) }),
        recommendMatches: (parameters: NonNullable<operations['recommendMatches']['parameters']['query']>) =>
            call<SchemaMatchPage>('/matches/recommendations', undefined, { auth: true, query: query(parameters) }),
        getMatch: (matchId: string) => call<SchemaMatch>(`/matches/${matchId}`),
        getMatchByInvite: (inviteToken: string) =>
            call<SchemaMatch>(`/match-invites/${encodeURIComponent(inviteToken)}`),
        createMatchDraft: (body: SchemaDraftMatchInput, idempotencyKey?: string) =>
            call<SchemaMatch>('/matches', body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        updateMatchDraft: (matchId: string, body: SchemaUpdateMatchDraft, idempotencyKey?: string) =>
            call<SchemaMatch>(`/matches/${matchId}`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'PATCH',
                mutation: true,
            }),
        deleteMatchDraft: (matchId: string, expectedVersion: number, idempotencyKey?: string) =>
            call<undefined>(`/matches/${matchId}`, undefined, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'DELETE',
                mutation: true,
                query: query({ expectedVersion }),
            }),
        publishMatch: (matchId: string, expectedVersion: number, idempotencyKey?: string) =>
            call<SchemaMatch | SchemaMatchInvite>(
                `/matches/${matchId}/publish`,
                { expectedVersion },
                { auth: true, idempotent: true, idempotencyKey, mutation: true }
            ),
        rotateMatchInvite: (matchId: string, expectedVersion: number, idempotencyKey?: string) =>
            call<SchemaMatchInvite>(
                `/matches/${matchId}/invite/rotate`,
                { expectedVersion },
                { auth: true, idempotent: true, idempotencyKey, mutation: true }
            ),
        joinMatch: (matchId: string, body: SchemaMatchJoinCommand, idempotencyKey?: string) =>
            call<SchemaMatchJoinOutcome>(`/matches/${matchId}/join`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        listMatchJoinRequests: (matchId: string) =>
            call<{ readonly items: readonly SchemaJoinRequest[] }>(`/matches/${matchId}/join-requests`, undefined, {
                auth: true,
            }),
        listMatchWaitlist: (matchId: string) =>
            call<{ readonly items: readonly SchemaWaitlistEntry[] }>(`/matches/${matchId}/waitlist`, undefined, {
                auth: true,
            }),
        decideMatchJoinRequest: (
            matchId: string,
            joinRequestId: string,
            decision: 'approve' | 'reject' | 'withdraw',
            expectedVersion: number,
            idempotencyKey?: string
        ) =>
            call<SchemaMatchJoinOutcome | SchemaJoinRequest>(
                `/matches/${matchId}/join-requests/${joinRequestId}/${decision}`,
                { expectedVersion },
                { auth: true, idempotent: true, idempotencyKey, mutation: true }
            ),
        actOnMatchWaitlist: (
            matchId: string,
            entryId: string,
            action: 'promote' | 'withdraw',
            expectedVersion: number,
            idempotencyKey?: string
        ) =>
            call<SchemaMatchJoinOutcome | SchemaWaitlistEntry>(
                `/matches/${matchId}/waitlist/${entryId}/${action}`,
                { expectedVersion },
                { auth: true, idempotent: true, idempotencyKey, mutation: true }
            ),
        leaveMatch: (matchId: string, participantId: string, expectedVersion: number, idempotencyKey?: string) =>
            call<SchemaMatch>(
                `/matches/${matchId}/participants/${participantId}/leave`,
                { expectedVersion },
                { auth: true, idempotent: true, idempotencyKey, mutation: true }
            ),
        transitionMatch: (
            matchId: string,
            transition: 'cancel' | 'start',
            expectedVersion: number,
            idempotencyKey?: string
        ) =>
            call<SchemaMatch>(
                `/matches/${matchId}/${transition}`,
                { expectedVersion },
                { auth: true, idempotent: true, idempotencyKey, mutation: true }
            ),
        proposeMatchResult: (matchId: string, body: SchemaProposeMatchResult, idempotencyKey?: string) =>
            call<SchemaMatchResult>(`/matches/${matchId}/results`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        resolveMatchResult: (
            matchId: string,
            resultId: string,
            decision: 'confirm' | 'dispute',
            body: SchemaResolveMatchResult,
            idempotencyKey?: string
        ) =>
            call<SchemaMatchResult>(`/matches/${matchId}/results/${resultId}/${decision}`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
    } as const;
}

export type IdentityClient = ReturnType<typeof createIdentityClient>;
