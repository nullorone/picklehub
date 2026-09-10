// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { components, IdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatScreen, NotificationsScreen } from './communications-ui';

const matchId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';

function message(overrides: Partial<components['schemas']['Message']>): components['schemas']['Message'] {
    return {
        authorId: otherId,
        conversationId: '44444444-4444-4444-8444-444444444444',
        createdAt: '2026-09-11T09:00:00.000Z',
        deletedAt: null,
        editedAt: null,
        id: crypto.randomUUID(),
        kind: 'USER',
        revision: 1,
        sequence: 1,
        systemType: null,
        text: 'Первое сообщение',
        ...overrides,
    };
}

function asClient(value: Partial<IdentityClient>): IdentityClient {
    return value as IdentityClient;
}

describe('web communications', () => {
    afterEach(() => {
        cleanup();
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    it('deduplicates revisions, preserves sequence order and distinguishes special states', async () => {
        const first = message({ id: '55555555-5555-4555-8555-555555555555', sequence: 1 });
        const revised = message({ ...first, editedAt: '2026-09-11T09:01:00.000Z', revision: 2, text: 'Исправлено' });
        const system = message({
            authorId: null,
            id: '66666666-6666-4666-8666-666666666666',
            kind: 'SYSTEM',
            sequence: 2,
            systemType: 'MATCH_TIME_CHANGED',
            text: null,
        });
        const blocked = message({ id: '77777777-7777-4777-8777-777777777777', sequence: 3, text: null });
        const client = asClient({
            getMatchConversation: vi.fn().mockResolvedValue({
                backwardCursor: null,
                catchUpCursor: 'cursor',
                conversation: {
                    accessExpiresAt: null,
                    accessThroughSequence: null,
                    id: first.conversationId,
                    lastReadSequence: 0,
                    latestSequence: 3,
                    matchId,
                    state: 'WRITABLE',
                    unreadCount: 3,
                    version: 1,
                },
                messages: [blocked, revised, first, system],
            }),
        });
        render(
            <MemoryRouter>
                <ChatScreen
                    channel="web"
                    client={client}
                    matchId={matchId}
                    online={false}
                    userId={userId}
                    onAuthenticationExpired={vi.fn()}
                />
            </MemoryRouter>
        );

        expect(await screen.findByText('Исправлено')).toBeInTheDocument();
        expect(screen.queryByText('Первое сообщение')).not.toBeInTheDocument();
        expect(screen.getByText('Время матча изменилось')).toBeInTheDocument();
        expect(screen.getByText('Сообщение заблокированного пользователя скрыто')).toBeInTheDocument();
        expect(screen.getByText('изменено')).toBeInTheDocument();
    });

    it('keeps an offline draft locally and never presents it as delivered', async () => {
        const client = asClient({
            getMatchConversation: vi.fn().mockResolvedValue({
                backwardCursor: null,
                catchUpCursor: 'cursor',
                conversation: {
                    accessExpiresAt: null,
                    accessThroughSequence: null,
                    id: crypto.randomUUID(),
                    lastReadSequence: 0,
                    latestSequence: 0,
                    matchId,
                    state: 'WRITABLE',
                    unreadCount: 0,
                    version: 1,
                },
                messages: [],
            }),
            sendConversationMessage: vi.fn(),
        });
        render(
            <MemoryRouter>
                <ChatScreen
                    channel="web"
                    client={client}
                    matchId={matchId}
                    online={false}
                    userId={userId}
                    onAuthenticationExpired={vi.fn()}
                />
            </MemoryRouter>
        );
        const input = await screen.findByLabelText('Сообщение');
        fireEvent.change(input, { target: { value: 'Локальный черновик' } });
        expect(sessionStorage.getItem(`picklehub:chat-draft:${matchId}`)).toBe('Локальный черновик');
        expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
        expect(screen.queryByText('Доставлено')).not.toBeInTheDocument();
        expect(client.sendConversationMessage).not.toHaveBeenCalled();
    });

    it('shows optimistic failure and retries the same logical send key', async () => {
        class SocketStub {
            readonly addEventListener = vi.fn();
            readonly close = vi.fn();
            readonly send = vi.fn();
        }
        vi.stubGlobal('WebSocket', SocketStub);
        const created = message({ authorId: userId, text: 'Сообщение с повтором' });
        const send = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(created);
        const client = asClient({
            getMatchConversation: vi.fn().mockResolvedValue({
                backwardCursor: null,
                catchUpCursor: 'cursor',
                conversation: {
                    accessExpiresAt: null,
                    accessThroughSequence: null,
                    id: created.conversationId,
                    lastReadSequence: 0,
                    latestSequence: 0,
                    matchId,
                    state: 'WRITABLE',
                    unreadCount: 0,
                    version: 1,
                },
                messages: [],
            }),
            getRealtimeTicket: vi.fn().mockResolvedValue('t'.repeat(43)),
            getRealtimeUrl: vi.fn().mockReturnValue('ws://localhost/v1/ws'),
            sendConversationMessage: send,
        });
        render(
            <MemoryRouter>
                <ChatScreen
                    channel="web"
                    client={client}
                    matchId={matchId}
                    online
                    userId={userId}
                    onAuthenticationExpired={vi.fn()}
                />
            </MemoryRouter>
        );
        fireEvent.change(await screen.findByLabelText('Сообщение'), { target: { value: created.text } });
        fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
        expect(await screen.findByText('Не отправлено')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
        await waitFor(() => {
            expect(send).toHaveBeenCalledTimes(2);
            expect(screen.queryByText('Не отправлено')).not.toBeInTheDocument();
        });
        expect(screen.getByText(created.text ?? '')).toBeInTheDocument();
        expect(send.mock.calls[0]?.[2]).toBe(send.mock.calls[1]?.[2]);
    });

    it('shows linked-channel hints and keeps in-app preferences mandatory', async () => {
        const channels = (['ROSTER', 'REQUESTS', 'MATCH_CRITICAL', 'REMINDERS', 'RESULTS', 'CHAT'] as const).flatMap(
            (category) =>
                (['IN_APP', 'TELEGRAM', 'EMAIL'] as const).map((channel) => ({
                    category,
                    channel,
                    enabled: channel === 'IN_APP',
                }))
        );
        const client = asClient({
            getIdentities: vi.fn().mockResolvedValue({ items: [] }),
            getNotificationPreferences: vi.fn().mockResolvedValue({
                channels,
                locale: 'ru-RU',
                quietHours: { enabled: true, endLocal: '08:00', startLocal: '22:00' },
                timeZone: 'Europe/Moscow',
                tzdataVersion: '2026a',
                updatedAt: '2026-09-11T09:00:00.000Z',
                version: 1,
            }),
            listNotifications: vi.fn().mockResolvedValue({
                items: [
                    {
                        category: 'CHAT',
                        createdAt: '2026-09-11T09:00:00.000Z',
                        deliveries: [],
                        id: crypto.randomUUID(),
                        readAt: null,
                        route: 'https://evil.example/chat',
                        type: 'CHAT_MESSAGE',
                    },
                ],
                pageInfo: { hasMore: false, nextCursor: null },
            }),
            markNotificationRead: vi.fn(),
        });
        render(
            <MemoryRouter>
                <NotificationsScreen client={client} online />
            </MemoryRouter>
        );
        expect(await screen.findByText(/Привяжите Telegram/)).toBeInTheDocument();
        expect(screen.getByText(/Привяжите email/)).toBeInTheDocument();
        const inApp = screen.getAllByRole('checkbox', { name: 'В приложении' });
        expect(inApp).toHaveLength(6);
        expect(inApp.every((item) => item.hasAttribute('disabled'))).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: /Новое сообщение в чате/ }));
        expect(await screen.findByText('Ссылка уведомления недоступна.')).toBeInTheDocument();
        expect(client.markNotificationRead).not.toHaveBeenCalled();
    });
});
