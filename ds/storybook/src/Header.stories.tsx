import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { Header } from '@picklehub/ui-web';

const meta = {
    title: 'Components/Header',
    component: Header,
    args: { displayName: 'Анна Петрова', onProfileClick: fn(), onNotificationsClick: fn() },
    render: (args) => (
        <div className="w-full bg-ds-background">
            <Header {...args} />
        </div>
    ),
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvas, userEvent, args }) => {
        const title = canvas.getByText('PICKLEHUB');
        const header = title.closest('header')!;
        const titleRect = title.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        await expect(Math.abs(titleRect.x + titleRect.width / 2 - headerRect.x - headerRect.width / 2)).toBeLessThan(1);
        await expect(getComputedStyle(title).letterSpacing).toBe('2px');
        await expect(getComputedStyle(title).fontWeight).toBe('300');
        await expect(canvas.getByText('А')).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Профиль' }));
        await expect(args.onProfileClick).toHaveBeenCalledOnce();
        await userEvent.click(canvas.getByRole('button', { name: 'Уведомления' }));
        await expect(args.onNotificationsClick).toHaveBeenCalledOnce();
    },
};

export const WithPhoto: Story = { args: { avatarSrc: '/avatar-woman.png' } };
export const WithNotifications: Story = {
    args: { hasNotifications: true },
    play: async ({ canvas, userEvent, args }) => {
        const button = canvas.getByRole('button', { name: 'Уведомления, есть новые' });
        await expect(button).toBeVisible();
        await userEvent.click(button);
        await expect(args.onNotificationsClick).toHaveBeenCalledOnce();
    },
};
export const Narrow: Story = {
    render: (args) => (
        <div style={{ width: 320 }} className="bg-ds-background">
            <Header {...args} />
        </div>
    ),
};
