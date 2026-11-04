import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Onboarding } from '@picklehub/ui-web';

const meta = {
    title: 'Components/Onboarding',
    component: Onboarding,
    args: {
        steps: [
            {
                placement: 'bottom',
                content: (
                    <>
                        <strong>Создайте свою игру</strong>
                        <p>Выберите площадку и пригласите других игроков.</p>
                    </>
                ),
            },
        ],
        onClose: fn(),
    },
    parameters: { layout: 'fullscreen' },
    render: (args) => (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
            <button data-onboarding="1" style={{ padding: 16 }}>
                Создать игру
            </button>
            <Onboarding {...args} />
        </div>
    ),
} satisfies Meta<typeof Onboarding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        const page = within(canvasElement.ownerDocument.body);
        const dialog = await page.findByRole('dialog');
        const target = within(canvasElement).getByRole('button', { name: 'Создать игру' });
        await expect(dialog).toHaveTextContent('Создайте свою игру');
        await expect(target).toHaveAttribute('aria-describedby', dialog.getAttribute('aria-describedby'));
        const mask = canvasElement.ownerDocument.querySelector('mask rect[fill="black"]')!;
        await waitFor(() => expect(Number(mask.getAttribute('x'))).toBe(target.getBoundingClientRect().left - 8));
        target.style.transform = 'translateX(20px)';
        await waitFor(() => expect(Number(mask.getAttribute('x'))).toBe(target.getBoundingClientRect().left - 8));
        target.style.transform = '';
        await userEvent.click(target);
        await expect(target).toHaveFocus();
        await userEvent.keyboard('{Escape}');
        await expect(args.onClose).toHaveBeenCalledTimes(1);
        await expect(page.queryByRole('dialog')).toBeNull();
        await expect(target).not.toHaveAttribute('aria-describedby');
    },
};

export const ArrowLeft: Story = {
    args: { steps: [{ content: 'Уголок слева, в 15 px от края', arrowPosition: 'left' }] },
};
export const ArrowCenter: Story = {
    args: { steps: [{ content: 'Уголок по центру', arrowPosition: 'center' }] },
};
export const ArrowRight: Story = {
    args: { steps: [{ content: 'Уголок справа, в 15 px от края', arrowPosition: 'right' }] },
};

export const Top: Story = { args: { steps: [{ content: 'Подсказка сверху', placement: 'top' }] } };
export const Left: Story = { args: { steps: [{ content: 'Подсказка слева', placement: 'left' }] } };
export const Right: Story = { args: { steps: [{ content: 'Подсказка справа', placement: 'right' }] } };

export const ViewportEdge: Story = {
    args: { steps: [{ content: 'Подсказка у края', placement: 'top' }] },
    render: (args) => (
        <div>
            <button data-onboarding="1" style={{ position: 'fixed', top: 12, left: 12 }}>
                Создать игру
            </button>
            <Onboarding {...args} />
        </div>
    ),
    play: async ({ canvasElement }) => {
        const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog');
        await waitFor(() => expect(dialog).toHaveAttribute('data-placement', 'bottom'));
        await expect(dialog.getBoundingClientRect().left).toBeGreaterThanOrEqual(12);
        await expect(dialog.getBoundingClientRect().right).toBeLessThanOrEqual(
            canvasElement.ownerDocument.documentElement.clientWidth - 12
        );
    },
};

export const MissingTarget: Story = {
    render: (args) => <Onboarding {...args} />,
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement.ownerDocument.body).queryByRole('dialog')).toBeNull();
        await expect(canvasElement.ownerDocument.querySelector('mask')).toBeNull();
    },
};

export const Steps: Story = {
    args: {
        steps: [
            { content: 'Первый шаг', placement: 'bottom', padding: 4, borderRadius: 6 },
            { content: <strong>Второй шаг</strong>, placement: 'top', padding: 16, borderRadius: 20 },
        ],
        onClose: fn(),
    },
    render: (args) => (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
            <button data-onboarding="2">Мои события</button>
            <button data-onboarding="1">Все события</button>
            <Onboarding {...args} />
        </div>
    ),
    play: async ({ canvasElement, args }) => {
        const page = within(canvasElement.ownerDocument.body);
        const first = within(canvasElement).getByRole('button', { name: 'Все события' });
        const second = within(canvasElement).getByRole('button', { name: 'Мои события' });
        await expect(await page.findByRole('dialog')).toHaveTextContent('Первый шаг');
        await expect(page.getByRole('button', { name: 'Назад' })).toBeDisabled();
        const mask = canvasElement.ownerDocument.querySelector('mask rect[fill="black"]')!;
        await waitFor(() => expect(Number(mask.getAttribute('x'))).toBe(first.getBoundingClientRect().left - 4));
        await userEvent.click(page.getByRole('button', { name: 'Далее' }));
        await expect(page.getByRole('dialog')).toHaveTextContent('Второй шаг');
        await expect(first).not.toHaveAttribute('aria-describedby');
        await expect(second).toHaveAttribute('aria-describedby');
        await waitFor(() => expect(Number(mask.getAttribute('x'))).toBe(second.getBoundingClientRect().left - 16));
        await expect(mask).toHaveAttribute('rx', '20');
        await userEvent.click(page.getByRole('button', { name: 'Назад' }));
        await expect(page.getByRole('dialog')).toHaveTextContent('Первый шаг');
        await userEvent.click(page.getByRole('button', { name: 'Далее' }));
        await userEvent.click(page.getByRole('button', { name: 'Готово' }));
        await expect(args.onClose).toHaveBeenCalledTimes(1);
        await expect(page.queryByRole('dialog')).toBeNull();
        await expect(second).not.toHaveAttribute('aria-describedby');
    },
};

export const EmptySteps: Story = {
    ...MissingTarget,
    args: { steps: [] },
};
