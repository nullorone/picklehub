// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createIdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TournamentDetailsScreen, TournamentsScreen } from './tournaments-ui';

const tournamentId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });
}

const tournament = {
    capacity: 4,
    checkInClosesAt: null,
    clubId: null,
    createdAt: '2026-09-12T10:00:00.000Z',
    currency: 'RUB',
    description: 'Турнир для TMA',
    entrantCount: 1,
    format: {
        configuration: { courtCount: 1, formatCode: 'KING_OF_COURT', rounds: 3, schemaVersion: '1.0.0' },
        formatCode: 'KING_OF_COURT',
        playMode: 'SINGLES',
        scoringProfile: 'ONE_GAME_11_WIN_BY_2_CAP_15',
        seedingPolicy: 'REGISTRATION_ORDER',
        strategyVersion: '1.0.0',
    },
    id: tournamentId,
    name: 'Узкий экран',
    organizerId: '33333333-3333-4333-8333-333333333333',
    priceMinor: 100000,
    projectionChecksum: null,
    projectionRevision: 0,
    registrationClosesAt: '2026-09-19T10:00:00.000Z',
    registrationGate: 'OPEN',
    registrationOpensAt: '2026-09-01T10:00:00.000Z',
    startsAt: '2026-09-20T10:00:00.000Z',
    state: 'PUBLISHED',
    timeZone: 'Europe/Moscow',
    updatedAt: '2026-09-12T10:00:00.000Z',
    venueId: '44444444-4444-4444-8444-444444444444',
    version: 2,
} as const;

describe('TMA tournament interface', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('keeps all presets reachable in the compact creation accordion', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                response({
                    items: [],
                    pageInfo: { hasMore: false, nextCursor: null },
                    snapshotAt: '2026-09-12T10:00:00.000Z',
                })
            )
        );
        render(
            <MemoryRouter>
                <TournamentsScreen client={createIdentityClient({ baseUrl: '/v1' }, 'TMA')} online signedIn />
            </MemoryRouter>
        );
        await screen.findByText('Турниры не найдены.');
        fireEvent.click(screen.getByText('Создать турнир'));
        const options = screen.getAllByRole('option').map((option) => option.textContent);
        expect(options).toEqual(
            expect.arrayContaining([
                'Американо',
                'Круговой',
                'Олимпийский',
                'Двойное выбывание',
                'Группы + плей-офф',
                'Швейцарский',
                'Лестница',
                'Король корта',
            ])
        );
    });

    it('shows cached participant/payment state and disables every mutation offline', async () => {
        const entrant = {
            checkInState: 'PENDING',
            fifoSequence: 4,
            id: '55555555-5555-4555-8555-555555555555',
            kind: 'INDIVIDUAL',
            members: [
                {
                    entrantId: '55555555-5555-4555-8555-555555555555',
                    id: '66666666-6666-4666-8666-666666666666',
                    revision: 0,
                    state: 'CONFIRMED',
                    userId,
                },
            ],
            payment: {
                entrantId: '55555555-5555-4555-8555-555555555555',
                id: '77777777-7777-4777-8777-777777777777',
                markedAt: '2026-09-12T10:00:00.000Z',
                revision: 1,
                state: 'PENDING_EXTERNAL',
            },
            registeredAt: '2026-09-12T10:00:00.000Z',
            revision: 1,
            seed: null,
            state: 'WAITLISTED',
            tieBreakLot: null,
            tournamentId,
        } as const;
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
                if (target.endsWith('/plan'))
                    return response(
                        {
                            requestId: crypto.randomUUID(),
                            error: { code: 'TOURNAMENT_NOT_FOUND', message: 'not seeded' },
                        },
                        404
                    );
                if (target.endsWith('/entrants'))
                    return response({ items: [entrant], pageInfo: { hasMore: false, nextCursor: null } });
                return response(tournament);
            })
        );
        render(
            <MemoryRouter initialEntries={[`/tournaments/${tournamentId}`]}>
                <Routes>
                    <Route
                        path="/tournaments/:tournamentId"
                        element={
                            <TournamentDetailsScreen
                                client={createIdentityClient({ baseUrl: '/v1' }, 'TMA')}
                                online={false}
                                signedIn
                                userId={userId}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(await screen.findByText(/очередь 4/u)).toBeInTheDocument();
        expect(screen.getByText(/Показаны загруженные данные/u)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Я на месте' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Сняться' })).toBeDisabled();
        expect(screen.getByText(/расчёт вне PickleHub/u)).toBeInTheDocument();
    });
});
