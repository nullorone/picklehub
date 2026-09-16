import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const ids = {
    receipt: '11111111-1111-4111-8111-111111111111',
    season: '22222222-2222-4222-8222-222222222222',
    session: '33333333-3333-4333-8333-333333333333',
    task: '44444444-4444-4444-8444-444444444444',
    user: '55555555-5555-4555-8555-555555555555',
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
    await page.route('https://assets.example.test/game-ad.webp', (route) =>
        route.fulfill({
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><rect width="100%" height="100%" fill="green"/></svg>',
            contentType: 'image/svg+xml',
        })
    );
}

function authenticatedSession() {
    return {
        accessExpiresAt: '2027-01-01T12:05:00.000Z',
        accessToken: 'a'.repeat(43),
        csrfToken: 'c'.repeat(43),
        session: {
            absoluteExpiresAt: '2027-02-01T12:00:00.000Z',
            createdAt: '2026-09-16T12:00:00.000Z',
            id: '66666666-6666-4666-8666-666666666666',
            idleExpiresAt: '2027-01-08T12:00:00.000Z',
            status: 'ACTIVE',
        },
        tokenType: 'Bearer',
        user: {
            completedAt: '2026-09-16T12:00:00.000Z',
            createdAt: '2026-09-01T12:00:00.000Z',
            id: ids.user,
            onboardingStatus: 'COMPLETED',
            requiredConsentsSatisfied: true,
            status: 'ACTIVE',
        },
    };
}

const progress = {
    cosmetics: [],
    distinctCompletionDays: 0,
    goals: [{ code: 'DAILY_WARM_UP', current: 0, practiceMarksGranted: 0, state: 'INCOMPLETE', target: 1 }],
    practiceMarks: 0,
    season: {
        endsAt: '2026-12-09T00:00:00.000Z',
        id: ids.season,
        startsAt: '2026-09-16T00:00:00.000Z',
        state: 'ACTIVE',
        version: '1.0.0',
    },
};

const advertisement = {
    campaignId: '77777777-7777-4777-8777-777777777777',
    campaignRevisionId: '88888888-8888-4888-8888-888888888888',
    clickToken: 'k'.repeat(43),
    creative: {
        altText: 'Синтетический баннер мини-игры',
        assetUrl: 'https://assets.example.test/game-ad.webp',
        body: null,
        byteLength: 15,
        format: 'STATIC_IMAGE',
        headline: null,
        mediaType: 'image/webp',
    },
    creativeId: '99999999-9999-4999-8999-999999999999',
    deliveryToken: 'd'.repeat(43),
    expiresAt: '2026-09-16T12:15:00.000Z',
    legal: {
        advertiserName: 'Синтетический рекламодатель',
        disclosure: 'Только автоматизированная проверка',
        label: 'Реклама',
        registrationToken: 'TEST-ERID',
    },
    placementId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    refreshAfterSeconds: 300,
    source: 'DIRECT',
};

