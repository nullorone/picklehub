import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';

const matchId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const conversationId = '44444444-4444-4444-8444-444444444444';
const notificationId = '55555555-5555-4555-8555-555555555555';

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
        accessExpiresAt: '2026-09-10T12:05:00.000Z',
        accessToken: 'a'.repeat(43),
        csrfToken: 'c'.repeat(43),
        session: {
            absoluteExpiresAt: '2026-10-10T12:00:00.000Z',
            createdAt: '2026-09-10T12:00:00.000Z',
            id: '66666666-6666-4666-8666-666666666666',
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

function message(sequence: number, text: string | null, kind: 'SYSTEM' | 'USER' = 'USER') {
    return {
        authorId: kind === 'SYSTEM' ? null : sequence === 3 ? userId : otherId,
        conversationId,
        createdAt: `2026-09-10T10:0${String(sequence)}:00.000Z`,
        deletedAt: null,
        editedAt: null,
        id: `${String(sequence).padStart(8, '0')}-1111-4111-8111-111111111111`,
        kind,
        revision: 1,
        sequence,
        systemType: kind === 'SYSTEM' ? 'ROSTER_JOINED' : null,
        text,
    };
}

function channels() {
    return (['ROSTER', 'REQUESTS', 'MATCH_CRITICAL', 'REMINDERS', 'RESULTS', 'CHAT'] as const).flatMap((category) =>
        (['IN_APP', 'TELEGRAM', 'EMAIL'] as const).map((channel) => ({
            category,
            channel,
            enabled: channel === 'IN_APP',
        }))
    );
}

async function mockApi(page: Page) {
    let preferences = {
        channels: channels(),
        locale: 'ru-RU',
        quietHours: { enabled: true, endLocal: '08:00', startLocal: '22:00' },
        timeZone: 'Europe/Moscow',
        tzdataVersion: 'test',
        updatedAt: '2026-09-10T10:00:00.000Z',
        version: 1,
    };
    await page.route('**/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        if (url.pathname === '/v1/auth/context') return json(route, { csrfToken: 'c'.repeat(43) });
        if (url.pathname === '/v1/auth/magic-links/consume' || url.pathname === '/v1/auth/refresh') {
            return json(route, session());
        }
        if (url.pathname === `/v1/matches/${matchId}/conversation` && method === 'GET') {
            return json(route, {
                backwardCursor: null,
                catchUpCursor: 'catch-up-cursor',
                conversation: {
                    accessExpiresAt: null,
                    accessThroughSequence: null,
                    id: conversationId,
                    lastReadSequence: 0,
                    latestSequence: 2,
                    matchId,
                    state: 'WRITABLE',
                    unreadCount: 2,
                    version: 1,
                },
                messages: [message(1, null, 'SYSTEM'), message(2, 'Встречаемся у первого корта')],
            });
        }
        if (url.pathname === `/v1/matches/${matchId}/conversation/messages` && method === 'POST') {
            const body = request.postDataJSON() as { text: string };
            return json(route, message(3, body.text), 201);
        }
        if (url.pathname === `/v1/matches/${matchId}/conversation/read`) {
            return json(route, { conversationId, lastReadSequence: 3, unreadCount: 0 });
        }
        if (url.pathname === '/v1/notifications' && method === 'GET') {
            return json(route, {
                items: [
                    {
                        category: 'CHAT',
                        createdAt: '2026-09-10T10:02:00.000Z',
                        deliveries: [],
                        id: notificationId,
                        readAt: null,
                        route: `/matches/${matchId}/chat`,
                        type: 'CHAT_MESSAGE',
                    },
                ],
                pageInfo: { hasMore: false, nextCursor: null },
            });
        }
        if (url.pathname === `/v1/notifications/${notificationId}/read`) {
            return json(route, { notificationId, readAt: '2026-09-10T10:03:00.000Z' });
        }
        if (url.pathname === '/v1/notification-preferences' && method === 'GET') return json(route, preferences);
        if (url.pathname === '/v1/notification-preferences' && method === 'PUT') {
            const body = request.postDataJSON() as typeof preferences;
            preferences = { ...body, updatedAt: '2026-09-10T10:04:00.000Z', version: 2 };
            return json(route, preferences);
        }
        if (url.pathname === '/v1/me/identities') {
            return json(route, {
                items: [{ id: crypto.randomUUID(), linkedAt: '2026-09-10T09:00:00.000Z', provider: 'EMAIL' }],
            });
        }
        if (url.pathname === '/v1/auth/telegram') return json(route, session());
        return json(route, { error: { code: 'NOT_FOUND', message: 'Not found' }, requestId: crypto.randomUUID() }, 404);
    });
}

async function signIn(page: Page, client: 'TMA' | 'web', host: string) {
    if (client === 'web') {
        await page.goto(`http://${host}/auth/email#token=${'t'.repeat(43)}&next=/matches/${matchId}/chat`);
        await page.getByRole('button', { name: 'Войти в PickleHub' }).click();
    } else {
        await page.goto(`http://${host}/login`);
        await page.goto(`http://${host}/matches/${matchId}/chat`);
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Чат матча' })).toBeVisible();
}

for (const client of [
    { directory: '/private/tmp/picklehub-e2e-web', host: 'web.picklehub.test', name: 'web' as const },
    { directory: '/private/tmp/picklehub-e2e-tg', host: 'tg.picklehub.test', name: 'TMA' as const },
]) {
    test(`${client.name} covers chat, system event, notification settings and offline draft`, async ({ browser }) => {
        const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
        const page = await context.newPage();
        await serveProductionBuild(page, client.host, client.directory);
        await mockApi(page);
        await signIn(page, client.name, client.host);

        const liveRegion = page.getByRole('list', { name: 'Сообщения чата' });
        await expect(liveRegion).toHaveAttribute('aria-live', 'polite');
        await expect(page.getByText('К матчу присоединился игрок')).toBeVisible();
        await expect(page.getByText('Встречаемся у первого корта')).toBeVisible();
        await page.getByLabel('Сообщение').fill('Подтверждаю');
        await page.getByRole('button', { name: 'Отправить' }).click();
        await expect(page.getByText('Подтверждаю')).toBeVisible();

        await page.getByRole('link', { name: /Уведомления/u }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Уведомления' })).toBeVisible();
        const chatSettings = page.getByRole('group', { name: 'Каналы уведомлений' }).getByRole('group', {
            name: 'Чат',
        });
        await chatSettings.getByRole('checkbox', { name: 'Email' }).check();
        await page.getByRole('button', { name: 'Сохранить настройки' }).click();
        await expect(page.getByRole('status')).toContainText('Настройки сохранены.');

        await page.goto(`http://${client.host}/matches/${matchId}/chat`);
        await expect(page.getByLabel('Сообщение')).toBeVisible();
        await context.setOffline(true);
        await expect(
            page.getByText('Нет подключения к интернету. Доступны только уже загруженные данные.')
        ).toBeVisible();
        await page.getByLabel('Сообщение').fill('Локальный черновик');
        await expect(page.getByRole('button', { name: 'Отправить' })).toBeDisabled();
        await expect(page.getByText('Локальный черновик')).toHaveCount(0);
        await context.close();
    });
}
