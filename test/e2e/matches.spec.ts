import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const matchId = '11111111-1111-4111-8111-111111111111';
const organizerId = '22222222-2222-4222-8222-222222222222';
const playerId = '33333333-3333-4333-8333-333333333333';
const venueId = '44444444-4444-4444-8444-444444444444';
const inviteToken = 'a'.repeat(43);

const match = {
    bookingNote: 'Корт подтверждён организатором вне PickleHub',
    bookingState: 'BOOKED_EXTERNALLY',
    createdAt: '2026-09-10T10:00:00.000Z',
    currentResult: null,
    description: 'Дружеская игра',
    format: 'SINGLES',
    guests: [],
    id: matchId,
    joinMode: 'AUTO',
    organizerId,
    participants: [
        {
            id: '33333333-3333-4333-8333-333333333333',
            isOrganizer: true,
            joinedAt: '2026-09-10T10:00:00.000Z',
            state: 'ACTIVE',
            team: 'TEAM_A',
            userId: organizerId,
        },
    ],
    policyVersion: 'matches-v1',
    publishedAt: '2026-09-10T10:00:00.000Z',
    skillMax: 4,
    skillMin: 2,
    startsAt: '2026-09-12T15:00:00.000Z',
    state: 'PUBLISHED',
    teams: [
        { capacity: 1, code: 'TEAM_A', occupiedPlaces: 1, reservedPlaces: 0 },
        { capacity: 1, code: 'TEAM_B', occupiedPlaces: 0, reservedPlaces: 0 },
    ],
    timeZone: 'Europe/Moscow',
    updatedAt: '2026-09-10T10:00:00.000Z',
    venue: { venueCandidateId: null, venueId: null },
    version: 3,
    visibility: 'PUBLIC',
};

function json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}

async function serveProductionBuild(page: Page, host: string, directory: string) {
    await page.route(new RegExp(`^http://${host}/(?!v1(?:/|$))`, 'u'), async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const asset =
            pathname.startsWith('/assets/') || pathname === '/runtime-config.json' ? pathname.slice(1) : 'index.html';
        await route.fulfill({ path: join(directory, asset) });
    });
}

async function mockMatches(page: Page) {
    await page.route('**/v1/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/v1/matches') {
            return json(route, {
                items: [
                    {
                        format: match.format,
                        id: match.id,
                        skillMax: match.skillMax,
                        skillMin: match.skillMin,
                        startsAt: match.startsAt,
                        state: 'PUBLISHED',
                        teams: match.teams,
                        timeZone: match.timeZone,
                    },
                ],
                pageInfo: { hasMore: false, nextCursor: null },
                snapshotAt: '2026-09-10T10:00:00.000Z',
            });
        }
        if (url.pathname === `/v1/matches/${matchId}`) return json(route, match);
        if (url.pathname === `/v1/match-invites/${inviteToken}`) {
            return json(route, { ...match, visibility: 'UNLISTED' });
        }
        return json(
            route,
            { error: { code: 'MATCH_NOT_FOUND', message: 'Матч не найден' }, requestId: crypto.randomUUID() },
            404
        );
    });
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web' },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA' },
] as const) {
    test(`${client.name} opens public search and match details without authentication`, async ({ browser }) => {
        const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        await mockMatches(page);
        await page.goto(`http://${client.host}/matches`);
        await expect(page.getByRole('heading', { level: 1, name: 'Матчи' })).toBeVisible();
        await page.getByRole('link', { name: /1 × 1/u }).click();
        await expect(page).toHaveURL(new RegExp(`/matches/${matchId}$`, 'u'));
        await expect(page.getByText('Корт подтверждён организатором вне PickleHub')).toBeVisible();
        await context.close();
    });
}

