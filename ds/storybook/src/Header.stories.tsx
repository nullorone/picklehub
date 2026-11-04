import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Header } from '@picklehub/ui-web';

const meta = {
    title: 'Components/Header',
    component: Header,
    render: (args) => (
        <div className="w-full max-w-lg bg-ds-background">
            <Header {...args} />
        </div>
    ),
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvas }) => {
        const title = canvas.getByText('PICKLEHUB');
        const header = title.closest('header')!;
        const titleRect = title.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        await expect(Math.abs(titleRect.x + titleRect.width / 2 - headerRect.x - headerRect.width / 2)).toBeLessThan(1);
        await expect(getComputedStyle(title).letterSpacing).toBe('10px');
        await expect(getComputedStyle(title).fontWeight).toBe('300');
        await expect(canvas.getByText(/PICKLEBALL/)).toBeVisible();
    },
};
export const Narrow: Story = {
    render: (args) => (
        <div style={{ width: 320 }} className="bg-ds-background">
            <Header {...args} />
        </div>
    ),
};
