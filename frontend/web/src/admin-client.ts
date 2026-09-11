import { ApiError, type components, type operations } from '@picklehub/api-client';

type ErrorEnvelope = components['schemas']['ErrorEnvelope'];
type JsonBody = Record<string, unknown>;

export interface AdminClientOptions {
    readonly baseUrl: string;
    readonly fetch?: typeof globalThis.fetch;
    readonly onUnauthorized?: () => void;
}

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/$/u, '')}${path}`;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.requestId === 'string' && typeof candidate.error === 'object' && candidate.error !== null;
}

export function createAdminClient(options: AdminClientOptions) {
    const request = options.fetch ?? globalThis.fetch;
    let credential: string | undefined;
    let csrfToken: string | undefined;

    function query(parameters: Readonly<Record<string, unknown>>): URLSearchParams {
        const result = new URLSearchParams();
        for (const [key, value] of Object.entries(parameters)) {
            if (typeof value === 'string' && value !== '') result.set(key, value);
            if (typeof value === 'number' || typeof value === 'boolean') result.set(key, String(value));
        }
        return result;
    }

    async function parse<T>(response: Response): Promise<T> {
        const body: unknown = await response.json().catch(() => undefined);
        if (!response.ok) {
            if (response.status === 401) {
                credential = undefined;
                csrfToken = undefined;
                options.onUnauthorized?.();
            }
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

    async function context(): Promise<void> {
        const response = await request(joinUrl(options.baseUrl, '/auth/context'), {
            cache: 'no-store',
            credentials: 'include',
            headers: { Accept: 'application/json', 'Accept-Language': 'ru-RU' },
        });
        const value = await parse<{ readonly csrfToken: string }>(response);
        csrfToken = value.csrfToken;
    }

    async function call<T>(
        path: string,
        settings: {
            readonly body?: JsonBody;
            readonly idempotencyKey?: string | undefined;
            readonly mutation?: boolean;
            readonly parameters?: Readonly<Record<string, unknown>>;
        } = {}
    ): Promise<T> {
        if (!credential) throw new ApiError(401);
        if (settings.mutation && !csrfToken) await context();
        const parameters = settings.parameters ? query(settings.parameters).toString() : '';
        const headers: Record<string, string> = {
            Accept: 'application/json',
            'Accept-Language': 'ru-RU',
            Authorization: `Bearer ${credential}`,
        };
        if (settings.body) headers['Content-Type'] = 'application/json';
        if (settings.mutation) {
            if (!csrfToken) throw new Error('Browser security context is unavailable');
            headers['X-CSRF-Token'] = csrfToken;
            headers['Idempotency-Key'] = settings.idempotencyKey ?? crypto.randomUUID();
        }
        const requestInit: RequestInit = {
            cache: 'no-store',
            credentials: 'include',
            headers,
            method: settings.body || settings.mutation ? 'POST' : 'GET',
        };
        if (settings.body) requestInit.body = JSON.stringify(settings.body);
        const response = await request(
            `${joinUrl(options.baseUrl, path)}${parameters ? `?${parameters}` : ''}`,
            requestInit
        );
        return parse<T>(response);
    }

    return {
        authenticate: async (token: string) => {
            credential = token;
            try {
                return await call<components['schemas']['AdminSessionContext']>('/admin/session');
            } catch (error) {
                credential = undefined;
                throw error;
            }
        },
        clear: () => {
            credential = undefined;
            csrfToken = undefined;
        },
        getSession: () => call<components['schemas']['AdminSessionContext']>('/admin/session'),
        listCases: (parameters: NonNullable<operations['listAdminCases']['parameters']['query']>) =>
            call<components['schemas']['AdminCasePage']>('/admin/cases', { parameters }),
        getCase: (caseId: string) => call<components['schemas']['AdminCaseDetail']>(`/admin/cases/${caseId}`),
        assignCase: (caseId: string, body: components['schemas']['AssignAdminCase'], idempotencyKey?: string) =>
            call<components['schemas']['AdminCaseSummary']>(`/admin/cases/${caseId}/assignment`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        decideCase: (caseId: string, body: components['schemas']['DecideAdminCase'], idempotencyKey?: string) =>
            call<components['schemas']['AdminCaseSummary']>(`/admin/cases/${caseId}/decision`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        lookupUser: (body: components['schemas']['AdminUserLookupRequest']) =>
            call<components['schemas']['AdminUserProjection']>('/admin/users/lookup', { body, mutation: true }),
        createRestriction: (
            userId: string,
            body: components['schemas']['ChangeUserRestriction'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['UserRestriction']>(`/admin/users/${userId}/restrictions`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        revokeRestriction: (
            userId: string,
            restrictionId: string,
            body: components['schemas']['RevokeUserRestriction'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['UserRestriction']>(
                `/admin/users/${userId}/restrictions/${restrictionId}/revoke`,
                { body, idempotencyKey, mutation: true }
            ),
        listVenues: (parameters: NonNullable<operations['listAdminVenueCandidates']['parameters']['query']>) =>
            call<components['schemas']['AdminVenueQueuePage']>('/admin/venue-candidates', { parameters }),
        getVenue: (itemId: string) =>
            call<components['schemas']['AdminVenueCandidateDetail']>(`/admin/venue-candidates/${itemId}`),
        decideVenue: (itemId: string, body: components['schemas']['DecideAdminVenue'], idempotencyKey?: string) =>
            call<components['schemas']['AdminVenueQueueItem']>(`/admin/venue-candidates/${itemId}/decision`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        mergeVenue: (itemId: string, body: components['schemas']['MergeAdminVenue'], idempotencyKey?: string) =>
            call<components['schemas']['AdminVenueQueueItem']>(`/admin/venue-candidates/${itemId}/merge`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        searchAudit: (parameters: operations['searchAdminAudit']['parameters']['query']) =>
            call<components['schemas']['AuditEntryPage']>('/admin/audit', { parameters }),
    } as const;
}

export type AdminClient = ReturnType<typeof createAdminClient>;
