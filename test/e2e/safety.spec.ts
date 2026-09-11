import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const userId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const receiptId = '44444444-4444-4444-8444-444444444444';
const localityId = '55555555-5555-4555-8555-555555555555';

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
        accessExpiresAt: '2026-09-11T12:05:00.000Z',
        accessToken: 'a'.repeat(43),
        csrfToken: 'c'.repeat(43),
        session: {
            absoluteExpiresAt: '2026-10-11T12:00:00.000Z',
            createdAt: '2026-09-11T12:00:00.000Z',
            id: '66666666-6666-4666-8666-666666666666',
            idleExpiresAt: '2026-09-18T12:00:00.000Z',
            status: 'ACTIVE',
        },
        tokenType: 'Bearer',
        user: {
            completedAt: '2026-09-11T11:00:00.000Z',
            createdAt: '2026-09-10T12:00:00.000Z',
            id: userId,
            onboardingStatus: 'COMPLETED',
            requiredConsentsSatisfied: true,
            status: 'ACTIVE',
        },
    };
}

function receipt(kind: 'NO_SHOW' | 'SAFETY') {
    return {
        appealDeadline: null,
        canAppeal: false,
        canRespond: false,
        canWithdraw: true,
        createdAt: '2026-09-11T12:00:00.000Z',
        kind,
        outcome: null,
        outcomeReason: null,
        receiptId,
        status: 'RECEIVED',
        updatedAt: '2026-09-11T12:00:00.000Z',
    };
}

function publicProfile() {
    const totals = (['ALL', 'SINGLES', 'DOUBLES'] as const).map((slice) => ({
        decided: 0,
        gamesPlayed: 0,
        lastConfirmedAt: null,
        losses: 0,
        played: 0,
        pointsAgainst: 0,
        pointsDifference: 0,
        pointsFor: 0,
        slice,
        winRateDenominator: 0,
        winRateNumerator: 0,
        wins: 0,
    }));
    const statistics = {
        attendance: { percentage: null, sampleSize: null },
        attendanceAvailable: false,
        calculatedAt: '2026-09-11T12:00:00.000Z',
        reliability: { percentage: null, sampleSize: null },
        state: 'CURRENT',
        totals,
    };
    return {
        avatarUrl: null,
        displayName: 'Игрок для проверки',
        externalProfileLink: null,
        gameFormats: ['SINGLES'],
        locality: { countryCode: 'RU', id: localityId, name: 'Москва', region: 'Москва' },
        playerId: subjectId,
        skillSelfAssessment: 3,
        statistics,
        updatedAt: '2026-09-11T12:00:00.000Z',
    };
}

interface SafetyApiState {
    blocked: boolean;
    requests: { body: unknown; idempotencyKey: string | null; path: string }[];
}

async function mockSafetyApi(page: Page, state: SafetyApiState) {
    const profile = publicProfile();
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        if (url.pathname === '/v1/auth/context') return json(route, { csrfToken: 'c'.repeat(43) });
        if (
            url.pathname === '/v1/auth/magic-links/consume' ||
            url.pathname === '/v1/auth/refresh' ||
            url.pathname === '/v1/auth/telegram'
        )
            return json(route, session());
        if (url.pathname === '/v1/safety-reports' && method === 'POST') {
            state.requests.push({
                body: request.postDataJSON(),
                idempotencyKey: request.headers()['idempotency-key'] ?? null,
                path: url.pathname,
            });
            return json(route, receipt('SAFETY'), 201);
        }
        if (url.pathname === `/v1/matches/${sourceId}/no-show-reports` && method === 'POST') {
            state.requests.push({
                body: request.postDataJSON(),
                idempotencyKey: request.headers()['idempotency-key'] ?? null,
                path: url.pathname,
            });
            return json(route, receipt('NO_SHOW'), 201);
        }
        if (url.pathname === `/v1/players/${subjectId}`) return json(route, profile);
        if (url.pathname === `/v1/players/${subjectId}/statistics`) return json(route, profile.statistics);
        if (url.pathname === `/v1/players/${subjectId}/match-history`) {
            return json(route, {
                items: [],
                pageInfo: { hasMore: false, nextCursor: null },
                snapshotAt: '2026-09-11T12:00:00.000Z',
            });
        }
        if (url.pathname === '/v1/me/blocks') {
            return json(route, {
                items: state.blocked ? [{ blockedUserId: subjectId, createdAt: '2026-09-11T12:00:00.000Z' }] : [],
                pageInfo: { hasMore: false, nextCursor: null },
                snapshotAt: '2026-09-11T12:00:00.000Z',
            });
        }
        if (url.pathname === `/v1/communication-blocks/${subjectId}` && method === 'PUT') {
            state.blocked = true;
            return json(route, { blockedUserId: subjectId, createdAt: '2026-09-11T12:00:00.000Z' });
        }
        if (url.pathname === `/v1/communication-blocks/${subjectId}` && method === 'DELETE') {
            state.blocked = false;
            return route.fulfill({ status: 204 });
        }
        return json(route, { error: { code: 'NOT_FOUND', message: 'Not found' }, requestId: crypto.randomUUID() }, 404);
    });
}

