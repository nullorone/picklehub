// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { createIdentityClient, type components } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ClubGamificationSettings, LeaderboardScreen, ProgressScreen } from './gamification-ui';

const clubId = '11111111-1111-4111-8111-111111111111';
const seasonId = '22222222-2222-4222-8222-222222222222';
const level = {
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Партнёр площадки',
    ordinal: 2,
    scope: { clubId: null, kind: 'GLOBAL' },
    thresholdXp: 100,
    version: '1.0.0',
} as const;
const progress: components['schemas']['GamificationProgress'] = {
    currentLevel: level,
    lifetimeNetXp: 140,
    nextLevel: {
        ...level,
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Организатор',
        ordinal: 3,
        thresholdXp: 200,
    },
    projectionRevision: 4,
    scope: { clubId: null, kind: 'GLOBAL' },
    state: 'ACTIVE',
    updatedAt: '2026-09-13T10:00:00.000Z',
    xpToNextLevel: 60,
};
const achievements: components['schemas']['AchievementPage'] = {
    items: [
        {
            awardedAt: '2026-09-12T10:00:00.000Z',
            changedAt: '2026-09-13T10:00:00.000Z',
            definition: {
                code: 'FIRST_PLAY',
                description: 'Сыграть первую подтверждённую игру.',
                id: '55555555-5555-4555-8555-555555555555',
                scopeKind: 'GLOBAL',
                sourceKind: 'CONFIRMED_PLAY',
                thresholdCount: 1,
                title: 'Первая игра',
                version: '1.0.0',
            },
            id: '66666666-6666-4666-8666-666666666666',
            qualifyingCount: 1,
            scope: { clubId: null, kind: 'GLOBAL' },
            state: 'REVOKED',
        },
    ],
    pageInfo: { hasMore: false, nextCursor: null },
};
const history: components['schemas']['XpLedgerPage'] = {
    items: [
        {
            amount: 100,
            compensationOfEntryId: '77777777-7777-4777-8777-777777777777',
            createdAt: '2026-09-13T10:00:00.000Z',
            id: '88888888-8888-4888-8888-888888888888',
            kind: 'REVERSAL',
            occurredAt: '2026-09-12T10:00:00.000Z',
            ruleDefinitionId: '99999999-9999-4999-8999-999999999999',
            ruleVersion: '1.0.0',
            scope: { clubId: null, kind: 'GLOBAL' },
            sourceEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            sourceKind: 'CONFIRMED_PLAY',
            status: 'POSTED',
        },
    ],
    pageInfo: { hasMore: false, nextCursor: null },
};
const templates: readonly components['schemas']['ClubXpTemplate'][] = [
    {
        baseXp: 100,
        coefficientTenths: 10,
        dailyEventCap: 3,
        enabled: true,
        sourceKind: 'CONFIRMED_PLAY',
        weeklyEventCap: 10,
    },
    {
        baseXp: 40,
        coefficientTenths: 10,
        dailyEventCap: 3,
        enabled: true,
        sourceKind: 'CONFIRMED_MATCH_ORGANIZED',
        weeklyEventCap: 10,
    },
    {
        baseXp: 15,
        coefficientTenths: 10,
        dailyEventCap: 3,
        enabled: true,
        sourceKind: 'ELIGIBLE_STRUCTURED_REVIEW',
        weeklyEventCap: 10,
    },
];
const configuration: components['schemas']['ClubGamificationConfiguration'] = {
    clubId,
    definitionVersion: '1.0.0',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    levels: [{ ...level, scope: { clubId, kind: 'CLUB' } }],
    templates,
    version: 1,
};

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function url(input: RequestInfo | URL): string {
    return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

describe('TMA gamification interface', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('shows accessible level progress, reasons and an explained reversal apart from sports data', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const target = url(input);
                return response(
                    target.includes('/achievements')
                        ? achievements
                        : target.includes('/xp-history')
                          ? history
                          : progress
                );
            })
        );
        render(
            <MemoryRouter>
                <ProgressScreen client={createIdentityClient({ baseUrl: '/v1' }, 'TMA')} />
            </MemoryRouter>
        );
        expect(await screen.findByRole('heading', { name: 'Партнёр площадки' })).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Прогресс до следующего уровня' })).toHaveAttribute(
            'value',
            '40'
        );
        expect(screen.getByText(/не меняет спортивную статистику или DUPR/u)).toBeInTheDocument();
        expect(screen.getByText(/Связанный XP скорректирован отдельной/u)).toBeInTheDocument();
        expect(screen.getByText('↩ Отозвано')).toBeInTheDocument();
        expect(screen.getByText('↩ Начисление отменено', { exact: false })).toBeInTheDocument();
        expect(screen.getByText('−100 XP')).toBeInTheDocument();
    });

    it('requires explicit per-season consent and hides blocked identity without losing rank', async () => {
        let optedIn = false;
        const page = () => ({
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
                      revision: 1,
                      seasonId,
                  }
                : null,
        });
        const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            const target = url(input);
            if (target.endsWith('/auth/context')) return response({ csrfToken: 'c'.repeat(43) });
            if (target.endsWith('/leaderboard-consent') && init?.method === 'PUT') {
                optedIn = true;
                return response({
                    changedAt: '2026-09-13T10:00:00.000Z',
                    optedIn: true,
                    policyVersion: '1.0.0',
                    revision: 1,
                    seasonId,
                });
            }
            return response(page());
        });
        vi.stubGlobal('fetch', fetch);
        render(
            <MemoryRouter initialEntries={[`/progress/seasons/${seasonId}`]}>
                <Routes>
                    <Route
                        path="/progress/seasons/:seasonId"
                        element={<LeaderboardScreen client={createIdentityClient({ baseUrl: '/v1' }, 'TMA')} online />}
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(await screen.findByText('○ Вы не участвуете в этом сезоне.')).toBeInTheDocument();
        expect(screen.getByText('Место 2')).toBeInTheDocument();
        expect(screen.getByText('Скрытый игрок (блокировка)')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Дать согласие и участвовать' }));
        expect(await screen.findByText('✓ Вы участвуете в этом сезоне.')).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/leaderboard-consent'),
            expect.objectContaining({ method: 'PUT' })
        );
    });

    it('limits club controls to allowlisted coefficients and previews a new immutable version', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => response(configuration))
        );
        render(
            <MemoryRouter initialEntries={[`/clubs/${clubId}/progress/settings`]}>
                <Routes>
                    <Route
                        path="/clubs/:clubId/progress/settings"
                        element={
                            <ClubGamificationSettings
                                client={createIdentityClient({ baseUrl: '/v1' }, 'TMA')}
                                online={false}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(await screen.findByRole('heading', { name: 'Настройки прогресса' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Предпросмотр версии 2.0.0' })).toBeInTheDocument();
        const select = screen.getByLabelText('Коэффициент: Подтверждённая игра');
        expect(select.querySelectorAll('option')).toHaveLength(16);
        fireEvent.change(select, { target: { value: '20' } });
        expect(screen.getByText(/200 XP за событие/u)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Опубликовать новую версию' })).toBeDisabled();
        await waitFor(() => expect(screen.getByText(/Публикация требует подключения/u)).toBeInTheDocument());
    });
});
