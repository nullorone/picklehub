import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ArrowRight, Download, Heart, Loader2, Mail, Plus } from 'lucide-react';
import { Button } from '@picklehub/ui-web';

const meta = {
    title: 'Components/Button',
    component: Button,
    args: { children: 'Default', onClick: fn() },
    argTypes: {
        glowEffect: { control: 'boolean' },
        asChild: { control: 'boolean' },
        variant: { control: 'select', options: ['default', 'primary', 'accent', 'outline', 'ghost', 'destructive'] },
        size: { control: 'select', options: ['sm', 'default', 'lg', 'icon'] },
    },
    parameters: {
        docs: {
            description: {
                component:
                    'Адаптация EIN Glass Button: пять оригинальных вариантов, размеры 32/40/48 px, cyan–blue–purple градиент и glowEffect. Фон демонстрации соответствует странице EIN; светлая/тёмная тема меняет оболочку каталога.',
            },
        },
    },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
    render: (args) => (
        <div className="flex flex-wrap justify-center gap-4">
            {(['default', 'primary', 'accent', 'outline', 'ghost', 'destructive'] as const).map((variant) => (
                <Button {...args} key={variant} variant={variant}>
                    {variant[0].toUpperCase() + variant.slice(1)}
                </Button>
            ))}
        </div>
    ),
};
export const Default: Story = {};
export const Primary: Story = { args: { variant: 'primary', children: 'Primary' } };
export const Accent: Story = { args: { variant: 'accent', children: 'Accent' } };
export const Outline: Story = { args: { variant: 'outline', children: 'Outline' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Ghost' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Destructive' } };
export const GlowEffect: Story = {
    render: (args) => (
        <div className="flex flex-wrap justify-center gap-4">
            <Button {...args} variant="primary" glowEffect>
                Glow Effect
            </Button>
            <Button {...args} glowEffect>
                Default Glow
            </Button>
            <Button {...args} variant="accent" glowEffect>
                Accent Glow
            </Button>
        </div>
    ),
};
export const WithIcons: Story = {
    render: (args) => (
        <div className="flex flex-wrap justify-center gap-4">
            <Button {...args} variant="primary">
                <Mail aria-hidden="true" />
                Email
            </Button>
            <Button {...args} variant="outline">
                Continue
                <ArrowRight aria-hidden="true" />
            </Button>
            <Button {...args}>
                <Download aria-hidden="true" />
                Download
            </Button>
            <Button {...args} variant="ghost">
                <Heart aria-hidden="true" />
                Like
            </Button>
        </div>
    ),
};
export const Loading: Story = {
    args: { variant: 'primary', disabled: true, 'aria-busy': true },
    render: (args) => (
        <Button {...args}>
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            Loading
        </Button>
    ),
};
export const AsChild: Story = {
    args: { asChild: true, variant: 'outline' },
    render: (args) => (
        <Button {...args}>
            <a href="#details">
                Game details
                <ArrowRight aria-hidden="true" />
            </a>
        </Button>
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('link', { name: 'Game details' })).toHaveAttribute('href', '#details');
        await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    },
};
export const Disabled: Story = {
    args: { disabled: true },
    play: async ({ canvasElement, args }) => {
        const button = within(canvasElement).getByRole('button');
        await expect(button).toBeDisabled();
        await userEvent.click(button, { pointerEventsCheck: 0 });
        button.focus();
        await expect(button).not.toHaveFocus();
        await expect(args.onClick).not.toHaveBeenCalled();
    },
};
export const LongLabel: Story = {
    args: { children: 'Записаться на вечернюю игру в парке вместе с участниками сообщества' },
    render: (args) => (
        <div style={{ width: 260, maxWidth: '100%' }}>
            <Button {...args} className="h-auto max-w-full whitespace-normal" />
        </div>
    ),
};
export const Sizes: Story = {
    render: (args) => (
        <div className="flex flex-wrap items-center gap-4">
            {(['sm', 'default', 'lg'] as const).map((size) => (
                <Button {...args} key={size} size={size}>
                    {size}
                </Button>
            ))}
            <Button {...args} size="icon" aria-label="Add">
                <Plus aria-hidden="true" />
            </Button>
        </div>
    ),
};
export const DarkVariants: Story = {
    globals: { theme: 'dark' },
    render: (args) => (
        <div className="flex flex-wrap gap-4">
            {(['default', 'primary', 'accent', 'outline', 'ghost', 'destructive'] as const).map((variant) => (
                <Button {...args} key={variant} variant={variant}>
                    {variant}
                </Button>
            ))}
        </div>
    ),
};
export const LightVariants: Story = { ...Variants, globals: { theme: 'light' } };
export const Activation: Story = {
    play: async ({ canvasElement, args }) => {
        const button = within(canvasElement).getByRole('button');
        const unfocusedShadow = getComputedStyle(button).boxShadow;
        await userEvent.click(button);
        await expect(args.onClick).toHaveBeenCalledTimes(1);
        button.focus();
        await expect(button).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        await userEvent.keyboard(' ');
        await expect(args.onClick).toHaveBeenCalledTimes(3);
        const style = getComputedStyle(button);
        await expect(style.boxShadow).not.toBe('none');
        await expect(style.boxShadow).not.toBe(unfocusedShadow);
    },
};
const submit = fn();
const buttonRef = createRef<HTMLButtonElement>();
export const InForm: Story = {
    render: (args) => (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <Button {...args} ref={buttonRef}>
                Обычная кнопка
            </Button>
            <Button type="submit">Отправить форму</Button>
        </form>
    ),
    beforeEach: () => {
        submit.mockClear();
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const regular = canvas.getByRole('button', { name: 'Обычная кнопка' });
        await expect(buttonRef.current).toBe(regular);
        await userEvent.click(regular);
        await expect(submit).not.toHaveBeenCalled();
        await userEvent.click(canvas.getByRole('button', { name: 'Отправить форму' }));
        await expect(submit).toHaveBeenCalledTimes(1);
    },
};
