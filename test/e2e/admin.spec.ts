import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const caseId = '11111111-1111-4111-8111-111111111111';
const narrative = 'ADMIN-RESTRICTED-NARRATIVE-CANARY';

type Role = 'SUPERADMIN' | 'MODERATOR' | 'EDITOR' | 'ADS_MANAGER';

const capabilities = {
    ADS_MANAGER: ['ADMIN_SESSION_ACCESS'],
    EDITOR: ['ADMIN_SESSION_ACCESS'],
    MODERATOR: ['ADMIN_SESSION_ACCESS', 'SAFETY_CASE_ROUTE', 'SAFETY_CASE_DECIDE', 'USER_RESTRICT'],
    SUPERADMIN: ['ADMIN_SESSION_ACCESS', 'USER_LOOKUP', 'VENUE_MODERATE', 'AUDIT_SEARCH'],
} as const;

function json(route: Route, body: unknown, status = 200) {
    return route.fulfill({
        body: JSON.stringify(body),
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        status,
    });
}

async function serveProductionBuild(page: Page, host: string, directory: string) {
    await page.route(new RegExp(`^http://${host}/(?!v1(?:/|$))`, 'u'), async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const asset =
            pathname.startsWith('/assets/') || pathname === '/runtime-config.json' ? pathname.slice(1) : 'index.html';
        await route.fulfill({ path: join(directory, asset) });
    });
}

async function mockAdminApi(page: Page, role: Role) {
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/v1/admin/session') {
            expect(request.headers().authorization).toBe(`Bearer ${role.toLowerCase().repeat(3)}`);
            return json(route, {
                absoluteExpiresAt: '2026-09-11T18:00:00.000Z',
                activeRole: role,
                capabilities: capabilities[role],
                idleExpiresAt: '2026-09-11T12:15:00.000Z',
                mfaVerifiedAt: '2026-09-11T11:50:00.000Z',
                reauthenticatedAt: '2026-09-11T11:59:00.000Z',
                sessionId: '22222222-2222-4222-8222-222222222222',
            });
        }
        if (pathname === `/v1/admin/cases/${caseId}` && role === 'MODERATOR') {
            return json(route, {
                policyVersion: 'safety-v1',
                restrictedAppeal: null,
                restrictedNarrative: narrative,
                restrictedResponses: [],
                sourceCount: 1,
                summary: {
                    actionableAt: '2026-09-11T10:00:00.000Z',
                    assignmentState: 'ASSIGNED_TO_ME',
                    caseId,
                    kind: 'SAFETY',
                    priority: 'HIGH',
                    revision: 3,
                    state: 'INVESTIGATING',
                },
            });
        }
        return json(
            route,
            { error: { code: 'ADMIN_RESOURCE_NOT_FOUND', message: 'Not found' }, requestId: caseId },
            404
        );
    });
}

for (const scenario of [
    { absent: ['Пользователи', 'Аудит'], present: ['Обращения'], role: 'MODERATOR' as const },
    { absent: ['Обращения'], present: ['Площадки', 'Пользователи', 'Аудит'], role: 'SUPERADMIN' as const },
    { absent: ['Обращения', 'Площадки', 'Пользователи', 'Аудит'], present: [], role: 'EDITOR' as const },
    { absent: ['Обращения', 'Площадки', 'Пользователи', 'Аудит'], present: [], role: 'ADS_MANAGER' as const },
]) {
    test(`web admin applies ${scenario.role} navigation from server capabilities`, async ({ browser }) => {
        const context = await browser.newContext({ locale: 'ru-RU', serviceWorkers: 'block' });
        const page = await context.newPage();
        await serveProductionBuild(page, 'web.picklehub.test', '/private/tmp/picklehub-e2e-web');
        await mockAdminApi(page, scenario.role);
        await page.goto('http://web.picklehub.test/admin');
        await page.getByLabel('Код административной сессии').fill(scenario.role.toLowerCase().repeat(3));
        await page.getByRole('button', { name: 'Проверить доступ' }).click();

        await expect(page.getByText('Текущая роль:', { exact: false })).toBeVisible();
        for (const label of scenario.present) await expect(page.getByRole('link', { name: label })).toBeVisible();
        for (const label of scenario.absent) await expect(page.getByRole('link', { name: label })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Матчи' })).toHaveCount(0);
        await context.close();
    });
}

test('web admin protects a deep case link and clears restricted content on exit', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ru-RU', serviceWorkers: 'block' });
    const page = await context.newPage();
    await serveProductionBuild(page, 'web.picklehub.test', '/private/tmp/picklehub-e2e-web');
    await mockAdminApi(page, 'MODERATOR');
    await page.goto(`http://web.picklehub.test/admin/cases/${caseId}`);

    await expect(page.getByRole('heading', { name: 'Вход для сотрудников' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(narrative);
    await page.getByLabel('Код административной сессии').fill('moderator'.repeat(3));
    await page.getByRole('button', { name: 'Проверить доступ' }).click();
    await expect(page.getByText(narrative)).toBeVisible();
    await page.getByRole('button', { name: 'Завершить сессию' }).click();

    await expect(page).toHaveURL(/\/admin\/access$/u);
    await expect(page.getByRole('heading', { name: 'Вход для сотрудников' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(narrative);
    await page.reload();
    await expect(page.locator('body')).not.toContainText(narrative);
    await context.close();
});

test('TMA contains neither admin navigation nor an admin application route', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ru-RU', serviceWorkers: 'block' });
    const page = await context.newPage();
    await serveProductionBuild(page, 'tg.picklehub.test', '/private/tmp/picklehub-e2e-tg');
    await page.goto('http://tg.picklehub.test/admin');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(page.getByText('Вход для сотрудников')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Обращения' })).toHaveCount(0);
    await context.close();
});
