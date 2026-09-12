import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const tournamentId = '11111111-1111-4111-8111-111111111111';
const roundId = '22222222-2222-4222-8222-222222222222';
const stageId = '33333333-3333-4333-8333-333333333333';
const matchId = '44444444-4444-4444-8444-444444444444';
const entrantOne = '55555555-5555-4555-8555-555555555555';
const entrantTwo = '66666666-6666-4666-8666-666666666666';
const tournament = {
    capacity: 8,
    checkInClosesAt: null,
    clubId: null,
    createdAt: '2026-09-12T10:00:00.000Z',
    currency: 'RUB',
    description: 'Открытый городской турнир',
    entrantCount: 8,
    format: {
        configuration: { courtCount: 2, formatCode: 'ROUND_ROBIN', legs: 1, schemaVersion: '1.0.0' },
        formatCode: 'ROUND_ROBIN',
        playMode: 'SINGLES',
        scoringProfile: 'ONE_GAME_11_WIN_BY_2_CAP_15',
        seedingPolicy: 'REGISTRATION_ORDER',
        strategyVersion: '1.0.0',
    },
    id: tournamentId,
    name: 'Кубок сентября',
    organizerId: '77777777-7777-4777-8777-777777777777',
    priceMinor: 150000,
    projectionChecksum: 'a'.repeat(64),
    projectionRevision: 2,
    registrationClosesAt: '2026-09-19T10:00:00.000Z',
    registrationGate: 'CLOSED',
    registrationOpensAt: '2026-09-01T10:00:00.000Z',
    startsAt: '2026-09-20T10:00:00.000Z',
    state: 'IN_PROGRESS',
    timeZone: 'Europe/Moscow',
    updatedAt: '2026-09-12T10:00:00.000Z',
    venueId: '88888888-8888-4888-8888-888888888888',
    version: 7,
};
const plan = {
    matches: [
        {
            courtAssignment: {
                batch: 1,
                courtRank: 1,
                id: '99999999-9999-4999-8999-999999999999',
                revision: 0,
                startsAt: null,
                tournamentMatchId: matchId,
            },
            id: matchId,
            outcome: 'PLAYED',
            resultRevision: 1,
            revision: 1,
            roundId,
            scores: [{ game: 1, sideOne: 11, sideTwo: 7 }],
            sequence: 1,
            slots: [
                { entrantId: entrantOne, position: 1, sourceMatchId: null, sourceOutcome: null },
                { entrantId: entrantTwo, position: 2, sourceMatchId: null, sourceOutcome: null },
            ],
            stageId,
            state: 'COMPLETED',
            tournamentId,
            winnerEntrantId: entrantOne,
        },
    ],
    projectionChecksum: 'a'.repeat(64),
    projectionRevision: 2,
    rounds: [{ generation: 1, id: roundId, revision: 1, sequence: 1, stageId, state: 'COMPLETED' }],
    stages: [{ id: stageId, kind: 'LEAGUE', sequence: 1, strategyKey: 'league', tournamentId }],
    standings: [
        {
            entrantId: entrantOne,
            gameDifferential: 1,
            matchPoints: 3,
            pointDifferential: 4,
            pointsScored: 11,
            rank: 1,
            revision: 2,
            stageId: null,
            tieBreakLot: 1,
            tournamentId,
            wins: 1,
        },
    ],
    tournamentId,
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

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web', width: 1280 },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA', width: 360 },
] as const) {
    test(`${client.name} exposes the public bracket, text alternative and standings`, async ({ browser }) => {
        const context = await browser.newContext({
            locale: 'ru-RU',
            timezoneId: 'Europe/Moscow',
            viewport: { height: 800, width: client.width },
        });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        await page.route('**/v1/**', async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === `/v1/tournaments/${tournamentId}`) return json(route, tournament);
            if (pathname === `/v1/tournaments/${tournamentId}/plan`) return json(route, plan);
            return json(route, { requestId: crypto.randomUUID(), error: { code: 'NOT_FOUND', message: 'Нет' } }, 404);
        });
        await page.goto(`http://${client.host}/tournaments/${tournamentId}`);
        await expect(page.getByRole('heading', { level: 1, name: tournament.name })).toBeVisible();
        await expect(page.getByText('Текстовая альтернатива сетки')).toBeVisible();
        await expect(page.getByRole('region', { name: 'Турнирная таблица' })).toBeVisible();
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
        ).toBe(true);
        await context.close();
    });
}
