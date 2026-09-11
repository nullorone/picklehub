// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { IdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MatchFeedbackScreen, PlayerSafetyActions, SafetyReceiptScreen, SafetyReportScreen } from './safety-ui';

const sourceId = '11111111-1111-4111-8111-111111111111';
const playerId = '22222222-2222-4222-8222-222222222222';

function asClient(value: Partial<IdentityClient>): IdentityClient {
    return value as IdentityClient;
}

function receipt() {
    return {
        appealDeadline: null,
        canAppeal: false,
        canRespond: false,
        canWithdraw: true,
        createdAt: '2026-09-11T12:00:00.000Z',
        kind: 'SAFETY' as const,
        outcome: null,
        outcomeReason: null,
        receiptId: '33333333-3333-4333-8333-333333333333',
        status: 'RECEIVED' as const,
        updatedAt: '2026-09-11T12:00:00.000Z',
    };
}

describe('web trust and safety', () => {
    afterEach(cleanup);

    it('shows the emergency boundary, submits exact context and drops sensitive text after the request', async () => {
        let resolveRequest: ((value: ReturnType<typeof receipt>) => void) | undefined;
        const submitSafetyReport = vi.fn().mockImplementation(
            () =>
                new Promise<ReturnType<typeof receipt>>((resolve) => {
                    resolveRequest = resolve;
                })
        );
        const client = asClient({ submitSafetyReport });
        const { container } = render(
            <MemoryRouter
                initialEntries={[
                    `/safety/report?sourceKind=PROFILE&sourceId=${sourceId}&sourceRevision=4&subjectPlayerId=${playerId}`,
                ]}
            >
                <SafetyReportScreen client={client} online />
            </MemoryRouter>
        );
        expect(screen.getByText(/PickleHub не является экстренной службой/)).toBeInTheDocument();
        expect(container.querySelector('[data-ad-slot]')).not.toBeInTheDocument();
        const evidence = screen.getByLabelText(/Дополнительные сведения/);
        fireEvent.change(evidence, { target: { value: 'чувствительный текст' } });
        fireEvent.click(screen.getByRole('button', { name: 'Отправить обращение' }));
        expect(evidence).toHaveValue('чувствительный текст');
        expect(submitSafetyReport).toHaveBeenCalledWith(
            expect.objectContaining({
                evidence: 'чувствительный текст',
                kind: 'SAFETY',
                sourceId,
                sourceKind: 'PROFILE',
                sourceRevision: 4,
                subjectPlayerId: playerId,
            }),
            expect.any(String)
        );
        resolveRequest?.(receipt());
        expect(await screen.findByRole('heading', { name: 'Обращение получено' })).toBeInTheDocument();
        expect(screen.queryByDisplayValue('чувствительный текст')).not.toBeInTheDocument();
        expect(document.activeElement).toHaveTextContent('Обращение получено');
    });

    it('does not queue an offline report or present success', () => {
        const client = asClient({ submitSafetyReport: vi.fn() });
        render(
            <MemoryRouter initialEntries={[`/safety/report?sourceKind=MATCH&sourceId=${sourceId}&sourceRevision=1`]}>
                <SafetyReportScreen client={client} online={false} />
            </MemoryRouter>
        );
        expect(screen.getByRole('button', { name: 'Отправить обращение' })).toBeDisabled();
        expect(screen.queryByText('Обращение получено')).not.toBeInTheDocument();
        expect(client.submitSafetyReport).not.toHaveBeenCalled();
    });

    it('uses a confirmation dialog before blocking and hides direct actions after success', async () => {
        const blockCommunicationUser = vi.fn().mockResolvedValue({ blockedUserId: playerId });
        const client = asClient({
            blockCommunicationUser,
            listOwnBlocks: vi.fn().mockResolvedValue({ items: [], pageInfo: { hasMore: false, nextCursor: null } }),
        });
        render(
            <MemoryRouter>
                <PlayerSafetyActions client={client} online playerId={playerId} />
            </MemoryRouter>
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Заблокировать' }));
        expect(blockCommunicationUser).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        const confirmButton = screen.getAllByRole('button', { name: 'Заблокировать' }).at(-1);
        if (!confirmButton) throw new Error('Confirmation button is missing');
        fireEvent.click(confirmButton);
        await waitFor(() => {
            expect(blockCommunicationUser).toHaveBeenCalledTimes(1);
        });
        expect(screen.getByRole('button', { name: 'Разблокировать' })).toBeInTheDocument();
    });

    it('submits review and no-show through separate truthful flows', async () => {
        const submitMatchReview = vi.fn().mockResolvedValue({});
        const submitNoShowReport = vi.fn().mockResolvedValue({ ...receipt(), kind: 'NO_SHOW' });
        render(
            <MemoryRouter initialEntries={[`/matches/${sourceId}/feedback/${playerId}`]}>
                <Routes>
                    <Route
                        path="/matches/:matchId/feedback/:subjectPlayerId"
                        element={
                            <MatchFeedbackScreen client={asClient({ submitMatchReview, submitNoShowReport })} online />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByText(/само по себе не меняет репутацию/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить отзыв' }));
        await waitFor(() => {
            expect(submitMatchReview).toHaveBeenCalledTimes(1);
        });
        fireEvent.click(screen.getByRole('button', { name: 'Отправить отметку' }));
        await waitFor(() => {
            expect(submitNoShowReport).toHaveBeenCalledTimes(1);
        });
        expect(await screen.findByText(/Решение и срок рассмотрения не гарантируются/)).toBeInTheDocument();
    });

    it('keeps caller-only receipt actions minimal and clears a response after submission', async () => {
        const ownReceipt = { ...receipt(), canRespond: true };
        const detail = { ownAppeal: null, ownResponses: [], receipt: ownReceipt, submittedEvidence: null };
        const respondToSafetyCase = vi.fn().mockResolvedValue(ownReceipt);
        const client = asClient({
            getOwnSafetyReport: vi.fn().mockResolvedValue(detail),
            respondToSafetyCase,
        });
        render(
            <MemoryRouter initialEntries={[`/safety/reports/${ownReceipt.receiptId}`]}>
                <Routes>
                    <Route path="/safety/reports/:receiptId" element={<SafetyReceiptScreen client={client} online />} />
                </Routes>
            </MemoryRouter>
        );
        const input = await screen.findByLabelText('Ваш ответ');
        fireEvent.change(input, { target: { value: 'Мой закрытый ответ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Отправить ответ' }));
        await waitFor(() => {
            expect(respondToSafetyCase).toHaveBeenCalledWith(
                ownReceipt.receiptId,
                { text: 'Мой закрытый ответ' },
                expect.any(String)
            );
        });
        expect(await screen.findByText('Ответ получен.')).toBeInTheDocument();
        expect(input).toHaveValue('');
        expect(screen.queryByText('Мой закрытый ответ')).not.toBeInTheDocument();
    });
});
