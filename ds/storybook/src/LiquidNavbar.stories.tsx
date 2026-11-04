import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { LiquidNavbar, NimbusIcons } from '@picklehub/ui-web';
import Demo from '../../web/src/components/ui/demo';

const meta = {
    title: 'Components/LiquidNavbar',
    component: LiquidNavbar,
    parameters: { layout: 'fullscreen' },
    args: { sound: false, onChange: fn() },
    decorators: [
        (Story, { args }) => (
            <div
                style={{
                    minHeight: 300,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                    background: args.tone === 'dark' ? '#101d35' : '#DCEBF5',
                }}
            >
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof LiquidNavbar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('button', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
        const profile = canvas.getByRole('button', { name: 'Profile' });
        await userEvent.click(profile);
        await expect(profile).toHaveAttribute('aria-current', 'page');
        await expect(args.onChange).toHaveBeenCalledWith(4, expect.objectContaining({ label: 'Profile' }));
        await userEvent.keyboard('{ArrowRight}');
        await expect(canvas.getByRole('button', { name: 'Главная' })).toHaveFocus();
        await userEvent.keyboard('{ArrowLeft}');
        await expect(profile).toHaveFocus();
        await expect(profile).toHaveAttribute('aria-current', 'page');
    },
};
export const WaterlineDemo: Story = { render: () => <Demo />, decorators: [] };
export const Dark: Story = { args: { tone: 'dark' } };
export const Compact: Story = { args: { compact: true } };
export const Controlled: Story = {
    render: function ControlledNav(args) {
        const [active, setActive] = useState(1);
        return (
            <LiquidNavbar
                {...args}
                active={active}
                onChange={(i, item) => {
                    setActive(i);
                    args.onChange?.(i, item);
                }}
            />
        );
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
        const weather = canvas.getByRole('button', { name: 'Weather' });
        await userEvent.click(weather);
        await expect(weather).toHaveAttribute('aria-current', 'page');
    },
};
export const ControlledUnchanged: Story = {
    args: { active: 0 },
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'Profile' }));
        await expect(args.onChange).toHaveBeenCalled();
        await expect(canvas.getByRole('button', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
    },
};
export const Links: Story = {
    args: {
        items: [
            { label: 'Home', href: '#home', icon: NimbusIcons.home },
            { label: 'Profile', href: '#profile', icon: NimbusIcons.user },
        ],
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const home = canvas.getByRole('link', { name: 'Home' });
        home.focus();
        await userEvent.keyboard('{ArrowRight}');
        await expect(canvas.getByRole('link', { name: 'Profile' })).toHaveFocus();
        await expect(home).toHaveAttribute('aria-current', 'page');
        await expect(canvas.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#profile');
    },
};
export const MultipleInstances: Story = {
    render: () => (
        <>
            <LiquidNavbar aria-label="Primary" />
            <LiquidNavbar aria-label="Secondary" compact />
        </>
    ),
    play: async ({ canvasElement }) => {
        const ids = Array.from(canvasElement.querySelectorAll('filter')).map((el) => el.id);
        await expect(new Set(ids).size).toBe(2);
    },
};
export const Empty: Story = {
    args: { items: [] },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).queryAllByRole('button')).toHaveLength(0);
    },
};
export const TextOnly: Story = {
    args: { compact: true, defaultActive: 100, items: [{ label: 'Games' }, { label: 'Profile' }] },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByRole('button', { name: 'Profile' })).toHaveAttribute(
            'aria-current',
            'page'
        );
        await expect(canvasElement.querySelector('.nimbus-label')).toHaveStyle({ position: 'static' });
    },
};
export const ContextLossFallback: Story = {
    play: async ({ canvasElement }) => {
        const canvas = canvasElement.querySelector('canvas');
        canvas?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        const scope = within(canvasElement);
        await waitFor(() => expect(scope.getByRole('navigation')).toHaveAttribute('data-gl', 'off'));
        const profile = scope.getByRole('button', { name: 'Profile' });
        await userEvent.click(profile);
        await expect(profile).toHaveAttribute('aria-current', 'page');
        await expect(canvasElement.querySelector('.nimbus-drop')).toBeVisible();
    },
};
