import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const articleId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const tagId = '44444444-4444-4444-8444-444444444444';

const article = {
    attribution: [
        {
            canonicalUrl: 'https://source.example.test/story',
            licenseNotice: 'Разрешено для синтетической проверки',
            originalAuthor: 'Тестовый автор',
            originallyPublishedAt: '2026-09-10T10:00:00.000Z',
            originalPublisher: 'Тестовое издание',
            originalTitle: 'Исходный синтетический материал',
            sourceAvailable: true,
            sourceDisplayName: 'Синтетический источник',
            sourceId,
            transformationKind: 'RESEARCH_SUMMARY',
        },
    ],
    body: {
        blocks: [
            {
                inlines: [
                    { marks: ['STRONG'], text: '<img src=x onerror=alert(1)>' },
                    { href: 'https://rules.example.test', text: ' Правила' },
                ],
                kind: 'PARAGRAPH',
            },
        ],
        format: 'SAFE_RICH_TEXT_V1',
    },
    category: { id: categoryId, locale: 'ru-RU', name: 'Обучение', slug: 'learning' },
    correctionNote: null,
    coverMedia: null,
    id: articleId,
    languageAlternatives: [],
    locale: 'ru-RU',
    originKind: 'DERIVED',
    publishedAt: '2026-09-12T10:00:00.000Z',
    seo: {
        canonicalUrl: 'https://picklehub.example.test/news/ru-RU/basics',
        description: 'Синтетическое описание материала',
        indexable: true,
        openGraphImageUrl: null,
        title: 'Основы пиклбола · PickleHub',
    },
    slug: 'basics',
    subtitle: 'Коротко о главном',
    summary: 'Проверенное введение в игру.',
    tags: [{ id: tagId, locale: 'ru-RU', name: 'Правила', slug: 'rules' }],
    title: 'Основы пиклбола',
    updatedAt: '2026-09-12T11:00:00.000Z',
    version: 1,
};

const feed = {
    items: [article],
    pageInfo: { hasMore: false, nextCursor: null },
    snapshotAt: '2026-09-12T12:00:00.000Z',
};

const session = {
    accessExpiresAt: '2026-09-15T12:05:00.000Z',
    accessToken: 'a'.repeat(43),
    csrfToken: 'c'.repeat(43),
    session: {
        absoluteExpiresAt: '2026-10-15T12:00:00.000Z',
        createdAt: '2026-09-15T12:00:00.000Z',
        id: '55555555-5555-4555-8555-555555555555',
        idleExpiresAt: '2026-09-22T12:00:00.000Z',
        status: 'ACTIVE',
    },
    tokenType: 'Bearer',
    user: {
        completedAt: '2026-09-15T12:00:00.000Z',
        createdAt: '2026-09-01T12:00:00.000Z',
        id: '66666666-6666-4666-8666-666666666666',
        onboardingStatus: 'COMPLETED',
        requiredConsentsSatisfied: true,
        status: 'ACTIVE',
    },
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

async function mockContentApi(page: Page) {
    let searchBody: unknown;
    let bookmarkWrites = 0;
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/v1/auth/context') return json(route, { csrfToken: 'c'.repeat(43) });
        if (pathname === '/v1/auth/refresh') return json(route, session);
        if (pathname === '/v1/notifications/unread-count') return json(route, { count: 0, projectionRevision: 0 });
        if (pathname === '/v1/content/articles') return json(route, feed);
        if (pathname === '/v1/content/articles/ru-RU/basics') return json(route, article);
        if (pathname === '/v1/content/search') {
            searchBody = request.postDataJSON();
            return json(route, feed);
        }
        if (pathname === '/v1/content/bookmarks' && request.method() === 'GET') {
            return json(route, { items: [], pageInfo: { hasMore: false, nextCursor: null } });
        }
        if (pathname === `/v1/content/bookmarks/${articleId}` && request.method() === 'PUT') {
            bookmarkWrites += 1;
            expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/u);
            return json(route, { articleId, bookmarkedAt: '2026-09-15T10:00:00.000Z' });
        }
        return json(route, { error: { code: 'NOT_FOUND', message: 'Нет' }, requestId: crypto.randomUUID() }, 404);
    });
    return { bookmarkWrites: () => bookmarkWrites, searchBody: () => searchBody };
}

async function prepareSharing(context: BrowserContext) {
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: (data: ShareData) => {
                (window as Window & { __sharedUrl?: string }).__sharedUrl = data.url;
                return Promise.resolve();
            },
        });
    });
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web', width: 1280 },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA', width: 360 },
] as const) {
    test(`${client.name} verifies feed, search, attribution, sharing, XSS and offline state`, async ({ browser }) => {
        const context = await browser.newContext({
            locale: 'ru-RU',
            timezoneId: 'Europe/Moscow',
            viewport: { height: 800, width: client.width },
        });
        await prepareSharing(context);
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        const api = await mockContentApi(page);

        await page.goto(`http://${client.host}/news`);
        await expect(page.getByRole('heading', { level: 1, name: 'Новости и знания' })).toBeVisible();
        await page.getByRole('searchbox', { name: /Поиск/u }).fill('правила подачи');
        await page.getByRole('button', { name: 'Найти' }).click();
        await expect.poll(api.searchBody).toMatchObject({ locale: 'ru-RU', query: 'правила подачи' });
        await page.getByRole('link', { name: article.title }).click();
        await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Источники и атрибуция' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Внешний источник' })).toHaveAttribute(
            'href',
            article.attribution[0].canonicalUrl
        );
        await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
        expect(await page.locator('.article-body img').count()).toBe(0);
        await page.getByRole('button', { name: 'Отправить ссылку' }).click();
        await expect
            .poll(() => page.evaluate(() => (window as Window & { __sharedUrl?: string }).__sharedUrl))
            .toBe(article.seo.canonicalUrl);

        if (client.name === 'web') {
            await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', article.seo.canonicalUrl);
            await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
            await expect(page.locator('script[data-picklehub-content="article"]')).toContainText('schema.org');
        }

        await page.getByRole('link', { name: '← К ленте' }).click();
        await context.setOffline(true);
        await page.getByRole('link', { name: article.title }).click();
        await expect(page.getByText(/сохранённая версия/u)).toBeVisible();
        await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
        ).toBe(true);
        await context.close();
    });

    test(`${client.name} keeps bookmark writes authenticated, explicit and online-only`, async ({ browser }) => {
        const context = await browser.newContext({
            locale: 'ru-RU',
            timezoneId: 'Europe/Moscow',
            viewport: { height: 800, width: client.width },
        });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        const api = await mockContentApi(page);

        await page.goto(`http://${client.host}/login`);
        await expect(page.getByRole('heading', { level: 1, name: 'Пора найти игру' })).toBeVisible();
        await page.getByRole('link', { name: 'Новости' }).click();
        await page.getByRole('link', { name: article.title }).click();
        await page.getByRole('button', { name: 'Сохранить в закладки' }).click();
        await expect.poll(api.bookmarkWrites).toBe(1);
        await expect(page.getByRole('status')).toContainText(/сохран/u);

        await context.setOffline(true);
        await expect(page.getByRole('button', { name: 'Удалить из закладок' })).toBeDisabled();
        expect(api.bookmarkWrites()).toBe(1);
        await context.close();
    });
}
