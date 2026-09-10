import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const localityId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sessionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const accessToken = 'a'.repeat(43);

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

function session() {
    return {
        accessExpiresAt: '2026-09-09T12:05:00.000Z',
        accessToken,
        csrfToken: 'c'.repeat(43),
        session: {
            absoluteExpiresAt: '2026-10-09T12:00:00.000Z',
            createdAt: '2026-09-09T12:00:00.000Z',
            id: sessionId,
            idleExpiresAt: '2026-09-16T12:00:00.000Z',
            status: 'ACTIVE',
        },
        tokenType: 'Bearer',
        user: {
            completedAt: null,
            createdAt: '2026-09-09T12:00:00.000Z',
            id: userId,
            onboardingStatus: 'DRAFT',
            requiredConsentsSatisfied: false,
            status: 'ACTIVE',
        },
    };
}

function onboarding(timeZone: string | null, version = 1) {
    return {
        consents: [],
        draft: {
            completedAt: null,
            displayName: 'Игрок из сохранённого черновика',
            duprProfileUrl: null,
            gameFormats: ['SINGLES'],
            localityId,
            skillSelfAssessment: 2.5,
            status: 'DRAFT',
            timeZone,
            updatedAt: '2026-09-09T12:00:00.000Z',
            userId,
            version,
        },
        requiredConsentsSatisfied: false,
    };
}

const documents = {
    items: [
        {
            checksum: 'd'.repeat(64),
            effectiveAt: '2026-09-01T00:00:00.000Z',
            purpose: 'TERMS',
            required: true,
            text: 'Условия тестового контура',
            title: 'Условия использования',
            version: 'v1',
        },
        {
            checksum: 'e'.repeat(64),
            effectiveAt: '2026-09-01T00:00:00.000Z',
            purpose: 'PERSONAL_DATA',
            required: true,
            text: 'Согласие тестового контура',
            title: 'Персональные данные',
            version: 'v1',
        },
    ],
};

async function mockIdentityApi(page: Page, deviceTimeZone: string) {
    let saved = onboarding(null);
    const calls: { telegramInitData?: string } = {};
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/v1/auth/context') return json(route, { csrfToken: 'b'.repeat(43) });
        if (path === '/v1/auth/magic-links/consume') return json(route, session());
        if (path === '/v1/auth/refresh') return json(route, session());
        if (path === '/v1/auth/telegram') {
            calls.telegramInitData = (request.postDataJSON() as { initData: string }).initData;
            return json(route, session());
        }
        if (path === '/v1/me/onboarding' && request.method() === 'GET') return json(route, saved);
        if (path === '/v1/me/onboarding' && request.method() === 'PATCH') {
            const body = request.postDataJSON() as { timeZone: string };
            saved = onboarding(body.timeZone, saved.draft.version + 1);
            return json(route, saved);
        }
        if (path === '/v1/identity/documents') return json(route, documents);
        if (path === '/v1/identity/onboarding-options') {
            return json(route, {
                catalogueVersion: 1,
                duprAllowedPatterns: [],
                duprLinksEnabled: false,
                supportedTimeZones: ['Europe/Moscow', 'Asia/Yekaterinburg'],
            });
        }
        if (path === '/v1/identity/onboarding-options/localities') {
            return json(route, {
                items: [{ countryCode: 'RU', id: localityId, name: 'Москва', region: 'Москва' }],
                pageInfo: { hasMore: false, nextCursor: null },
            });
        }
        return json(route, { error: { code: 'NOT_FOUND', message: 'Not found' }, requestId: crypto.randomUUID() }, 404);
    });
    return {
        calls,
        expectedTimeZone: deviceTimeZone,
        saved: () => saved,
    };
}

async function expectAccessibleForm(page: Page) {
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByLabel('Отображаемое имя')).toBeVisible();
    await expect(page.getByLabel('Часовой пояс')).toBeVisible();
    await expect(page.getByRole('button', { name: /Сохранить/u })).toBeEnabled();
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
}

for (const timeZone of ['Europe/Moscow', 'Asia/Yekaterinburg']) {
    test(`web confirms a magic link and resumes onboarding in ${timeZone}`, async ({ browser }) => {
        const context = await browser.newContext({ locale: 'ru-RU', timezoneId: timeZone });
        const page = await context.newPage();
        await serveProductionBuild(page, 'web.picklehub.test', '/private/tmp/picklehub-e2e-web');
        const api = await mockIdentityApi(page, timeZone);
        const token = 't'.repeat(43);

        await page.goto(`/auth/email#token=${token}&next=/onboarding`);
        await expect(page).toHaveURL(/\/auth\/email$/u);
        await expect(page.getByRole('heading', { name: 'Подтвердите вход' })).toBeVisible();
        expect(await page.locator('html').evaluate(() => location.hash)).toBe('');
        await page.getByRole('button', { name: 'Войти в PickleHub' }).click();

        await expect(page.getByRole('heading', { name: 'Расскажите, как вы играете' })).toBeVisible();
        await expectAccessibleForm(page);
        await expect(page.getByLabel('Часовой пояс')).toHaveValue(api.expectedTimeZone);
        await page.getByRole('button', { name: 'Сохранить черновик' }).click();
        await expect(page.getByRole('alert')).toContainText('Черновик сохранён');
        expect(api.saved().draft.timeZone).toBe(timeZone);

        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Расскажите, как вы играете' })).toBeVisible();
        await expect(page.getByLabel('Отображаемое имя')).toHaveValue('Игрок из сохранённого черновика');
        await expect(page.getByLabel('Часовой пояс')).toHaveValue(timeZone);
        await context.close();
    });
}

test('TMA mock exchanges raw init data and opens the resumable draft', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
    const page = await context.newPage();
    await serveProductionBuild(page, 'tg.picklehub.test', '/private/tmp/picklehub-e2e-tg');
    const api = await mockIdentityApi(page, 'Europe/Moscow');
    const initData = `query_id=test&auth_date=1788937200&user=${encodeURIComponent('{"id":123456}')}&hash=${'f'.repeat(64)}`;
    const launch = new URLSearchParams({
        tgWebAppData: initData,
        tgWebAppPlatform: 'tdesktop',
        tgWebAppThemeParams: JSON.stringify({ bg_color: '#070b14', text_color: '#f8fafc' }),
        tgWebAppVersion: '7.0',
    });

    await page.goto(`http://tg.picklehub.test/#${launch.toString()}`);
    await expect(page.getByRole('heading', { name: 'Ваш профиль игрока' })).toBeVisible();
    await expect(page.getByLabel('Отображаемое имя')).toHaveValue('Игрок из сохранённого черновика');
    expect(api.calls.telegramInitData).toBe(initData);
    await expectAccessibleForm(page);
    await context.close();
});
