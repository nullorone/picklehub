import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { EventCreatedDialog } from '@picklehub/ui-web';

const meta = {
    title: 'Components/EventCreatedDialog',
    component: EventCreatedDialog,
    args: {
        open: true,
        startsAt: '2026-11-15T15:30:00.000Z',
        timeZone: 'Europe/Moscow',
        onClose: fn(),
        onShare: fn(),
    },
} satisfies Meta<typeof EventCreatedDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        const page = within(canvasElement.ownerDocument.body);
        const dialog = within(await page.findByRole('dialog', { name: 'Событие успешно создано' }));
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            await waitFor(async () => {
                const canvas = canvasElement.ownerDocument.querySelector('[data-event-confetti]');
                await expect(canvas).toBeVisible();
                await expect(canvas).toHaveAttribute('aria-hidden', 'true');
                await expect(canvas).toHaveStyle({ pointerEvents: 'none' });
            });
        }
        await expect(dialog.getByText('15 ноября 2026 г.')).toBeVisible();
        await expect(dialog.getByText('18:30', { exact: true })).toBeVisible();
        await userEvent.click(dialog.getByRole('button', { name: 'Поделиться' }));
        await expect(args.onShare).toHaveBeenCalledOnce();
        await expect(args.onClose).not.toHaveBeenCalled();
        await userEvent.click(dialog.getByRole('button', { name: 'Посмотреть' }));
        await expect(args.onClose).toHaveBeenCalledOnce();
    },
};

export const Shared: Story = {
    args: { shareMessage: 'Ссылка скопирована. Отправьте её игрокам!' },
};

export const Narrow: Story = {
    globals: { viewport: { value: 'narrow', isRotated: false } },
};