async function mockApi(page: Page) {
    const sessions: unknown[] = [];
    const results: unknown[] = [];
    const claims: unknown[] = [];
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/v1/auth/context') return json(route, { csrfToken: 'c'.repeat(43) });
        if (pathname === '/v1/auth/refresh') return json(route, authenticatedSession());
        if (pathname === '/v1/notifications/unread-count') return json(route, { count: 0, projectionRevision: 0 });
        if (pathname === '/v1/advertising/decisions') return json(route, advertisement);
        if (pathname === '/v1/mini-game/progress') return json(route, progress);
        if (pathname === '/v1/mini-game/sessions') {
            sessions.push(request.postDataJSON());
            expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/u);
            return json(route, {
                challengeProof: `mgc1_${'p'.repeat(43)}`,
                configuration: {
                    activeDurationMilliseconds: null,
                    directions: ['LEFT', 'CENTER', 'RIGHT'],
                    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    mode: 'CALM',
                    pauseResumeTtlSeconds: 600,
                    publishedAt: '2026-09-16T00:00:00.000Z',
                    scoreFormula: {
                        streakBonusPoints: 10,
                        streakLength: 5,
                        successfulReturnPoints: 10,
                        targetDirectionPoints: 5,
                    },
                    turnCount: 20,
                    version: '1.0.0',
                },
                expiresAt: '2026-09-16T12:15:00.000Z',
                id: ids.session,
                issuedAt: '2026-09-16T12:00:00.000Z',
                resultSubmissionLimit: 1,
                state: 'ISSUED',
                task: {
                    configurationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    configurationVersion: '1.0.0',
                    dailyWindowEndsAt: '2026-09-17T00:00:00.000Z',
                    dailyWindowStartedAt: '2026-09-16T00:00:00.000Z',
                    id: ids.task,
                    mode: 'CALM',
                    seasonId: ids.season,
                },
            });
        }
        if (pathname === `/v1/mini-game/sessions/${ids.session}/results`) {
            results.push(request.postDataJSON());
            return json(route, {
                acceptedAt: '2026-09-16T12:01:00.000Z',
                configurationVersion: '1.0.0',
                id: ids.receipt,
                mode: 'CALM',
                outcome: 'ACCEPTED',
                reason: 'NONE',
                resultProof: `mgr1_${'r'.repeat(43)}`,
                rewardClaimExpiresAt: '2026-09-17T12:01:00.000Z',
                sessionId: ids.session,
                taskId: ids.task,
            });
        }
        if (pathname === `/v1/mini-game/receipts/${ids.receipt}/reward-claim`) {
            claims.push(request.postDataJSON());
            return json(route, {
                claimedAt: '2026-09-16T12:01:01.000Z',
                cosmeticUnlocks: [],
                grants: [],
                progress,
                receiptId: ids.receipt,
            });
        }
        return json(route, { error: { code: 'NOT_FOUND', message: 'Нет' }, requestId: crypto.randomUUID() }, 404);
    });
    return { claims, results, sessions };
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web', width: 1280 },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA', width: 360 },
] as const) {
    test(`${client.name} runs the shared calm game without ad interruption or sensitive result fields`, async ({
        browser,
    }) => {
        const context = await browser.newContext({
            locale: 'ru-RU',
            reducedMotion: 'reduce',
            timezoneId: 'Asia/Vladivostok',
            viewport: { height: 720, width: client.width },
        });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        const api = await mockApi(page);

        await page.goto(`http://${client.host}/mini-game`);
        await expect(page.getByRole('heading', { level: 1, name: 'Ралли на точность' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Спокойный/u })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByLabel('Рекламное объявление')).toBeVisible();
        await page.getByRole('button', { name: 'Обучение и старт' }).click();
        await expect(page.getByLabel('Рекламное объявление')).toHaveCount(0);
        for (let serve = 0; serve < 3; serve += 1) await page.getByRole('button', { name: 'Удар' }).click();
        await expect(page.getByText('Ходы: 0/20')).toBeVisible();

        await page.getByRole('button', { name: 'Пауза' }).click();
        await expect(page.getByRole('dialog', { name: 'Пауза' })).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Ходы: 0/20')).toBeVisible();
        await page.getByRole('button', { name: 'Продолжить' }).click();
        for (let turn = 0; turn < 20; turn += 1) await page.getByRole('button', { name: 'Удар' }).click();

        await expect(page.getByRole('heading', { name: 'Ралли завершено' })).toBeVisible();
        expect(api.sessions).toEqual([{ configurationVersion: '1.0.0', mode: 'CALM' }]);
        expect(api.claims).toEqual([{ resultProof: `mgr1_${'r'.repeat(43)}` }]);
        expect(api.results).toHaveLength(1);
        const resultText = JSON.stringify(api.results[0]);
        expect(resultText).not.toMatch(/score|trajectory|coordinate|device|rating|dupr/iu);
        expect(api.results[0]).toMatchObject({
            activeDurationMilliseconds: expect.any(Number),
            configurationVersion: '1.0.0',
            mode: 'CALM',
            pausedDurationMilliseconds: expect.any(Number),
        });
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
        ).toBe(true);
        await context.close();
    });
}
