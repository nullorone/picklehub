import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const clubId = '11111111-1111-4111-8111-111111111111';
const invitationToken = 'a'.repeat(43);
const club = {
    createdAt: '2026-09-12T10:00:00.000Z',
    description: 'Открытые игры по выходным',
    id: clubId,
    locality: 'Москва',
    memberCount: 12,
    membershipPolicy: 'OPEN',
    name: 'Пикл на районе',
    state: 'ACTIVE',
    updatedAt: '2026-09-12T10:00:00.000Z',
    venues: [],
    version: 4,
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

async function mockClubs(page: Page) {
    await page.route('**/v1/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/v1/clubs')
            return json(route, {
                items: [
                    {
                        id: clubId,
                        locality: club.locality,
                        memberCount: club.memberCount,
                        membershipPolicy: club.membershipPolicy,
                        name: club.name,
                        state: 'ACTIVE',
                        venueIds: [],
                    },
                ],
                pageInfo: { hasMore: false, nextCursor: null },
                snapshotAt: '2026-09-12T10:00:00.000Z',
            });
        if (pathname === `/v1/clubs/${clubId}`) return json(route, club);
        if (pathname === `/v1/clubs/${clubId}/venues`) return json(route, { items: [] });
        return json(
            route,
            { requestId: crypto.randomUUID(), error: { code: 'NOT_FOUND', message: 'Не найдено' } },
            404
        );
    });
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web' },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA' },
] as const) {
    test(`${client.name} keeps public club deep links and zero-venue state`, async ({ browser }) => {
        const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        await mockClubs(page);
        await page.goto(`http://${client.host}/clubs/${clubId}`);
        await expect(page.getByRole('heading', { level: 1, name: club.name })).toBeVisible();
        await expect(page.getByText(/Клуб может работать без них/u)).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/clubs/${clubId}$`, 'u'));
        await context.close();
    });

    test(`${client.name} preserves a protected invitation deep link through sign-in`, async ({ browser }) => {
        const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        await page.goto(`http://${client.host}/club-invitations/${invitationToken}`);
        await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fclub-invitations%2F${invitationToken}$`, 'u'));
        await expect(page.locator('body')).not.toContainText(invitationToken);
        await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
        await context.close();
    });
}
