import { GlassBadge } from '@picklehub/ui-web';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
    title: 'Components/Badge',
    component: GlassBadge,
    args: { children: 'Default', onClick: fn() },
    argTypes: {
        variant: { control: 'select', options: ['default', 'primary', 'outline', 'destructive', 'success', 'warning'] },
        size: { control: 'select', options: ['s', 'sm', 'md', 'lg'] },
    },
    parameters: {
        docs: {
            description: {
                component: 'Адаптация EIN Glass Badge',
            },
        },
    },
} satisfies Meta<typeof GlassBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Example1: Story = {
    name: 'Badge Variants',
    render: (args) => (
        <div className="flex flex-wrap gap-4 justify-center">
            <GlassBadge {...args}>Default</GlassBadge>
        </div>
    ),
};
export const Example2: Story = {
    name: 'Tags',
    render: (args) => (
        <div className="flex flex-wrap gap-2 justify-center">
            <GlassBadge {...args}>React</GlassBadge>
        </div>
    ),
};
export const Example3: Story = {
    name: 'Status Indicators',
    render: () => (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <GlassBadge variant="success" className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                Online
            </GlassBadge>
            <GlassBadge variant="warning" className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-amber-400 mr-2" />
                Away
            </GlassBadge>
            <GlassBadge variant="destructive" className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-red-400 mr-2" />
                Offline
            </GlassBadge>
        </div>
    ),
};
export const Example4: Story = {
    name: 'Sizes',
    render: (args) => (
        <div className="flex flex-wrap gap-2 justify-center">
            <GlassBadge variant="primary" size={args?.size}>
                size
            </GlassBadge>
        </div>
    ),
};
