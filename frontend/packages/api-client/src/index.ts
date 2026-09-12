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
    SchemaConversationReadPosition,
    SchemaConversationSnapshot,
    SchemaEditMessageCommand,
    SchemaGeocodingSuggestions,
    SchemaMarkConversationReadCommand,
    SchemaMessage,
    SchemaMessagePage,
    SchemaMessageReportReceipt,
    SchemaNotificationPage,
    SchemaNotificationPreference,
    SchemaNotificationReadReceipt,
    SchemaAvatarUploadPolicy,
    SchemaAvatarUploadRequest,
    SchemaAppealSubmission,
    SchemaBlockPage,
    SchemaCaseResponseSubmission,
    SchemaMatchHistoryPage,
    SchemaNoShowReportSubmission,
    SchemaOwnReview,
    SchemaOwnSafetyReportDetail,
    SchemaPlayerProfile,
    SchemaPlayerStatistics,
    SchemaProfilePrivacySettings,
    SchemaPublicReviewAggregate,
    SchemaProposeVenueRevision,
    SchemaPublicPlayerProfile,
    SchemaPublicPlayerStatistics,
    SchemaReportMessageCommand,
    SchemaReportSubmission,
    SchemaReviewSubmission,
    SchemaSafetyReceipt,
    SchemaSafetyReceiptPage,
    SchemaSendMessageCommand,
    SchemaUpdateNotificationPreference,
    SchemaUpdatePlayerProfile,
    SchemaUpdateProfilePrivacySettings,
    SchemaUserBlock,
    SchemaVenue,
    SchemaVenueCandidate,
    SchemaVenuePage,
    SchemaVenueReport,
    SchemaVenueRevision,
} from './generated/openapi';
import type { components, operations } from './generated/openapi';

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
    readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
        getRealtimeUrl: () => {
            const url = new URL(joinUrl(options.baseUrl, '/ws'), globalThis.location.href);
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            return url.toString();
        },
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
        getRealtimeTicket: async () => (await refresh()).accessToken,
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
        searchClubs: (parameters: NonNullable<operations['searchClubs']['parameters']['query']>) =>
            call<components['schemas']['ClubPage']>('/clubs', undefined, { query: query(parameters) }),
        getClub: (clubId: string) => call<components['schemas']['Club']>(`/clubs/${clubId}`),
        createClub: (body: components['schemas']['CreateClubInput']) =>
            call<components['schemas']['Club']>('/clubs', body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        updateClub: (clubId: string, body: components['schemas']['UpdateClubInput']) =>
            call<components['schemas']['Club']>(`/clubs/${clubId}`, body, {
                auth: true,
                idempotent: true,
                method: 'PATCH',
                mutation: true,
            }),
        archiveClub: (clubId: string, body: components['schemas']['ClubReasonedCommand']) =>
            call<components['schemas']['Club']>(`/clubs/${clubId}/archive`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        restoreClub: (clubId: string, body: components['schemas']['ClubReasonedCommand']) =>
            call<components['schemas']['Club']>(`/clubs/${clubId}/restore`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        joinClub: (clubId: string, expectedVersion: number) =>
            call<components['schemas']['ClubJoinOutcome']>(
                `/clubs/${clubId}/join`,
                { expectedVersion },
                { auth: true, idempotent: true, mutation: true }
            ),
        listClubMembers: (clubId: string) =>
            call<components['schemas']['ClubMemberPage']>(`/clubs/${clubId}/members`, undefined, { auth: true }),
        leaveClub: (clubId: string, membershipId: string, expectedClubVersion: number, expectedRevision: number) =>
            call<components['schemas']['ClubMembership']>(
                `/clubs/${clubId}/members/${membershipId}/leave`,
                {
                    expectedClubVersion,
                    expectedRevision,
                },
                { auth: true, idempotent: true, mutation: true }
            ),
        changeClubMemberRole: (
            clubId: string,
            membershipId: string,
            body: components['schemas']['ChangeClubRoleInput']
        ) =>
            call<components['schemas']['ClubMembership']>(`/clubs/${clubId}/members/${membershipId}/role`, body, {
                auth: true,
                idempotent: true,
                method: 'PATCH',
                mutation: true,
            }),
        excludeClubMember: (
            clubId: string,
            membershipId: string,
            body: components['schemas']['ClubResourceReasonedCommand']
        ) =>
            call<components['schemas']['ClubMembership']>(`/clubs/${clubId}/members/${membershipId}/exclude`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        blockClubMember: (
            clubId: string,
            membershipId: string,
            body: components['schemas']['ClubResourceReasonedCommand']
        ) =>
            call<undefined>(`/clubs/${clubId}/members/${membershipId}/block`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        transferClubOwnership: (clubId: string, body: components['schemas']['TransferClubOwnershipInput']) =>
            call<components['schemas']['Club']>(`/clubs/${clubId}/ownership/transfer`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        listClubJoinRequests: (clubId: string) =>
            call<components['schemas']['ClubJoinRequestPage']>(`/clubs/${clubId}/join-requests`, undefined, {
                auth: true,
            }),
        decideClubJoinRequest: (
            clubId: string,
            requestId: string,
            decision: 'approve' | 'reject' | 'cancel',
            expectedClubVersion: number,
            expectedRevision: number
        ) =>
            call<components['schemas']['ClubMembership'] | components['schemas']['ClubJoinRequest']>(
                `/clubs/${clubId}/join-requests/${requestId}/${decision}`,
                { expectedClubVersion, expectedRevision },
                { auth: true, idempotent: true, mutation: true }
            ),
        listClubInvitations: (clubId: string) =>
            call<components['schemas']['ClubInvitationPage']>(`/clubs/${clubId}/invitations`, undefined, {
                auth: true,
            }),
        createClubInvitation: (clubId: string, body: components['schemas']['CreateClubInvitationInput']) =>
            call<components['schemas']['ClubInvitationDelivery']>(`/clubs/${clubId}/invitations`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        revokeClubInvitation: (
            clubId: string,
            invitationId: string,
            expectedClubVersion: number,
            expectedRevision: number
        ) =>
            call<components['schemas']['ClubInvitation']>(
                `/clubs/${clubId}/invitations/${invitationId}/revoke`,
                {
                    expectedClubVersion,
                    expectedRevision,
                },
                { auth: true, idempotent: true, mutation: true }
            ),
        getClubInvitation: (token: string) =>
            call<components['schemas']['ClubInvitation']>(`/club-invitations/${encodeURIComponent(token)}`, undefined, {
                auth: true,
            }),
        decideClubInvitation: (
            token: string,
            decision: 'accept' | 'decline',
            expectedClubVersion: number,
            expectedRevision: number
        ) =>
            call<components['schemas']['ClubMembership'] | components['schemas']['ClubInvitation']>(
                `/club-invitations/${encodeURIComponent(token)}/${decision}`,
                { expectedClubVersion, expectedRevision },
                { auth: true, idempotent: true, mutation: true }
            ),
        listClubVenues: (clubId: string) =>
            call<{ readonly items: readonly components['schemas']['ClubVenue'][] }>(`/clubs/${clubId}/venues`),
        linkClubVenue: (clubId: string, body: components['schemas']['ClubVenueCommand']) =>
            call<components['schemas']['ClubVenue']>(`/clubs/${clubId}/venues`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        unlinkClubVenue: (clubId: string, venueId: string, expectedVersion: number) =>
            call<undefined>(`/clubs/${clubId}/venues/${venueId}`, undefined, {
                auth: true,
                idempotent: true,
                method: 'DELETE',
                mutation: true,
                query: query({ expectedVersion }),
            }),
        createClubMatch: (clubId: string, body: components['schemas']['CreateClubMatchInput']) =>
            call<components['schemas']['Match']>(`/clubs/${clubId}/matches`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        listRecurringMatchRules: (clubId: string) =>
            call<components['schemas']['RecurringMatchRulePage']>(`/clubs/${clubId}/recurring-match-rules`, undefined, {
                auth: true,
            }),
        createRecurringMatchRule: (clubId: string, body: components['schemas']['CreateRecurringMatchRuleInput']) =>
            call<components['schemas']['RecurringMatchRule']>(`/clubs/${clubId}/recurring-match-rules`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        listRecurringMatchOccurrences: (clubId: string, ruleId: string) =>
            call<components['schemas']['RecurringMatchOccurrencePage']>(
                `/clubs/${clubId}/recurring-match-rules/${ruleId}/occurrences`,
                undefined,
                { auth: true }
            ),
        transitionRecurringMatchRule: (
            clubId: string,
            ruleId: string,
            transition: 'pause' | 'resume' | 'end',
            body: components['schemas']['ClubResourceReasonedCommand']
        ) =>
            call<components['schemas']['RecurringMatchRule']>(
                `/clubs/${clubId}/recurring-match-rules/${ruleId}/${transition}`,
                body,
                { auth: true, idempotent: true, mutation: true }
            ),
        searchTournaments: (parameters: NonNullable<operations['searchTournaments']['parameters']['query']>) =>
            call<components['schemas']['TournamentPage']>('/tournaments', undefined, { query: query(parameters) }),
        getTournament: (tournamentId: string) =>
            call<components['schemas']['Tournament']>(`/tournaments/${tournamentId}`),
        createTournament: (body: components['schemas']['CreateTournamentInput']) =>
            call<components['schemas']['Tournament']>('/tournaments', body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        updateTournament: (tournamentId: string, body: components['schemas']['UpdateTournamentInput']) =>
            call<components['schemas']['Tournament']>(`/tournaments/${tournamentId}`, body, {
                auth: true,
                idempotent: true,
                method: 'PATCH',
                mutation: true,
            }),
        publishTournament: (tournamentId: string, expectedVersion: number) =>
            call<components['schemas']['Tournament']>(
                `/tournaments/${tournamentId}/publish`,
                { expectedVersion },
                { auth: true, idempotent: true, mutation: true }
            ),
        registerForTournament: (tournamentId: string, body: components['schemas']['RegisterTournamentInput']) =>
            call<components['schemas']['TournamentRegistrationResult']>(
                `/tournaments/${tournamentId}/registrations`,
                body,
                { auth: true, idempotent: true, mutation: true }
            ),
        listTournamentEntrants: (tournamentId: string) =>
            call<components['schemas']['EntrantPage']>(`/tournaments/${tournamentId}/entrants`, undefined, {
                auth: true,
            }),
        checkInTournamentEntrant: (
            tournamentId: string,
            entrantId: string,
            body: components['schemas']['EntrantCommand']
        ) =>
            call<components['schemas']['Entrant']>(
                `/tournaments/${tournamentId}/entrants/${entrantId}/check-in`,
                body,
                {
                    auth: true,
                    idempotent: true,
                    mutation: true,
                }
            ),
        withdrawTournamentEntrant: (
            tournamentId: string,
            entrantId: string,
            body: components['schemas']['EntrantCommand']
        ) =>
            call<components['schemas']['Entrant']>(
                `/tournaments/${tournamentId}/entrants/${entrantId}/withdraw`,
                body,
                {
                    auth: true,
                    idempotent: true,
                    mutation: true,
                }
            ),
        markTournamentExternalPayment: (
            tournamentId: string,
            entrantId: string,
            body: components['schemas']['PaymentMarkInput']
        ) =>
            call<components['schemas']['PaymentMark']>(
                `/tournaments/${tournamentId}/entrants/${entrantId}/payment-mark`,
                body,
                { auth: true, idempotent: true, method: 'PUT', mutation: true }
            ),
        seedTournament: (tournamentId: string, body: components['schemas']['SeedInput']) =>
            call<components['schemas']['TournamentPlan']>(`/tournaments/${tournamentId}/seed`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        startTournament: (tournamentId: string, expectedVersion: number) =>
            call<components['schemas']['Tournament']>(
                `/tournaments/${tournamentId}/start`,
                { expectedVersion },
                { auth: true, idempotent: true, mutation: true }
            ),
        getTournamentPlan: (tournamentId: string) =>
            call<components['schemas']['TournamentPlan']>(`/tournaments/${tournamentId}/plan`),
        startTournamentRound: (tournamentId: string, roundId: string, body: components['schemas']['StartRoundInput']) =>
            call<components['schemas']['Round']>(`/tournaments/${tournamentId}/rounds/${roundId}/start`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        completeTournamentRound: (
            tournamentId: string,
            roundId: string,
            body: components['schemas']['CompleteRoundInput']
        ) =>
            call<components['schemas']['TournamentPlan']>(
                `/tournaments/${tournamentId}/rounds/${roundId}/complete`,
                body,
                { auth: true, idempotent: true, mutation: true }
            ),
        scoreTournamentMatch: (
            tournamentId: string,
            tournamentMatchId: string,
            body: components['schemas']['ScoreTournamentMatchInput']
        ) =>
            call<components['schemas']['TournamentMatch']>(
                `/tournaments/${tournamentId}/matches/${tournamentMatchId}/score`,
                body,
                { auth: true, idempotent: true, method: 'PUT', mutation: true }
            ),
        recordTournamentWalkover: (
            tournamentId: string,
            tournamentMatchId: string,
            body: components['schemas']['WalkoverTournamentMatchInput']
        ) =>
            call<components['schemas']['TournamentMatch']>(
                `/tournaments/${tournamentId}/matches/${tournamentMatchId}/walkover`,
                body,
                { auth: true, idempotent: true, method: 'PUT', mutation: true }
            ),
        correctTournamentMatch: (
            tournamentId: string,
            tournamentMatchId: string,
            body: components['schemas']['CorrectTournamentMatchInput']
        ) =>
            call<components['schemas']['TournamentPlan']>(
                `/tournaments/${tournamentId}/matches/${tournamentMatchId}/corrections`,
                body,
                { auth: true, idempotent: true, mutation: true }
            ),
        pauseTournament: (tournamentId: string, body: components['schemas']['TournamentReasonedCommand']) =>
            call<components['schemas']['Tournament']>(`/tournaments/${tournamentId}/pause`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        resumeTournament: (tournamentId: string, body: components['schemas']['TournamentReasonedCommand']) =>
            call<components['schemas']['TournamentPlan']>(`/tournaments/${tournamentId}/resume`, body, {
                auth: true,
                idempotent: true,
                mutation: true,
            }),
        completeTournament: (tournamentId: string, expectedVersion: number) =>
            call<components['schemas']['TournamentPlan']>(
                `/tournaments/${tournamentId}/complete`,
                { expectedVersion },
                { auth: true, idempotent: true, mutation: true }
            ),
        cancelTournament: (tournamentId: string, body: components['schemas']['TournamentReasonedCommand']) =>
            call<undefined>(`/tournaments/${tournamentId}/cancel`, body, {
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
        getMatchConversation: (matchId: string) =>
            call<SchemaConversationSnapshot>(`/matches/${matchId}/conversation`, undefined, { auth: true }),
        listConversationMessages: (matchId: string, cursor: string, limit = 50) =>
            call<SchemaMessagePage>(`/matches/${matchId}/conversation/messages`, undefined, {
                auth: true,
                query: query({ cursor, limit }),
            }),
        sendConversationMessage: (matchId: string, body: SchemaSendMessageCommand, idempotencyKey?: string) =>
            call<SchemaMessage>(`/matches/${matchId}/conversation/messages`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        editConversationMessage: (
            matchId: string,
            messageId: string,
            body: SchemaEditMessageCommand,
            idempotencyKey?: string
        ) =>
            call<SchemaMessage>(`/matches/${matchId}/conversation/messages/${messageId}`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'PATCH',
                mutation: true,
            }),
        deleteConversationMessage: (
            matchId: string,
            messageId: string,
            expectedRevision: number,
            idempotencyKey?: string
        ) =>
            call<SchemaMessage>(`/matches/${matchId}/conversation/messages/${messageId}`, undefined, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'DELETE',
                mutation: true,
                query: query({ expectedRevision }),
            }),
        reportConversationMessage: (
            matchId: string,
            messageId: string,
            body: SchemaReportMessageCommand,
            idempotencyKey?: string
        ) =>
            call<SchemaMessageReportReceipt>(`/matches/${matchId}/conversation/messages/${messageId}/reports`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        markConversationRead: (matchId: string, body: SchemaMarkConversationReadCommand, idempotencyKey?: string) =>
            call<SchemaConversationReadPosition>(`/matches/${matchId}/conversation/read`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        blockCommunicationUser: (blockedUserId: string, idempotencyKey?: string) =>
            call<SchemaUserBlock>(
                `/communication-blocks/${blockedUserId}`,
                {},
                {
                    auth: true,
                    idempotent: true,
                    idempotencyKey,
                    method: 'PUT',
                    mutation: true,
                }
            ),
        unblockCommunicationUser: (blockedUserId: string, idempotencyKey?: string) =>
            call<undefined>(`/communication-blocks/${blockedUserId}`, undefined, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'DELETE',
                mutation: true,
            }),
        listNotifications: (cursor?: string, limit = 50) =>
            call<SchemaNotificationPage>('/notifications', undefined, {
                auth: true,
                query: query({ cursor, limit }),
            }),
        markNotificationRead: (notificationId: string, idempotencyKey?: string) =>
            call<SchemaNotificationReadReceipt>(
                `/notifications/${notificationId}/read`,
                {},
                {
                    auth: true,
                    idempotent: true,
                    idempotencyKey,
                    mutation: true,
                }
            ),
        getNotificationPreferences: () =>
            call<SchemaNotificationPreference>('/notification-preferences', undefined, { auth: true }),
        updateNotificationPreferences: (body: SchemaUpdateNotificationPreference, idempotencyKey?: string) =>
            call<SchemaNotificationPreference>('/notification-preferences', body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'PUT',
                mutation: true,
            }),
        getOwnPlayerProfile: () => call<SchemaPlayerProfile>('/me/profile', undefined, { auth: true }),
        updateOwnPlayerProfile: (body: SchemaUpdatePlayerProfile, idempotencyKey?: string) =>
            call<SchemaPlayerProfile>('/me/profile', body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'PATCH',
                mutation: true,
            }),
        getProfilePrivacySettings: () =>
            call<SchemaProfilePrivacySettings>('/me/profile/privacy', undefined, { auth: true }),
        updateProfilePrivacySettings: (body: SchemaUpdateProfilePrivacySettings, idempotencyKey?: string) =>
            call<SchemaProfilePrivacySettings>('/me/profile/privacy', body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'PATCH',
                mutation: true,
            }),
        setDuprProfileLink: (url: string, expectedVersion: number, idempotencyKey?: string) =>
            call<SchemaPlayerProfile>(
                '/me/profile/external-links/dupr',
                { expectedVersion, url },
                { auth: true, idempotent: true, idempotencyKey, method: 'PUT', mutation: true }
            ),
        removeDuprProfileLink: (expectedVersion: number, idempotencyKey?: string) =>
            call<undefined>(
                '/me/profile/external-links/dupr',
                { expectedVersion },
                { auth: true, idempotent: true, idempotencyKey, method: 'DELETE', mutation: true }
            ),
        createProfileAvatarUpload: (body: SchemaAvatarUploadRequest, idempotencyKey?: string) =>
            call<SchemaAvatarUploadPolicy>('/me/profile/avatar-uploads', body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        removeProfileAvatar: (expectedVersion: number, idempotencyKey?: string) =>
            call<undefined>(
                '/me/profile/avatar',
                { expectedVersion },
                { auth: true, idempotent: true, idempotencyKey, method: 'DELETE', mutation: true }
            ),
        listOwnMatchHistory: (cursor?: string, limit = 20) =>
            call<SchemaMatchHistoryPage>('/me/match-history', undefined, {
                auth: true,
                query: query({ cursor, limit }),
            }),
        getOwnPlayerStatistics: () => call<SchemaPlayerStatistics>('/me/statistics', undefined, { auth: true }),
        getPublicPlayerProfile: (playerId: string) =>
            call<SchemaPublicPlayerProfile>(`/players/${playerId}`, undefined, { auth: true }),
        listPublicPlayerMatchHistory: (playerId: string, cursor?: string, limit = 20) =>
            call<SchemaMatchHistoryPage>(`/players/${playerId}/match-history`, undefined, {
                auth: true,
                query: query({ cursor, limit }),
            }),
        getPublicPlayerStatistics: (playerId: string) =>
            call<SchemaPublicPlayerStatistics>(`/players/${playerId}/statistics`, undefined, { auth: true }),
        submitMatchReview: (
            matchId: string,
            subjectPlayerId: string,
            body: SchemaReviewSubmission,
            idempotencyKey?: string
        ) =>
            call<SchemaOwnReview>(`/matches/${matchId}/reviews/${subjectPlayerId}`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'PUT',
                mutation: true,
            }),
        withdrawMatchReview: (matchId: string, subjectPlayerId: string, idempotencyKey?: string) =>
            call<undefined>(`/matches/${matchId}/reviews/${subjectPlayerId}`, undefined, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                method: 'DELETE',
                mutation: true,
            }),
        submitNoShowReport: (matchId: string, body: SchemaNoShowReportSubmission, idempotencyKey?: string) =>
            call<SchemaSafetyReceipt>(`/matches/${matchId}/no-show-reports`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        submitSafetyReport: (body: SchemaReportSubmission, idempotencyKey?: string) =>
            call<SchemaSafetyReceipt>('/safety-reports', body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        listOwnSafetyReports: (cursor?: string, limit = 20) =>
            call<SchemaSafetyReceiptPage>('/me/safety-reports', undefined, {
                auth: true,
                query: query({ cursor, limit }),
            }),
        getOwnSafetyReport: (receiptId: string) =>
            call<SchemaOwnSafetyReportDetail>(`/me/safety-reports/${receiptId}`, undefined, { auth: true }),
        requestSafetyReportWithdrawal: (receiptId: string, idempotencyKey?: string) =>
            call<SchemaSafetyReceipt>(
                `/me/safety-reports/${receiptId}/withdrawal`,
                { requested: true },
                { auth: true, idempotent: true, idempotencyKey, mutation: true }
            ),
        respondToSafetyCase: (receiptId: string, body: SchemaCaseResponseSubmission, idempotencyKey?: string) =>
            call<SchemaSafetyReceipt>(`/me/safety-reports/${receiptId}/responses`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        appealSafetyDecision: (receiptId: string, body: SchemaAppealSubmission, idempotencyKey?: string) =>
            call<SchemaSafetyReceipt>(`/me/safety-reports/${receiptId}/appeals`, body, {
                auth: true,
                idempotent: true,
                idempotencyKey,
                mutation: true,
            }),
        listOwnBlocks: (cursor?: string, limit = 20) =>
            call<SchemaBlockPage>('/me/blocks', undefined, { auth: true, query: query({ cursor, limit }) }),
        getPublicPlayerReputation: (playerId: string) =>
            call<SchemaPublicReviewAggregate>(`/players/${playerId}/reputation`, undefined, { auth: true }),
    } as const;
}

export type IdentityClient = ReturnType<typeof createIdentityClient>;
