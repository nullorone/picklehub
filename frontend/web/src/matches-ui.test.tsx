// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { ApiError, type components, type IdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateMatchScreen, MatchDetailsScreen, MatchesScreen } from './matches-ui';

const matchId = '11111111-1111-4111-8111-111111111111';
const organizerId = '22222222-2222-4222-8222-222222222222';
const playerId = '33333333-3333-4333-8333-333333333333';

function fullMatch(version = 3): components['schemas']['Match'] {
    return {
        bookingNote: null,
        bookingState: 'NOT_BOOKED',
        createdAt: '2026-09-10T10:00:00.000Z',
        currentResult: null,
        description: 'Дружеская игра',
        format: 'SINGLES',
        guests: [],
        id: matchId,
        joinMode: 'AUTO',
        organizerId,
        participants: [
            {
                id: '44444444-4444-4444-8444-444444444444',
                isOrganizer: true,
                joinedAt: '2026-09-10T10:00:00.000Z',
                state: 'ACTIVE',
                team: 'TEAM_A',
                userId: organizerId,
            },
        ],
        policyVersion: 'matches-v1',
        publishedAt: '2026-09-10T10:00:00.000Z',
        skillMax: 4,
        skillMin: 2,
        startsAt: '2026-09-12T15:00:00.000Z',
        state: 'PUBLISHED',
        teams: [
            { capacity: 1, code: 'TEAM_A', occupiedPlaces: 1, reservedPlaces: 0 },
            { capacity: 1, code: 'TEAM_B', occupiedPlaces: 0, reservedPlaces: 0 },
        ],
        timeZone: 'Europe/Moscow',
        updatedAt: '2026-09-10T10:00:00.000Z',
        venue: { venueCandidateId: null, venueId: null },
        version,
        visibility: 'PUBLIC',
    };
}

function asClient(value: Partial<IdentityClient>): IdentityClient {
    return { listMatchWaitlist: vi.fn().mockResolvedValue({ items: [] }), ...value } as IdentityClient;
}