async function signIn(page: Page, client: 'web' | 'TMA', host: string) {
    if (client === 'web') {
        await page.goto(`http://${host}/auth/email#token=${'t'.repeat(43)}&next=/safety`);
        await page.getByRole('button', { name: 'Войти в PickleHub' }).click();
    } else {
        await page.goto(`http://${host}/login`);
    }
    await expect(page.getByRole('link', { name: 'Безопасность' })).toBeVisible();
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web' as const },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA' as const },
]) {
    test(`${client.name} completes report, no-show, block and unblock safety journeys`, async ({ browser }) => {
        const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
        const page = await context.newPage();
        const state: SafetyApiState = { blocked: false, requests: [] };
        await serveProductionBuild(page, client.host, client.directory);
        await mockSafetyApi(page, state);
        await signIn(page, client.name, client.host);

        const reportCanary = 'REPORT-NARRATIVE-CANARY';
        await page.goto(
            `http://${client.host}/safety/report?sourceKind=MATCH&sourceId=${sourceId}&sourceRevision=3&subjectPlayerId=${subjectId}`
        );
        await expect(page.getByText(/PickleHub не является экстренной службой/u)).toBeVisible();
        await expect(page.locator('[data-ad-slot]')).toHaveCount(0);
        await page.getByLabel(/Дополнительные сведения/u).fill(reportCanary);
        await page.getByRole('button', { name: 'Отправить обращение' }).click();
        await expect(page.getByRole('heading', { name: 'Обращение получено' })).toBeVisible();
        await expect(page.locator('body')).not.toContainText(reportCanary);

        const noShowCanary = 'NO-SHOW-NARRATIVE-CANARY';
        await page.goto(`http://${client.host}/matches/${sourceId}/feedback/${subjectId}`);
        await expect(page.getByText(/само по себе не меняет репутацию/u)).toBeVisible();
        await page.getByLabel(/Дополнительные сведения/u).fill(noShowCanary);
        await page.getByRole('button', { name: 'Отправить отметку' }).click();
        await expect(page.getByText(/Решение и срок рассмотрения не гарантируются/u)).toBeVisible();
        await expect(page.getByLabel(/Дополнительные сведения/u)).toHaveValue('');

        await page.goto(`http://${client.host}/players/${subjectId}`);
        await expect(page.getByRole('heading', { name: 'Игрок для проверки' })).toBeVisible();
        await page.getByRole('button', { name: 'Заблокировать' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('dialog').getByRole('button', { name: 'Заблокировать' }).click();
        await expect(page.getByRole('button', { name: 'Разблокировать' })).toBeVisible();
        await page.getByRole('button', { name: 'Разблокировать' }).click();
        await expect(page.getByRole('button', { name: 'Заблокировать' })).toBeVisible();

        expect(state.blocked).toBe(false);
        expect(state.requests).toHaveLength(2);
        expect(state.requests.map((request) => request.body)).toEqual([
            expect.objectContaining({
                evidence: reportCanary,
                sourceId,
                sourceRevision: 3,
                subjectPlayerId: subjectId,
            }),
            expect.objectContaining({ evidence: noShowCanary, subjectPlayerId: subjectId }),
        ]);
        expect(state.requests.every((request) => /^[0-9a-f-]{36}$/u.test(request.idempotencyKey ?? ''))).toBe(true);
        await context.close();
    });
}
