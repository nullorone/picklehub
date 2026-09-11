// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { type components, type IdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProfileScreen } from './profiles-ui';

const playerId = '11111111-1111-4111-8111-111111111111';
const otherPlayerId = '44444444-4444-4444-8444-444444444444';
const matchId = '22222222-2222-4222-8222-222222222222';
const locality = {
    countryCode: 'RU',
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Москва',
    region: 'Москва',
} as const;

function totals(played: number, denominator: number): components['schemas']['StatisticTotals'][] {
    return (['ALL', 'SINGLES', 'DOUBLES'] as const).map((slice) => ({
        decided: denominator,
        gamesPlayed: 0,
        lastConfirmedAt: null,
        losses: 0,
        played: slice === 'ALL' ? played : 0,
        pointsAgainst: 0,
        pointsDifference: 0,
        pointsFor: 0,
        slice,
        winRateDenominator: slice === 'ALL' ? denominator : 0,
        winRateNumerator: 0,
        wins: 0,
    }));
}

function publicStatistics(
    state: components['schemas']['ProfileProjectionState'] = 'CURRENT'
): components['schemas']['PublicPlayerStatistics'] {
    return {
        attendance: { percentage: null, sampleSize: null },
        attendanceAvailable: false,
        calculatedAt: '2026-09-11T12:00:00.000Z',
        reliability: { percentage: null, sampleSize: null },
        state,
        totals: totals(1, 0),
    };
}

function publicProfile(): components['schemas']['PublicPlayerProfile'] {
    return {
        avatarUrl: null,
        displayName: 'Анна Смирнова',
        externalProfileLink: null,
        gameFormats: ['SINGLES'],
        locality,
        playerId,
        skillSelfAssessment: 3.5,
        statistics: publicStatistics(),
        updatedAt: '2026-09-11T12:00:00.000Z',
    };
}

function ownProfile(): components['schemas']['PlayerProfile'] {
    const statistics: components['schemas']['PlayerStatistics'] = {
        attendance: { attendanceCommitments: 0, available: false, confirmedNoShows: 0, percentage: null },
        calculatedAt: '2026-09-11T12:00:00.000Z',
        reliability: { denominator: 0, organizedFailures: 0, organizedSuccesses: 0, percentage: null },
        state: 'CURRENT',
        totals: totals(0, 0),
    };
    return {
        avatar: null,
        displayName: 'Анна Смирнова',
        externalProfileLink: null,
        gameFormats: ['SINGLES'],
        locality,
        playerId,
        skillSelfAssessment: 3.5,
        statistics,
        timeZone: 'Europe/Moscow',
        updatedAt: '2026-09-11T12:00:00.000Z',
        version: 2,
        visibility: 'PUBLIC',
    };
}

function history(): components['schemas']['MatchHistoryPage'] {
    return {
        items: [
            {
                confirmedAt: null,
                format: 'SINGLES',
                games: [],
                matchId,
                participants: [],
                startsAt: '2026-09-12T12:00:00.000Z',
                state: 'DISPUTED',
                venue: { venueId: null },
                winningTeam: null,
            },
        ],
        pageInfo: { hasMore: false, nextCursor: null },
        snapshotAt: '2026-09-11T12:00:00.000Z',
    };
}

function asClient(value: Partial<IdentityClient>): IdentityClient {
    return value as IdentityClient;
}