describe('web matches', () => {
    afterEach(() => {
        cleanup();
    });

    it('shows explainable recommendations and an empty map fallback', async () => {
        const summary: components['schemas']['MatchSummary'] = {
            format: 'SINGLES',
            id: matchId,
            recommendationReasons: ['NEARBY', 'LEVEL_FIT'],
            recommendationScore: 91,
            skillMax: 4,
            skillMin: 2,
            startsAt: '2026-09-12T15:00:00.000Z',
            state: 'PUBLISHED',
            teams: fullMatch().teams,
            timeZone: 'Europe/Moscow',
        };
        const client = asClient({
            getMatch: vi.fn().mockResolvedValue(fullMatch()),
            recommendMatches: vi.fn().mockResolvedValue({
                items: [summary],
                pageInfo: { hasMore: false, nextCursor: null },
                recommendationPolicyVersion: 'matches-v1',
                snapshotAt: '2026-09-10T10:00:00.000Z',
            }),
        });
        render(
            <MemoryRouter>
                <MatchesScreen client={client} config={{ apiBaseUrl: '/v1', environment: 'test' }} online signedIn />
            </MemoryRouter>
        );
        expect(await screen.findByText(/91% · рядом, подходит по уровню/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Карта' }));
        expect(screen.getByText('Карта не настроена. Используйте список.')).toBeInTheDocument();
    });

    it('reuses the mutation key after a network failure', async () => {
        const join = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('network'))
            .mockResolvedValueOnce({ match: fullMatch(4) });
        const client = asClient({ getMatch: vi.fn().mockResolvedValue(fullMatch()), joinMatch: join });
        render(
            <MemoryRouter>
                <MatchDetailsScreen channel="web" client={client} matchId={matchId} online userId={playerId} />
            </MemoryRouter>
        );
        const button = await screen.findByRole('button', { name: 'Вступить' });
        fireEvent.click(button);
        expect(await screen.findByText(/Не удалось связаться/)).toBeInTheDocument();
        fireEvent.click(button);
        await waitFor(() => {
            expect(join).toHaveBeenCalledTimes(2);
        });
        expect(join.mock.calls[0]?.[2]).toBe(join.mock.calls[1]?.[2]);
    });

    it('reloads a stale roster and explains the conflict', async () => {
        const getMatch = vi.fn().mockResolvedValueOnce(fullMatch(3)).mockResolvedValueOnce(fullMatch(4));
        const conflict = new ApiError(409, {
            error: { code: 'MATCH_VERSION_CONFLICT', message: 'conflict' },
            requestId: crypto.randomUUID(),
        });
        const client = asClient({ getMatch, joinMatch: vi.fn().mockRejectedValue(conflict) });
        render(
            <MemoryRouter>
                <MatchDetailsScreen channel="web" client={client} matchId={matchId} online userId={playerId} />
            </MemoryRouter>
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Вступить' }));
        expect(await screen.findByText(/Состав или результат уже изменился/)).toBeInTheDocument();
        expect(getMatch).toHaveBeenCalledTimes(2);
    });

    it('marks a proposed score as provisional', async () => {
        const proposed = {
            ...fullMatch(),
            participants: [
                ...fullMatch().participants,
                {
                    id: '66666666-6666-4666-8666-666666666666',
                    isOrganizer: false,
                    joinedAt: '2026-09-10T11:00:00.000Z',
                    state: 'ACTIVE' as const,
                    team: 'TEAM_B' as const,
                    userId: playerId,
                },
            ],
            currentResult: {
                confirmations: [],
                games: [{ gameNumber: 1, teamAPoints: 11, teamBPoints: 7 }],
                id: '55555555-5555-4555-8555-555555555555',
                matchId,
                mode: 'SCORED' as const,
                proposedAt: '2026-09-12T17:00:00.000Z',
                resolvedAt: null,
                seriesFormat: 'BEST_OF_1' as const,
                state: 'PROPOSED' as const,
                version: 1,
                winningTeam: 'TEAM_A' as const,
            },
            state: 'AWAITING_CONFIRMATION' as const,
        };
        render(
            <MemoryRouter>
                <MatchDetailsScreen
                    channel="web"
                    client={asClient({ getMatch: vi.fn().mockResolvedValue(proposed) })}
                    matchId={matchId}
                    online
                    userId={playerId}
                />
            </MemoryRouter>
        );
        expect(await screen.findByText(/это ещё не окончательная статистика/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Оспорить' })).toBeInTheDocument();
    });

    it('explains an empty venue catalogue and offers a public-address fallback', async () => {
        render(
            <MemoryRouter>
                <CreateMatchScreen
                    client={asClient({
                        searchVenues: vi.fn().mockResolvedValue({
                            items: [],
                            pageInfo: { hasMore: false, nextCursor: null },
                            snapshotAt: '2026-09-10T10:00:00.000Z',
                        }),
                    })}
                    online
                />
            </MemoryRouter>
        );
        expect(await screen.findByText(/Доступных площадок пока нет/)).toBeInTheDocument();
        expect(screen.getByText('Новый публичный адрес')).toBeInTheDocument();
    });

    it('disables offline joining and renders guest and external booking state', async () => {
        const value = {
            ...fullMatch(),
            bookingNote: 'Бронь подтверждена клубом',
            bookingState: 'BOOKED_EXTERNALLY' as const,
            guests: [
                {
                    createdAt: '2026-09-10T10:00:00.000Z',
                    id: '77777777-7777-4777-8777-777777777777',
                    label: 'Партнёр организатора',
                    team: 'TEAM_A' as const,
                },
            ],
        };
        render(
            <MemoryRouter>
                <MatchDetailsScreen
                    channel="web"
                    client={asClient({ getMatch: vi.fn().mockResolvedValue(value) })}
                    matchId={matchId}
                    online={false}
                    userId={playerId}
                />
            </MemoryRouter>
        );
        expect(await screen.findByText('Партнёр организатора · гость')).toBeInTheDocument();
        expect(screen.getByText('Забронировано вне PickleHub')).toBeInTheDocument();
        expect(screen.getByText('Бронь подтверждена клубом')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Вступить' })).toBeDisabled();
    });
});
