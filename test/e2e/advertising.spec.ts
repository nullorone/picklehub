import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const ids = {
    campaign: '11111111-1111-4111-8111-111111111111',
    revision: '22222222-2222-4222-8222-222222222222',
    creative: '33333333-3333-4333-8333-333333333333',
    placement: '44444444-4444-4444-8444-444444444444',
};

const creative = {
    source: 'DIRECT',
    deliveryToken: 'd'.repeat(43),
    clickToken: 'c'.repeat(43),
    campaignId: ids.campaign,
    campaignRevisionId: ids.revision,
    creativeId: ids.creative,
    placementId: ids.placement,
    expiresAt: '2026-09-15T12:15:00.000Z',
    refreshAfterSeconds: 300,
    legal: {
        label: 'Реклама',
        advertiserName: 'Синтетический рекламодатель',
        registrationToken: 'TEST-ERID',
        disclosure: 'Только автоматизированная проверка',
    },
    creative: {
        format: 'STATIC_IMAGE',
        assetUrl: 'https://assets.example.test/verified-ad.webp',
        mediaType: 'image/webp',
        byteLength: 256,
        altText: 'Синтетический баннер для проверки',
        headline: null,
        body: null,
    },
};

const emptyFeed = {
    items: [],
    pageInfo: { hasMore: false, nextCursor: null },
    snapshotAt: '2026-09-15T12:00:00.000Z',
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
    await page.route('https://assets.example.test/verified-ad.webp', (route) =>
        route.fulfill({
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><rect width="100%" height="100%" fill="green"/></svg>',
            contentType: 'image/svg+xml',
        })
    );
}

async function mockPublicApi(page: Page, decision: object = creative) {
    const decisions: unknown[] = [];
    const impressions: unknown[] = [];
    const clicks: unknown[] = [];
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/v1/auth/context') return json(route, { csrfToken: 'c'.repeat(43) });
        if (pathname === '/v1/auth/refresh') {
            return json(route, { error: { code: 'UNAUTHORIZED', message: 'Нет сессии' } }, 401);
        }
        if (pathname === '/v1/notifications/unread-count') return json(route, { count: 0, projectionRevision: 0 });
        if (pathname === '/v1/content/articles') return json(route, emptyFeed);
        if (pathname === '/v1/content/search') return json(route, emptyFeed);
        if (pathname === '/v1/advertising/decisions') {
            decisions.push(request.postDataJSON());
            expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/u);
            return json(route, decision);
        }
        if (pathname === '/v1/advertising/impressions') {
            impressions.push(request.postDataJSON());
            return json(route, {
                accepted: true,
                duplicate: false,
                receiptId: crypto.randomUUID(),
                event: 'VIEWABLE_IMPRESSION',
                recordedAt: '2026-09-15T12:01:00.000Z',
                invalidReason: null,
            });
        }
        if (pathname === '/v1/advertising/clicks') {
            clicks.push(request.postDataJSON());
            return json(route, {
                accepted: true,
                duplicate: false,
                receiptId: crypto.randomUUID(),
                event: 'VALID_CLICK',
                recordedAt: '2026-09-15T12:02:00.000Z',
                invalidReason: null,
                redirectUrl: 'https://ads.example.test/landing',
            });
        }
        return json(route, { error: { code: 'NOT_FOUND', message: 'Нет' }, requestId: crypto.randomUUID() }, 404);
    });
    return { clicks, decisions, impressions };
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web', width: 1280 },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA', width: 360 },
] as const) {
    test(`${client.name} keeps the slot accessible, viewable once and absent during a form action`, async ({
        browser,
    }) => {
        const context = await browser.newContext({
            locale: 'ru-RU',
            reducedMotion: 'reduce',
            timezoneId: 'Europe/Moscow',
            viewport: { height: 800, width: client.width },
        });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        const api = await mockPublicApi(page);

        await page.goto(`http://${client.host}/news`);
        await expect(page.getByRole('heading', { level: 1, name: 'Новости и знания' })).toBeVisible();
        const advertisement = page.getByLabel('Рекламное объявление');
        await expect(advertisement).toBeVisible();
        await expect(page.getByRole('link', { name: /Реклама от Синтетический рекламодатель/u })).toBeVisible();
        await advertisement.scrollIntoViewIfNeeded();
        await expect.poll(() => api.impressions.length, { timeout: 3000 }).toBe(1);
        await page.waitForTimeout(1100);
        expect(api.impressions).toHaveLength(1);
        expect(api.impressions[0]).toEqual({
            continuousForegroundMilliseconds: 1000,
            deliveryToken: creative.deliveryToken,
            visiblePercent: 100,
        });

        const decisionText = JSON.stringify(api.decisions[0]);
        expect(decisionText).not.toMatch(/latitude|longitude|coordinate|query|url|user|device|advertisingId/iu);
        expect(api.decisions[0]).toMatchObject({
            context: {
                clientKind: client.name === 'web' ? 'WEB' : 'TMA',
                providerConsent: false,
                surface: 'NEWS',
            },
        });

        const search = page.getByRole('searchbox', { name: /Поиск/u });
        await search.focus();
        await expect(search).toBeFocused();
        await expect(advertisement).toHaveCount(0);
        await search.fill('правила подачи');
        await page.getByRole('button', { name: 'Найти' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Новости и знания' })).toBeVisible();
        await context.close();
    });

    test(`${client.name} uses a trusted server receipt for navigation and no-fill never hides content`, async ({
        browser,
    }) => {
        const context = await browser.newContext({ locale: 'ru-RU', viewport: { height: 800, width: client.width } });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        const api = await mockPublicApi(page);
        await page.route('https://ads.example.test/landing', (route) =>
            route.fulfill({ body: '<h1>Approved destination</h1>', contentType: 'text/html' })
        );

        await page.goto(`http://${client.host}/news`);
        await page.getByRole('link', { name: /Реклама от Синтетический рекламодатель/u }).click();
        await expect(page).toHaveURL('https://ads.example.test/landing');
        expect(api.clicks).toEqual([{ clickToken: creative.clickToken, trustedActivation: true }]);

        const noFillPage = await context.newPage();
        await serveProductionBuild(noFillPage, client.host, client.directory);
        const noFillApi = await mockPublicApi(noFillPage, {
            source: 'NO_FILL',
            reason: 'PROVIDER_DISABLED',
            retryAfterSeconds: null,
        });
        await noFillPage.goto(`http://${client.host}/news`);
        await expect(noFillPage.getByRole('heading', { level: 1, name: 'Новости и знания' })).toBeVisible();
        await expect(noFillPage.getByLabel('Рекламное объявление')).toHaveCount(0);
        expect(noFillApi.decisions).toHaveLength(1);
        await context.close();
    });
}

test('authentication does not request an advertising decision', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ru-RU' });
    const page = await context.newPage();
    await serveProductionBuild(page, 'web.picklehub.test', '/private/tmp/picklehub-e2e-web');
    const api = await mockPublicApi(page);
    await page.goto('http://web.picklehub.test/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Пора найти игру' })).toBeVisible();
    expect(api.decisions).toHaveLength(0);
    await context.close();
});
