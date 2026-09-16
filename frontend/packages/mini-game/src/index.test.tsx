// @vitest-environment jsdom

import type { IdentityClient } from '@picklehub/api-client';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MiniGameScreen } from './index';

describe('MiniGameScreen', () => {
    beforeEach(() => {
        cleanup();
        vi.restoreAllMocks();
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: () => ({ matches: false }),
        });
    });

    it('completes an offline calm round without creating or buffering a reward session', async () => {
        const createMiniGameSession = vi.fn();
        const client = { createMiniGameSession } as unknown as IdentityClient;
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

    it('defaults to calm mode for reduced motion and pauses input on blur until explicit resume', async () => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: () => ({ matches: true }),
        });
        const client = { createMiniGameSession: vi.fn() } as unknown as IdentityClient;
        render(<MiniGameScreen channel="telegram" client={client} online={false} onClose={vi.fn()} />);

        expect(screen.getByRole('button', { name: /Спокойный/u })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Обучение и старт' }));
        const tutorialHit = screen.getByRole('button', { name: 'Удар' });
        fireEvent.click(tutorialHit);
        fireEvent.click(tutorialHit);
        fireEvent.click(tutorialHit);
        await screen.findByText('Ходы: 0/20');

        fireEvent.blur(window);
        expect(await screen.findByRole('dialog', { name: 'Пауза' })).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(screen.getByText('Ходы: 0/20')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(screen.getByText('Ходы: 1/20')).toBeInTheDocument();
    });

    it('keeps sound opt-in and stops active advertising during tutorial and play', () => {
        const start = vi.fn();
        const stop = vi.fn();
        const close = vi.fn();
        const oscillator = {
            addEventListener: (_name: string, listener: () => void) => {
                listener();
            },
            connect: vi.fn(),
            frequency: { value: 0 },
            start,
            stop,
        };
        Object.defineProperty(window, 'AudioContext', {
            configurable: true,
            value: class {
                currentTime = 0;
                destination = {};
                createGain = () => ({ connect: vi.fn(), gain: { value: 0 } });
                createOscillator = () => oscillator;
                close = close;
            },
        });
        const client = { createMiniGameSession: vi.fn() } as unknown as IdentityClient;
        const first = render(<MiniGameScreen channel="web" client={client} online={false} onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Обучение и старт' }));
        expect(first.container.querySelector('[data-ad-free="true"]')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Удар' }));
        expect(start).not.toHaveBeenCalled();
        first.unmount();

        render(<MiniGameScreen channel="web" client={client} online={false} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Звук' }));
        fireEvent.click(screen.getByRole('button', { name: 'Обучение и старт' }));
        fireEvent.click(screen.getByRole('button', { name: 'Удар' }));
        expect(start).toHaveBeenCalledTimes(1);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
    });
});
