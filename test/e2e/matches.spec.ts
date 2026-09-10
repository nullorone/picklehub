import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const matchId = '11111111-1111-4111-8111-111111111111';
const organizerId = '22222222-2222-4222-8222-222222222222';
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
