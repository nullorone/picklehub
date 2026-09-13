import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const userId = '11111111-1111-4111-8111-111111111111';
const seasonId = '22222222-2222-4222-8222-222222222222';
const levelId = '33333333-3333-4333-8333-333333333333';

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
        accessExpiresAt: '2026-09-13T12:05:00.000Z',
        accessToken: 'a'.repeat(43),
        csrfToken: 'c'.repeat(43),
        session: {
            absoluteExpiresAt: '2026-10-13T12:00:00.000Z',
            createdAt: '2026-09-13T12:00:00.000Z',
            id: '44444444-4444-4444-8444-444444444444',
            idleExpiresAt: '2026-09-20T12:00:00.000Z',
            status: 'ACTIVE',
        },
        tokenType: 'Bearer',
        user: {
            completedAt: '2026-09-13T12:00:00.000Z',
            createdAt: '2026-09-01T12:00:00.000Z',
            id: userId,
            onboardingStatus: 'COMPLETED',
            requiredConsentsSatisfied: true,
            status: 'ACTIVE',
        },
    };
}

const level = {
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    id: levelId,
    name: 'На площадке',
    ordinal: 2,
    scope: { clubId: null, kind: 'GLOBAL' },
    thresholdXp: 100,
    version: '1.0.0',
};

const progress = {
    currentLevel: level,
    lifetimeNetXp: 140,
    nextLevel: { ...level, id: '55555555-5555-4555-8555-555555555555', name: 'В игре', ordinal: 3, thresholdXp: 500 },
    projectionRevision: 4,
    scope: { clubId: null, kind: 'GLOBAL' },
    state: 'ACTIVE',
    updatedAt: '2026-09-13T10:00:00.000Z',
    xpToNextLevel: 360,
};

async function mockApi(page: Page) {
    let optedIn = false;
    let consentMutations = 0;
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/v1/auth/context') return json(route, { csrfToken: 'c'.repeat(43) });
        if (pathname === '/v1/auth/refresh') return json(route, session());
        if (pathname === '/v1/notifications/unread-count') return json(route, { count: 0, projectionRevision: 0 });
        if (pathname === '/v1/gamification/progress') return json(route, progress);
        if (pathname === '/v1/gamification/achievements') {
            return json(route, { items: [], pageInfo: { hasMore: false, nextCursor: null } });
        }
        if (pathname === '/v1/gamification/xp-history') {
            return json(route, {
                items: [
                    {
                        amount: 100,
                        compensationOfEntryId: '66666666-6666-4666-8666-666666666666',
                        createdAt: '2026-09-13T10:00:00.000Z',
                        id: '77777777-7777-4777-8777-777777777777',
                        kind: 'REVERSAL',
                        occurredAt: '2026-09-12T10:00:00.000Z',
                        ruleDefinitionId: '88888888-8888-4888-8888-888888888888',
                        ruleVersion: '1.0.0',
                        scope: { clubId: null, kind: 'GLOBAL' },
                        sourceEventId: '99999999-9999-4999-8999-999999999999',
                        sourceKind: 'CONFIRMED_PLAY',
                        status: 'POSTED',
                    },
                ],
                pageInfo: { hasMore: false, nextCursor: null },
            });
        }
        if (pathname === `/v1/gamification/seasons/${seasonId}/leaderboard-consent`) {
            consentMutations += 1;
            optedIn = true;
            return json(route, {
                changedAt: '2026-09-13T10:00:00.000Z',
                optedIn,
                policyVersion: '1.0.0',
                revision: 0,
                seasonId,
            });
        }
        if (pathname === `/v1/gamification/seasons/${seasonId}/leaderboard`) {
            return json(route, {
                items: [
                    {
                        avatarUrl: null,
                        displayName: 'Скрытый игрок',
                        levelName: 'Старт',
                        rank: 2,
                        seasonalNetXp: 80,
                        userId: null,
                        visibility: 'HIDDEN_BY_BLOCK',
                    },
                ],
                pageInfo: { hasMore: false, nextCursor: null },
                projectionRevision: 3,
                season: {
                    definitionSnapshotHash: 'a'.repeat(64),
                    endsAt: '2026-10-01T00:00:00.000Z',
                    id: seasonId,
                    name: 'Осень',
                    ruleVersion: '1.0.0',
                    scope: { clubId: null, kind: 'GLOBAL' },
                    startsAt: '2026-09-01T00:00:00.000Z',
                    state: 'ACTIVE',
                },
                viewerConsent: optedIn
                    ? {
                          changedAt: '2026-09-13T10:00:00.000Z',
                          optedIn: true,
                          policyVersion: '1.0.0',
                          revision: 0,
                          seasonId,
                      }
                    : null,
            });
        }
        return json(route, { error: { code: 'NOT_FOUND', message: 'Нет' }, requestId: crypto.randomUUID() }, 404);
    });
    return { consentMutations: () => consentMutations };
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web', width: 1280 },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA', width: 360 },
] as const) {
    test(`${client.name} verifies accessible progress, privacy consent and reduced motion`, async ({ browser }) => {
        const context = await browser.newContext({
            locale: 'ru-RU',
            reducedMotion: 'reduce',
            timezoneId: 'Europe/Moscow',
            viewport: { height: 800, width: client.width },
        });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        const api = await mockApi(page);

        await page.goto(`http://${client.host}/progress`);
        await expect(page.getByRole('heading', { level: 1, name: 'Мой прогресс' })).toBeVisible();
        await expect(page.getByRole('progressbar', { name: 'Прогресс до следующего уровня' })).toHaveAttribute(
            'value',
            '40'
        );
        await expect(page.getByText(/не меняет спортивную статистику или DUPR/u)).toBeVisible();
        await expect(page.getByText(/Начисление отменено/u)).toBeVisible();
        expect(
            await page.locator('.progress-card').evaluate((element) => getComputedStyle(element).transitionDuration)
        ).toBe('0s');

        await page.goto(`http://${client.host}/progress/seasons/${seasonId}`);
        await expect(page.getByText('○ Вы не участвуете в этом сезоне.')).toBeVisible();
        await expect(page.getByText('Скрытый игрок (блокировка)')).toBeVisible();
        await page.getByRole('button', { name: 'Дать согласие и участвовать' }).click();
        await expect(page.getByText('✓ Вы участвуете в этом сезоне.')).toBeVisible();
        expect(api.consentMutations()).toBe(1);
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
        ).toBe(true);
        await context.close();
    });
}
