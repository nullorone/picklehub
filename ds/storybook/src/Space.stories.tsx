import type { Meta, StoryObj } from '@storybook/react-vite';
import { Space } from '@picklehub/ui-web';

const meta = {
    title: 'Components/Space',
    component: Space,
    args: {
        padding: 24,
        borderRadius: 16,
        className: 'w-full max-w-md text-white',
        children: 'Любое содержимое внутри Space',
    },
    argTypes: {
        padding: { control: 'number' },
        borderRadius: { control: 'number' },
        children: { control: 'text' },
    },
} satisfies Meta<typeof Space>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomSpacing: Story = {
    args: {
        padding: '16px 32px',
        borderRadius: 32,
    },
};

export const NoPadding: Story = {
    args: { padding: 0, borderRadius: 0 },
};

export const Empty: Story = {
    args: { children: null, className: 'h-32 w-full max-w-md' },
};
