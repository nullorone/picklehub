// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createIdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TournamentDetailsScreen, TournamentsScreen } from './tournaments-ui';

const tournamentId = '11111111-1111-4111-8111-111111111111';
const organizerId = '22222222-2222-4222-8222-222222222222';
const entrantOne = '33333333-3333-4333-8333-333333333333';
const entrantTwo = '44444444-4444-4444-8444-444444444444';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });
}

function url(input: RequestInfo | URL): string {
    return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

const tournament = {
    capacity: 8,
    checkInClosesAt: null,
    clubId: null,
    createdAt: '2026-09-12T10:00:00.000Z',
    currency: null,
    description: 'Открытый городской турнир',
    entrantCount: 2,
    format: {
        configuration: { courtCount: 2, formatCode: 'ROUND_ROBIN', legs: 1, schemaVersion: '1.0.0' },
        formatCode: 'ROUND_ROBIN',
        playMode: 'SINGLES',
        scoringProfile: 'ONE_GAME_11_WIN_BY_2_CAP_15',
        seedingPolicy: 'REGISTRATION_ORDER',
        strategyVersion: '1.0.0',
    },
    id: tournamentId,
    name: 'Кубок сентября',
    organizerId,
    priceMinor: null,
    projectionChecksum: 'a'.repeat(64),
    projectionRevision: 1,
    registrationClosesAt: '2026-09-19T10:00:00.000Z',
    registrationGate: 'CLOSED',
    registrationOpensAt: '2026-09-01T10:00:00.000Z',
    startsAt: '2026-09-20T10:00:00.000Z',
    state: 'IN_PROGRESS',
    timeZone: 'Europe/Moscow',
    updatedAt: '2026-09-12T10:00:00.000Z',
    venueId: '55555555-5555-4555-8555-555555555555',
    version: 7,
} as const;

const roundId = '66666666-6666-4666-8666-666666666666';
const matchId = '77777777-7777-4777-8777-777777777777';
const plan = {
    matches: [
        {
            courtAssignment: {
                batch: 1,
                courtRank: 1,
                id: crypto.randomUUID(),
                revision: 0,
                startsAt: null,
                tournamentMatchId: matchId,
            },
            id: matchId,
            outcome: null,
            resultRevision: 0,
            revision: 1,
            roundId,
            scores: [],
            sequence: 1,
            slots: [
                { entrantId: entrantOne, position: 1, sourceMatchId: null, sourceOutcome: null },
                { entrantId: entrantTwo, position: 2, sourceMatchId: null, sourceOutcome: null },
            ],
            stageId: '88888888-8888-4888-8888-888888888888',
            state: 'IN_PROGRESS',
            tournamentId,
            winnerEntrantId: null,
        },
    ],
    projectionChecksum: 'a'.repeat(64),
    projectionRevision: 1,
    rounds: [
        {
            generation: 1,
            id: roundId,
            revision: 1,
            sequence: 1,
            stageId: '88888888-8888-4888-8888-888888888888',
            state: 'IN_PROGRESS',
        },
    ],
    stages: [
        {
            id: '88888888-8888-4888-8888-888888888888',
            kind: 'LEAGUE',
            sequence: 1,
            strategyKey: 'league',
            tournamentId,
        },
    ],
    standings: [
        {
            entrantId: entrantOne,
            gameDifferential: 1,
            matchPoints: 3,
            pointDifferential: 4,
            pointsScored: 11,
            rank: 1,
            revision: 1,
            stageId: null,
            tieBreakLot: 1,
            tournamentId,
            wins: 1,
        },
    ],
    tournamentId,
} as const;

describe('web tournament interface', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('offers all eight presets and blocks an invalid double-elimination size before sending it', async () => {
        const fetch = vi.fn().mockResolvedValue(
            response({
                items: [],
                pageInfo: { hasMore: false, nextCursor: null },
                snapshotAt: '2026-09-12T10:00:00.000Z',
            })
        );
        vi.stubGlobal('fetch', fetch);
        render(
            <MemoryRouter>
                <TournamentsScreen client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')} online signedIn />
            </MemoryRouter>
        );
        await screen.findByText('Турниры не найдены. Измените фильтры.');
        fireEvent.click(screen.getByText('Создать турнир'));
        const format = screen.getAllByLabelText('Формат').at(0);
        expect(format).toBeDefined();
        if (!format) throw new Error('Format field is missing');
        expect(format).toHaveDisplayValue('Американо');
        const optionNames = screen.getAllByRole<HTMLOptionElement>('option').map((option) => option.textContent);
        for (const code of codes) expect(optionNames).toContain(code);
        fireEvent.change(format, { target: { value: 'DOUBLE_ELIMINATION' } });
        const name = screen.getAllByLabelText('Название').at(0);
        expect(name).toBeDefined();
        if (!name) throw new Error('Name field is missing');
        fireEvent.change(name, { target: { value: 'Некорректная сетка' } });
        fireEvent.change(screen.getByLabelText('Площадка (ID)'), { target: { value: tournament.venueId } });
        fireEvent.change(screen.getByLabelText('Вместимость'), { target: { value: '6' } });
        fireEvent.change(screen.getByLabelText('Открытие регистрации'), { target: { value: '2026-09-01T10:00' } });
        fireEvent.change(screen.getByLabelText('Закрытие регистрации'), { target: { value: '2026-09-10T10:00' } });
        fireEvent.change(screen.getByLabelText('Начало'), { target: { value: '2026-09-20T10:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }));
        expect(await screen.findByText(/только степень двойки/u)).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('renders public rounds, a text alternative and standings', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => response(url(input).endsWith('/plan') ? plan : tournament))
        );
        render(
            <MemoryRouter initialEntries={[`/tournaments/${tournamentId}`]}>
                <Routes>
                    <Route
                        path="/tournaments/:tournamentId"
                        element={
                            <TournamentDetailsScreen
                                client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')}
                                online
                                signedIn={false}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(await screen.findByRole('heading', { name: tournament.name })).toBeInTheDocument();
        expect(screen.getByText('Текстовая альтернатива сетки')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Турнирная таблица' })).toBeInTheDocument();
        expect(screen.getByText(/корт 1, поток 1/u)).toBeInTheDocument();
    });

    it('surfaces a concurrent score conflict and offers a fresh reload', async () => {
        const entrants = { items: [], pageInfo: { hasMore: false, nextCursor: null } };
        const fetch = vi.fn((input: RequestInfo | URL) => {
            const target = url(input);
            if (target.endsWith('/entrants')) return response(entrants);
            if (target.endsWith('/plan')) return response(plan);
            if (target.endsWith('/auth/context')) return response({ csrfToken: 'c'.repeat(43) });
            if (target.endsWith('/score'))
                return response(
                    {
                        requestId: crypto.randomUUID(),
                        error: { code: 'TOURNAMENT_RESOURCE_REVISION_CONFLICT', message: 'conflict' },
                    },
                    409
                );
            return response(tournament);
        });
        vi.stubGlobal('fetch', fetch);
        render(
            <MemoryRouter initialEntries={[`/tournaments/${tournamentId}`]}>
                <Routes>
                    <Route
                        path="/tournaments/:tournamentId"
                        element={
                            <TournamentDetailsScreen
                                client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')}
                                online
                                signedIn
                                userId={organizerId}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        fireEvent.click(await screen.findByText('Счёт и исправление'));
        fireEvent.change(screen.getByLabelText('Счёт по играм'), { target: { value: '11:7' } });
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить счёт' }));
        expect(await screen.findByText(/Данные уже изменились/u)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Загрузить свежую версию' })).toBeInTheDocument();
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                `/v1/tournaments/${tournamentId}/matches/${matchId}/score`,
                expect.objectContaining({ method: 'PUT' })
            );
        });
    });
});

const codes = [
    'Американо',
    'Круговой турнир',
    'Олимпийская система',
    'Двойное выбывание',
    'Группы и плей-офф',
    'Швейцарская система',
    'Лестница',
    'Король корта',
];
