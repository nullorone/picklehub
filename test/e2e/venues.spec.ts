import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const venueId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const accessToken = 'a'.repeat(43);

const venue = {
    accessMode: 'FREE',
    attribution: [
        {
            link: 'https://www.openstreetmap.org/copyright',
            observedAt: '2026-09-10T10:00:00.000Z',
            sourceKind: 'OPENSTREETMAP',
            text: '© OpenStreetMap contributors',
        },
    ],
    distanceMeters: 840,
    environment: 'OUTDOOR',
    id: venueId,
    lastVerifiedAt: '2026-09-10T10:00:00.000Z',
    locality: 'Москва',
    location: { latitude: 55.75, longitude: 37.61 },
    name: 'Парк Пиклбол',
    normalizedAddress: 'Москва, Спортивная улица, 1',
    publicationState: 'PUBLISHED',
    verificationState: 'MODERATOR_VERIFIED',
    version: 1,
};

function json(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
    return route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', headers, status });
}

function completedSession() {
    return {
        accessExpiresAt: '2026-09-10T12:05:00.000Z',
        accessToken,
        csrfToken: 'c'.repeat(43),
        session: {
            absoluteExpiresAt: '2026-10-10T12:00:00.000Z',
            createdAt: '2026-09-10T12:00:00.000Z',
            id: sessionId,
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

async function serveProductionBuild(page: Page, host: string, directory: string) {
    await page.route(new RegExp(`^http://${host}/(?!v1(?:/|$))`, 'u'), async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const asset =
            pathname.startsWith('/assets/') || pathname === '/runtime-config.json' ? pathname.slice(1) : 'index.html';
        await route.fulfill({ path: join(directory, asset) });
    });
}

async function mockVenueApi(page: Page) {
    const searches: URL[] = [];
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname === '/v1/auth/context') return json(route, { csrfToken: 'b'.repeat(43) });
        if (url.pathname === '/v1/auth/magic-links/consume' || url.pathname === '/v1/auth/telegram') {
            return json(route, completedSession());
        }
        if (url.pathname === '/v1/venues' && request.method() === 'GET') {
            searches.push(url);
            return json(route, {
                items: [venue],
                pageInfo: { hasMore: false, nextCursor: null },
                snapshotAt: '2026-09-10T10:00:00.000Z',
            });
        }
        if (url.pathname === '/v1/venues/geocode') {
            return json(
                route,
                {
                    error: {
                        code: 'GEOCODER_TEMPORARILY_UNAVAILABLE',
                        message: 'Provider unavailable',
                    },
                    requestId: crypto.randomUUID(),
                },
                503,
                { 'Retry-After': '30' }
            );
        }
        return json(route, { error: { code: 'NOT_FOUND', message: 'Not found' }, requestId: crypto.randomUUID() }, 404);
    });
    return searches;
}

async function openWebVenues(context: BrowserContext, page: Page) {
    await serveProductionBuild(page, 'web.picklehub.test', '/private/tmp/picklehub-e2e-web');
    const searches = await mockVenueApi(page);
    await page.goto(`/auth/email#token=${'t'.repeat(43)}&next=/venues`);
    await page.getByRole('button', { name: 'Войти в PickleHub' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Площадки' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Парк Пиклбол/u })).toBeVisible();
    await expect(page.getByRole('link', { name: '© OpenStreetMap contributors' })).toHaveAttribute(
        'href',
        'https://www.openstreetmap.org/copyright'
    );
    return { context, searches };
}

test('web keeps the catalogue usable after geolocation denial and a geocoder failure', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) => {
                    failure({ code: 1, message: 'denied' } as GeolocationPositionError);
                },
            },
        });
    });
    const page = await context.newPage();
    const { searches } = await openWebVenues(context, page);

    await page.getByRole('button', { name: 'Рядом со мной' }).click();
    await expect(page.getByRole('status')).toContainText('Доступ к геолокации не дан');
    await page.getByLabel('Название или адрес').fill('парк');
    await page.getByRole('button', { name: 'Найти' }).click();
    await expect.poll(() => searches.some((url) => url.searchParams.get('query') === 'парк')).toBe(true);
    await expect(page.getByRole('button', { name: /Парк Пиклбол/u })).toBeVisible();

    await page.getByRole('button', { name: 'Новая площадка' }).click();
    await page.getByLabel('Публичный адрес').fill('Спортивная улица');
    await page.getByRole('button', { name: 'Найти' }).click();
    await expect(page.getByRole('status')).toContainText('Поиск адреса временно недоступен. Каталог работает.');
    await page.getByRole('button', { name: '← К каталогу' }).click();
    await expect(page.getByRole('button', { name: /Парк Пиклбол/u })).toBeVisible();
    await context.close();
});

test('web retains the loaded read-only catalogue and blocks mutations offline', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
    const page = await context.newPage();
    await openWebVenues(context, page);

    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Найти' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Парк Пиклбол/u })).toBeVisible();
    await page.getByRole('button', { name: 'Новая площадка' }).click();
    await expect(page.getByRole('button', { name: 'Добавить только в матч' })).toBeDisabled();
    await context.close();
});

test('TMA renders the same venue projection and attribution as web', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
    const page = await context.newPage();
    await serveProductionBuild(page, 'tg.picklehub.test', '/private/tmp/picklehub-e2e-tg');
    await mockVenueApi(page);
    const initData = `query_id=test&auth_date=1788937200&user=${encodeURIComponent('{"id":123456}')}&hash=${'f'.repeat(64)}`;
    const launch = new URLSearchParams({
        tgWebAppData: initData,
        tgWebAppPlatform: 'tdesktop',
        tgWebAppThemeParams: JSON.stringify({ bg_color: '#070b14', text_color: '#f8fafc' }),
        tgWebAppVersion: '7.0',
    });

    await page.goto(`http://tg.picklehub.test/venues#${launch.toString()}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Площадки' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Парк Пиклбол/u })).toBeVisible();
    await expect(page.getByRole('link', { name: '© OpenStreetMap contributors' })).toHaveAttribute(
        'href',
        'https://www.openstreetmap.org/copyright'
    );
    await context.close();
});