describe('web profile parity', () => {
    afterEach(cleanup);

    it('renders only public responses and keeps a zero-denominator win rate absent', async () => {
        const ownProfile = vi.fn();
        const client = asClient({
            getOwnPlayerProfile: ownProfile,
            getPublicPlayerProfile: vi.fn().mockResolvedValue(publicProfile()),
            getPublicPlayerStatistics: vi.fn().mockResolvedValue(publicStatistics('UPDATING')),
            listPublicPlayerMatchHistory: vi.fn().mockResolvedValue(history()),
        });

        render(
            <MemoryRouter>
                <ProfileScreen client={client} online ownership="OTHER" playerId={playerId} />
            </MemoryRouter>
        );

        expect(await screen.findByRole('heading', { name: 'Анна Смирнова' })).toBeInTheDocument();
        expect(screen.getByText(/последнее полностью согласованное состояние/)).toBeInTheDocument();
        expect(screen.getAllByText(/доля побед не вычисляется/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Доля побед: 0/)).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Ещё не вошли в статистику' })).toBeInTheDocument();
        expect(screen.getByText(/Результат оспорен/)).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Изменить профиль' })).not.toBeInTheDocument();
        expect(ownProfile).not.toHaveBeenCalled();
    });

    it('shows partial data without inventing statistic values', async () => {
        const client = asClient({
            getPublicPlayerProfile: vi.fn().mockResolvedValue(publicProfile()),
            getPublicPlayerStatistics: vi.fn().mockRejectedValue(new TypeError('offline')),
            listPublicPlayerMatchHistory: vi.fn().mockResolvedValue(history()),
        });

        render(
            <MemoryRouter>
                <ProfileScreen client={client} online ownership="OTHER" playerId={playerId} />
            </MemoryRouter>
        );

        expect(
            await screen.findByText('Статистику не удалось загрузить. Значения не заменены нулями.')
        ).toBeInTheDocument();
        expect(screen.getByText(/Результат оспорен/)).toBeInTheDocument();
    });

    it('announces offline mode while keeping a previously returned public view readable', async () => {
        const client = asClient({
            getPublicPlayerProfile: vi.fn().mockResolvedValue(publicProfile()),
            getPublicPlayerStatistics: vi.fn().mockResolvedValue(publicStatistics()),
            listPublicPlayerMatchHistory: vi.fn().mockResolvedValue({ ...history(), items: [] }),
        });

        render(
            <MemoryRouter>
                <ProfileScreen client={client} online={false} ownership="OTHER" playerId={playerId} />
            </MemoryRouter>
        );

        expect(await screen.findByRole('heading', { name: 'Анна Смирнова' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Нет сети');
        expect(screen.getByText('Публичных подтверждённых матчей пока нет.')).toBeInTheDocument();
    });

    it('reuses the profile mutation key after a network failure', async () => {
        const profile = ownProfile();
        const update = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(profile);
        const client = asClient({
            getOwnPlayerProfile: vi.fn().mockResolvedValue(profile),
            getOwnPlayerStatistics: vi.fn().mockResolvedValue(profile.statistics),
            listLocalities: vi.fn().mockResolvedValue({
                items: [locality],
                pageInfo: { hasMore: false, nextCursor: null },
            }),
            listOwnMatchHistory: vi.fn().mockResolvedValue({ ...history(), items: [] }),
            updateOwnPlayerProfile: update,
        });
        render(
            <MemoryRouter>
                <ProfileScreen client={client} online ownership="SELF" />
            </MemoryRouter>
        );

        fireEvent.change(await screen.findByLabelText('Имя'), { target: { value: 'Анна Новая' } });
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));
        expect(await screen.findByText('Нет связи с сервером. Изменения не отправлены.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));
        await waitFor(() => {
            expect(update).toHaveBeenCalledTimes(2);
        });
        expect(update.mock.calls[0]?.[1]).toBe(update.mock.calls[1]?.[1]);
    });

    it('paginates a large history and exposes exact rounded statistics to assistive technology', async () => {
        const baseStatistics = publicStatistics();
        const all = baseStatistics.totals[0];
        const historyTemplate = history().items[0];
        if (!all || !historyTemplate) throw new Error('Profile test fixtures are incomplete');
        const statistics = {
            ...baseStatistics,
            totals: baseStatistics.totals.map((total) =>
                total.slice === 'ALL'
                    ? {
                          ...total,
                          decided: 3,
                          losses: 1,
                          played: 3,
                          winRateDenominator: 3,
                          winRateNumerator: 2,
                          wins: 2,
                      }
                    : total
            ),
        };
        const firstPage = {
            ...history(),
            items: Array.from({ length: 50 }, (_, index) => ({
                ...historyTemplate,
                matchId: `${String(index + 10).padStart(8, '0')}-2222-4222-8222-222222222222`,
            })),
            pageInfo: { hasMore: true, nextCursor: 'next-page' },
        };
        const secondEntry = { ...historyTemplate, matchId: otherPlayerId, state: 'CONFIRMED_PLAYED' as const };
        const listHistory = vi
            .fn()
            .mockResolvedValueOnce(firstPage)
            .mockResolvedValueOnce({
                items: [secondEntry],
                pageInfo: { hasMore: false, nextCursor: null },
                snapshotAt: firstPage.snapshotAt,
            });
        const client = asClient({
            getPublicPlayerProfile: vi.fn().mockResolvedValue(publicProfile()),
            getPublicPlayerStatistics: vi.fn().mockResolvedValue(statistics),
            listPublicPlayerMatchHistory: listHistory,
        });

        render(
            <MemoryRouter>
                <ProfileScreen client={client} online ownership="OTHER" playerId={playerId} />
            </MemoryRouter>
        );

        expect(await screen.findByRole('img', { name: 'Доля побед 66.7%, 2 из 3' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
        expect(await screen.findByText(/Игра подтверждена без счёта/u)).toBeInTheDocument();
        expect(listHistory).toHaveBeenLastCalledWith(playerId, 'next-page');
        expect(screen.getAllByRole('link')).toHaveLength(51);
        expect(screen.getByRole('region', { name: 'Подтверждённая статистика' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'История матчей' })).toBeInTheDocument();
    });

    it('discards a late response after the viewed account changes', async () => {
        let resolveOld: ((profile: components['schemas']['PublicPlayerProfile']) => void) | undefined;
        const oldProfile = new Promise<components['schemas']['PublicPlayerProfile']>((resolve) => {
            resolveOld = resolve;
        });
        const newerProfile = { ...publicProfile(), displayName: 'Борис Новый', playerId: otherPlayerId };
        const client = asClient({
            getPublicPlayerProfile: vi.fn((id: string) =>
                id === playerId ? oldProfile : Promise.resolve(newerProfile)
            ),
            getPublicPlayerStatistics: vi.fn().mockResolvedValue(publicStatistics()),
            listPublicPlayerMatchHistory: vi.fn().mockResolvedValue({ ...history(), items: [] }),
        });
        const view = render(
            <MemoryRouter>
                <ProfileScreen client={client} online ownership="OTHER" playerId={playerId} />
            </MemoryRouter>
        );

        view.rerender(
            <MemoryRouter>
                <ProfileScreen client={client} online ownership="OTHER" playerId={otherPlayerId} />
            </MemoryRouter>
        );
        expect(await screen.findByRole('heading', { name: 'Борис Новый' })).toBeInTheDocument();
        resolveOld?.(publicProfile());
        await waitFor(() => {
            expect(screen.queryByRole('heading', { name: 'Анна Смирнова' })).not.toBeInTheDocument();
        });
    });
});
