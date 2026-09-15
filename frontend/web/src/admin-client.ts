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
            readonly method?: 'GET' | 'POST' | 'PUT';
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
            method: settings.method ?? (settings.body || settings.mutation ? 'POST' : 'GET'),
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
        listContentSources: (parameters: Record<string, unknown> = { limit: 50 }) =>
            call<components['schemas']['ContentSourcePage']>('/admin/content/sources', { parameters }),
        createContentSource: (body: components['schemas']['ContentSourceInput'], idempotencyKey?: string) =>
            call<components['schemas']['ContentSource']>('/admin/content/sources', {
                body,
                idempotencyKey,
                mutation: true,
            }),
        updateContentSource: (
            sourceId: string,
            body: components['schemas']['ContentSourceInput'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['ContentSource']>(`/admin/content/sources/${sourceId}`, {
                body,
                idempotencyKey,
                method: 'PUT',
                mutation: true,
            }),
        pauseContentSource: (
            sourceId: string,
            body: components['schemas']['PauseContentSource'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['ContentSource']>(`/admin/content/sources/${sourceId}/pause`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        changeContentSourceState: (
            sourceId: string,
            body: components['schemas']['ChangeContentSourceState'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['ContentSource']>(`/admin/content/sources/${sourceId}/state`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        listContentCandidates: (parameters: Record<string, unknown> = { limit: 50 }) =>
            call<components['schemas']['IngestCandidatePage']>('/admin/content/candidates', { parameters }),
        getContentCandidate: (candidateId: string) =>
            call<components['schemas']['IngestCandidate']>(`/admin/content/candidates/${candidateId}`),
        decideContentCandidate: (
            candidateId: string,
            body: components['schemas']['DecideIngestCandidate'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['IngestCandidate']>(`/admin/content/candidates/${candidateId}/decision`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        listContentArticles: (parameters: Record<string, unknown> = { limit: 50 }) =>
            call<components['schemas']['AdminArticlePage']>('/admin/content/articles', { parameters }),
        createContentArticle: (body: components['schemas']['CreateArticleInput'], idempotencyKey?: string) =>
            call<components['schemas']['AdminArticle']>('/admin/content/articles', {
                body,
                idempotencyKey,
                mutation: true,
            }),
        getContentArticle: (articleId: string) =>
            call<components['schemas']['AdminArticle']>(`/admin/content/articles/${articleId}`),
        listContentRevisions: (articleId: string, parameters: Record<string, unknown> = { limit: 50 }) =>
            call<components['schemas']['ArticleRevisionPage']>(`/admin/content/articles/${articleId}/revisions`, {
                parameters,
            }),
        getContentRevision: (articleId: string, revisionId: string) =>
            call<components['schemas']['ArticleRevision']>(
                `/admin/content/articles/${articleId}/revisions/${revisionId}`
            ),
        previewContentRevision: (articleId: string, revisionId: string) =>
            call<components['schemas']['ArticleRevision']>(
                `/admin/content/articles/${articleId}/revisions/${revisionId}/preview`
            ),
        createContentRevision: (
            articleId: string,
            body: components['schemas']['ArticleRevisionInput'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['ArticleRevision']>(`/admin/content/articles/${articleId}/revisions`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        decideContentArticle: (
            articleId: string,
            body: components['schemas']['ContentDecisionInput'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['ContentPublicationDecision']>(
                `/admin/content/articles/${articleId}/decisions`,
                {
                    body,
                    idempotencyKey,
                    mutation: true,
                }
            ),
        emergencyUnpublishContentArticle: (
            articleId: string,
            body: components['schemas']['EmergencyUnpublishContentInput'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['ContentPublicationDecision']>(
                `/admin/content/articles/${articleId}/emergency-unpublish`,
                { body, idempotencyKey, mutation: true }
            ),
        listAdPlacements: (parameters: Record<string, unknown> = { limit: 100 }) =>
            call<{
                readonly items: readonly components['schemas']['AdPlacement'][];
                readonly pageInfo: components['schemas']['PageInfo'];
            }>('/admin/advertising/placements', { parameters }),
        createAdPlacement: (body: components['schemas']['AdPlacementInput'], idempotencyKey?: string) =>
            call<components['schemas']['AdPlacement']>('/admin/advertising/placements', {
                body,
                idempotencyKey,
                mutation: true,
            }),
        updateAdPlacement: (
            placementId: string,
            body: components['schemas']['AdPlacementInput'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['AdPlacement']>(`/admin/advertising/placements/${placementId}`, {
                body,
                idempotencyKey,
                method: 'PUT',
                mutation: true,
            }),
        listAdCampaigns: (parameters: Record<string, unknown> = { limit: 100 }) =>
            call<{
                readonly items: readonly components['schemas']['AdCampaign'][];
                readonly pageInfo: components['schemas']['PageInfo'];
            }>('/admin/advertising/campaigns', { parameters }),
        createAdCampaign: (body: components['schemas']['AdCampaignInput'], idempotencyKey?: string) =>
            call<components['schemas']['AdCampaign']>('/admin/advertising/campaigns', {
                body,
                idempotencyKey,
                mutation: true,
            }),
        getAdCampaign: (campaignId: string) =>
            call<components['schemas']['AdCampaign']>(`/admin/advertising/campaigns/${campaignId}`),
        createAdCreative: (body: components['schemas']['AdCreativeInput'], idempotencyKey?: string) =>
            call<components['schemas']['AdCreativeRecord']>('/admin/advertising/creatives', {
                body,
                idempotencyKey,
                mutation: true,
            }),
        createAdCampaignRevision: (
            campaignId: string,
            body: components['schemas']['AdCampaignRevisionInput'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['AdCampaignRevision']>(`/admin/advertising/campaigns/${campaignId}/revisions`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        decideAdCampaign: (
            campaignId: string,
            body: components['schemas']['AdCampaignDecisionInput'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['AdCampaign']>(`/admin/advertising/campaigns/${campaignId}/decisions`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        changeAdCampaignState: (
            campaignId: string,
            action: 'pause' | 'resume',
            body: components['schemas']['AdCampaignStateInput'],
            idempotencyKey?: string
        ) =>
            call<components['schemas']['AdCampaign']>(`/admin/advertising/campaigns/${campaignId}/${action}`, {
                body,
                idempotencyKey,
                mutation: true,
            }),
        getAdReport: (body: components['schemas']['AdReportInput']) =>
            call<components['schemas']['AdReport']>('/admin/advertising/reports', { body, mutation: true }),
    } as const;
}

export type AdminClient = ReturnType<typeof createAdminClient>;
