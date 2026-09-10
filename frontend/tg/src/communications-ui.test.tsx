// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { IdentityClient } from '@picklehub/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatScreen } from './communications-ui';

describe('TMA communications', () => {
    afterEach(() => {
        cleanup();
        sessionStorage.clear();
    });

    it('uses the same ordered offline-safe chat behavior in the mini app', async () => {
        const matchId = '11111111-1111-4111-8111-111111111111';
        const client = {
            getMatchConversation: vi.fn().mockResolvedValue({
                backwardCursor: null,
                catchUpCursor: 'cursor',
                conversation: {
                    accessExpiresAt: null,
                    accessThroughSequence: null,
                    id: '22222222-2222-4222-8222-222222222222',
                    lastReadSequence: 0,
                    latestSequence: 0,
                    matchId,
                    state: 'WRITABLE',
                    unreadCount: 0,
                    version: 1,
                },
                messages: [],
            }),
        } as unknown as IdentityClient;
        render(
            <MemoryRouter>
                <ChatScreen
                    channel="telegram"
                    client={client}
                    matchId={matchId}
                    online={false}
                    userId="33333333-3333-4333-8333-333333333333"
                    onAuthenticationExpired={vi.fn()}
                />
            </MemoryRouter>
        );
        expect(await screen.findByRole('heading', { name: 'Чат' })).toBeInTheDocument();
        expect(screen.getByLabelText('Состояние связи')).toHaveTextContent('Без сети');
        expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    });
});
