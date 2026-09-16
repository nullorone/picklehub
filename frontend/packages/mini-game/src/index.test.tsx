// @vitest-environment jsdom

import type { IdentityClient } from '@picklehub/api-client';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MiniGameScreen } from './index';

describe('MiniGameScreen', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: () => ({ matches: false }),
        });
    });

    it('completes an offline calm round without creating or buffering a reward session', async () => {
        const createMiniGameSession = vi.fn();
        const client = { createMiniGameSession } as unknown as IdentityClient;
        let monotonic = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => {
            monotonic += 500;
            return monotonic;
        });
        render(<MiniGameScreen channel="web" client={client} online={false} onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Спокойный/u }));
        fireEvent.click(screen.getByRole('button', { name: 'Обучение и старт' }));
        const tutorialHit = screen.getByRole('button', { name: 'Удар' });
        fireEvent.click(tutorialHit);
        fireEvent.click(tutorialHit);
        fireEvent.click(tutorialHit);
        await screen.findByText('Ходы: 0/20');
        for (let turn = 0; turn < 20; turn += 1) {
            fireEvent.click(screen.getByRole('button', { name: 'Удар' }));
        }

        await waitFor(() => expect(screen.getByRole('heading', { name: 'Ралли завершено' })).toBeInTheDocument());
        expect(screen.getByText(/без награды и отложенной отправки/u)).toBeInTheDocument();
        expect(createMiniGameSession).not.toHaveBeenCalled();
    });
});