test('web opens an unlisted match capability without leaking it to page content', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
    const page = await context.newPage();
    await serveProductionBuild(page, 'web.picklehub.test', '/private/tmp/picklehub-e2e-web');
    await mockMatches(page);
    await page.goto(`http://web.picklehub.test/match-invites/${inviteToken}`);
    await expect(page.getByRole('heading', { level: 1, name: '1 × 1' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(inviteToken);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    await context.close();
});

function session(userId: string) {
    return {
        accessExpiresAt: '2026-09-10T12:05:00.000Z',
        accessToken: `${userId === organizerId ? 'o' : 'p'}`.repeat(43),
        csrfToken: 'c'.repeat(43),
        session: {
            absoluteExpiresAt: '2026-10-10T12:00:00.000Z',
            createdAt: '2026-09-10T12:00:00.000Z',
            id:
                userId === organizerId
                    ? '55555555-5555-4555-8555-555555555555'
                    : '66666666-6666-4666-8666-666666666666',
            idleExpiresAt: '2026-09-17T12:00:00.000Z',
            status: 'ACTIVE',
        },
        tokenType: 'Bearer',
        user: {
            completedAt: '2026-09-10T11:00:00.000Z',
            createdAt: '2026-09-09T12:00:00.000Z',
            id: userId,
            onboardingStatus: 'COMPLETED',
            requiredConsentsSatisfied: true,
            status: 'ACTIVE',
        },
    };
}

function journeyVenue() {
    return {
        accessMode: 'FREE',
        attribution: [],
        environment: 'OUTDOOR',
        id: venueId,
        lastVerifiedAt: '2026-09-10T10:00:00.000Z',
        locality: 'Москва',
        location: { latitude: 55.75, longitude: 37.61 },
        name: 'Корт полного сценария',
        normalizedAddress: 'Москва, Спортивная улица, 1',
        publicationState: 'PUBLISHED',
        verificationState: 'MODERATOR_VERIFIED',
        version: 1,
    };
}

interface JourneyResult {
    readonly confirmations: readonly object[];
    readonly games: readonly object[];
    readonly id: string;
    readonly matchId: string;
    readonly mode: unknown;
    readonly proposedAt: string;
    readonly resolvedAt: string | null;
    readonly seriesFormat: unknown;
    readonly state: string;
    readonly version: number;
    readonly winningTeam: unknown;
}

interface JourneyMatch {
    readonly bookingNote: string | null;
    readonly bookingState: string;
    readonly createdAt: string;
    readonly currentResult: JourneyResult | null;
    readonly description: string;
    readonly format: string;
    readonly guests: readonly object[];
    readonly id: string;
    readonly joinMode: string;
    readonly organizerId: string;
    readonly participants: readonly {
        readonly id: string;
        readonly isOrganizer: boolean;
        readonly joinedAt: string;
        readonly state: string;
        readonly team: string;
        readonly userId: string;
    }[];
    readonly policyVersion: string;
    readonly publishedAt: string | null;
    readonly skillMax: number;
    readonly skillMin: number;
    readonly startsAt: string;
    readonly state: string;
    readonly teams: readonly {
        readonly capacity: number;
        readonly code: string;
        readonly occupiedPlaces: number;
        readonly reservedPlaces: number;
    }[];
    readonly timeZone: string;
    readonly updatedAt: string;
    readonly venue: { readonly venueCandidateId: string | null; readonly venueId: string | null };
    readonly version: number;
    readonly visibility: string;
}

interface JourneyState {
    value?: JourneyMatch;
}

async function mockJourneyApi(page: Page, actorId: string, state: JourneyState) {
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        const body = method === 'GET' ? undefined : (request.postDataJSON() as Record<string, unknown> | undefined);
        if (url.pathname === '/v1/auth/context') return json(route, { csrfToken: 'c'.repeat(43) });
        if (
            url.pathname === '/v1/auth/magic-links/consume' ||
            url.pathname === '/v1/auth/refresh' ||
            url.pathname === '/v1/auth/telegram'
        )
            return json(route, session(actorId));
        if (url.pathname === '/v1/venues' && method === 'GET') {
            return json(route, {
                items: [journeyVenue()],
                pageInfo: { hasMore: false, nextCursor: null },
                snapshotAt: '2026-09-10T10:00:00.000Z',
            });
        }
        if (url.pathname === '/v1/matches' && method === 'POST') {
            state.value = {
                ...match,
                bookingNote: String(body?.bookingNote ?? ''),
                bookingState: String(body?.bookingState ?? 'UNKNOWN'),
                currentResult: null,
                description: String(body?.description ?? ''),
                organizerId: actorId,
                participants: [match.participants[0]],
                state: 'DRAFT',
                venue: { venueCandidateId: null, venueId },
                version: 0,
            };
            return json(route, state.value, 201);
        }
        if ((url.pathname === '/v1/matches' || url.pathname === '/v1/matches/recommendations') && method === 'GET') {
            const current = state.value;
            return json(route, {
                items:
                    current?.state === 'PUBLISHED'
                        ? [
                              {
                                  format: current.format,
                                  id: current.id,
                                  skillMax: current.skillMax,
                                  skillMin: current.skillMin,
                                  startsAt: current.startsAt,
                                  state: current.state,
                                  teams: current.teams,
                                  timeZone: current.timeZone,
                              },
                          ]
                        : [],
                pageInfo: { hasMore: false, nextCursor: null },
                recommendationPolicyVersion: 'matches-v1',
                snapshotAt: '2026-09-10T10:00:00.000Z',
            });
        }
        if (url.pathname === `/v1/matches/${matchId}` && method === 'GET' && state.value) {
            return json(route, state.value);
        }
        if (url.pathname.endsWith('/join-requests') || url.pathname.endsWith('/waitlist')) {
            return json(route, { items: [] });
        }
        if (url.pathname === `/v1/matches/${matchId}/publish`) {
            if (!state.value) throw new Error('Match was not created');
            state.value = { ...state.value, publishedAt: '2026-09-10T12:00:00.000Z', state: 'PUBLISHED', version: 1 };
            return json(route, state.value);
        }
        if (url.pathname === `/v1/matches/${matchId}/join`) {
            if (!state.value) throw new Error('Match was not created');
            const participant = {
                id: '77777777-7777-4777-8777-777777777777',
                isOrganizer: false,
                joinedAt: '2026-09-10T12:10:00.000Z',
                state: 'ACTIVE',
                team: 'TEAM_B',
                userId: actorId,
            } as const;
            state.value = {
                ...state.value,
                participants: [...state.value.participants, participant],
                teams: state.value.teams.map((team) =>
                    team.code === 'TEAM_B' ? { ...team, occupiedPlaces: 1 } : team
                ),
                version: 2,
            };
            return json(route, { joinRequest: null, match: state.value, participant, waitlistEntry: null });
        }
        if (url.pathname === `/v1/matches/${matchId}/start`) {
            if (!state.value) throw new Error('Match was not created');
            state.value = { ...state.value, state: 'IN_PROGRESS', version: 3 };
            return json(route, state.value);
        }
        if (url.pathname === `/v1/matches/${matchId}/results`) {
            if (!state.value) throw new Error('Match was not created');
            const result = {
                confirmations: [],
                games: (body?.games ?? []) as object[],
                id: '88888888-8888-4888-8888-888888888888',
                matchId,
                mode: body?.mode,
                proposedAt: '2026-09-10T13:00:00.000Z',
                resolvedAt: null,
                seriesFormat: body?.seriesFormat ?? null,
                state: 'PROPOSED' as const,
                version: 1,
                winningTeam: body?.winningTeam ?? null,
            } satisfies JourneyResult;
            state.value = { ...state.value, currentResult: result, state: 'AWAITING_CONFIRMATION', version: 4 };
            return json(route, result, 201);
        }
        if (url.pathname.endsWith('/confirm')) {
            if (!state.value?.currentResult) throw new Error('Result was not proposed');
            const result = {
                ...state.value.currentResult,
                confirmations: [{ createdAt: '2026-09-10T13:05:00.000Z', decision: 'CONFIRMED', playerId: actorId }],
                resolvedAt: '2026-09-10T13:05:00.000Z',
                state: 'CONFIRMED',
            };
            state.value = {
                ...state.value,
                currentResult: result,
                state: 'COMPLETED',
                version: 5,
            };
            return json(route, result);
        }
        return json(route, { error: { code: 'NOT_FOUND', message: 'Not found' }, requestId: crypto.randomUUID() }, 404);
    });
}

async function signIn(page: Page, client: 'web' | 'TMA', host: string, actorId: string) {
    if (client === 'web') {
        await page.goto(`http://${host}/auth/email#token=${'t'.repeat(43)}&next=/matches`);
        await page.getByRole('button', { name: 'Войти в PickleHub' }).click();
    } else {
        await page.goto(`http://${host}/login`);
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Матчи' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(actorId);
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web' as const },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA' as const },
]) {
    test(`${client.name} completes create, discovery, join, roster, result and confirmation`, async ({ browser }) => {
        const state: JourneyState = {};
        const organizerContext = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
        const playerContext = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
        const organizer = await organizerContext.newPage();
        const player = await playerContext.newPage();
        await serveProductionBuild(organizer, client.host, client.directory);
        await serveProductionBuild(player, client.host, client.directory);
        await mockJourneyApi(organizer, organizerId, state);
        await mockJourneyApi(player, playerId, state);
        await signIn(organizer, client.name, client.host, organizerId);
        await organizer.goto(`http://${client.host}/matches/new`);
        await organizer.getByLabel('Площадка').selectOption(venueId);
        await organizer.getByLabel('Дата и местное время').fill('2026-09-12T18:00');
        await organizer.getByLabel('Внешняя бронь').selectOption('BOOKED_EXTERNALLY');
        await organizer.getByLabel('Примечание о брони').fill('Бронь подтверждена вне PickleHub');
        await organizer.getByLabel('Описание').fill('Полный проверочный сценарий');
        await organizer.getByRole('button', { name: 'Создать черновик' }).click();
        await expect(organizer.getByRole('heading', { level: 1, name: '1 × 1' })).toBeVisible();
        await organizer.getByRole('button', { name: 'Опубликовать' }).click();
        await expect(organizer.getByText('Матч опубликован.')).toBeVisible();

        await signIn(player, client.name, client.host, playerId);
        await player.getByRole('link', { name: /1 × 1/u }).click();
        await player.getByRole('button', { name: 'Вступить' }).click();
        await expect(player.getByText('Участие обновлено.')).toBeVisible();
        expect(state.value?.participants).toHaveLength(2);

        await organizer.getByRole('link', { name: '← К поиску' }).click();
        await organizer.getByRole('link', { name: /1 × 1/u }).click();
        await organizer.getByRole('button', { name: 'Начать матч' }).click();
        await organizer.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();
        await expect(organizer.getByRole('heading', { level: 2, name: 'Внести результат' })).toBeVisible();
        await organizer.getByLabel('Серия').selectOption('BEST_OF_1');
        await organizer.getByRole('button', { name: 'Отправить на подтверждение' }).click();
        await expect(organizer.getByText(/ещё не окончательная статистика/)).toBeVisible();

        await player.getByRole('link', { name: '← К поиску' }).click();
        await player.goBack();
        await player.getByRole('button', { name: 'Подтвердить' }).click();
        await player.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();
        await expect(player.getByText('Подтверждён — статистика окончательная.')).toBeVisible();
        expect(state.value?.state).toBe('COMPLETED');
        await Promise.all([organizerContext.close(), playerContext.close()]);
    });
}
