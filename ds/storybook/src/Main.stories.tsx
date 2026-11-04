import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, waitFor, within } from 'storybook/test';
// import { fn } from 'storybook/test';
import { Main } from '../../../frontend/tg/src/pages/Main';
import { createAppStore } from '../../../frontend/tg/src/store/store';

const meta = {
    title: 'Mini App/Main',
    component: Main,
    decorators: [
        function Decorator(Story) {
            const [store] = useState(createAppStore);
            return (
                <Provider store={store}>
                    <MemoryRouter>
                        <Story />
                    </MemoryRouter>
                </Provider>
            );
        },
    ],
} satisfies Meta<typeof Main>;
export default meta;
type Story = StoryObj<typeof meta>;

/* Проверка отправки ссылки временно отключена вместе с кнопкой.
export const ShareEvent: Story = {
    beforeEach: () => {
        const original = Object.getOwnPropertyDescriptor(navigator, 'share');
        Object.defineProperty(navigator, 'share', { configurable: true, value: fn().mockResolvedValue(undefined) });
        return () => {
            if (original) Object.defineProperty(navigator, 'share', original);
            else Reflect.deleteProperty(navigator, 'share');
        };
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const button = canvas.getByRole('button', { name: 'Поделиться событием «Summer Championship 2024»' });
        await expect(button.getBoundingClientRect().width).toBe(40);
        await expect(button.getBoundingClientRect().height).toBe(40);
        await expect(parseFloat(getComputedStyle(button).borderRadius)).toBeGreaterThanOrEqual(20);
        await userEvent.click(button);
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '/event/1/details';
        await expect(navigator.share).toHaveBeenCalledWith({ title: 'Summer Championship 2024', url: url.toString() });
    },
};

*/

export const EventFilters: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('tab', { name: 'Все' })).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => expect(canvas.getByText('Summer Championship 2024')).toBeVisible());
        await userEvent.click(canvas.getByRole('tab', { name: 'Архив' }));
        await waitFor(() => expect(canvas.getByText('Weekend Warriors Cup')).toBeVisible());
        await expect(canvas.queryByText('Summer Championship 2024')).not.toBeInTheDocument();
        await userEvent.click(canvas.getByRole('tab', { name: 'Мои' }));
        await expect(canvas.getByRole('status')).toHaveTextContent('У вас пока нет событий.');
        await userEvent.click(canvas.getByRole('tab', { name: 'Все' }));
        await waitFor(() => expect(canvas.getByText('Summer Championship 2024')).toBeVisible());
        await expect(canvas.queryByText('Weekend Warriors Cup')).not.toBeInTheDocument();
    },
};

export const FilterDialog: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const page = within(canvasElement.ownerDocument.body);
        const trigger = canvas.getByRole('button', { name: 'Открыть фильтры' });
        await userEvent.click(trigger);
        const dialog = await page.findByRole('dialog', { name: 'Фильтры' });
        const apply = within(dialog).getByRole('button', { name: 'Применить' });
        const close = within(dialog).getByRole('button', { name: 'Закрыть' });
        await waitFor(() => expect(dialog).toBeVisible());
        await expect(close.getBoundingClientRect().top).toBeGreaterThanOrEqual(apply.getBoundingClientRect().bottom);
        await userEvent.click(close);
        await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
        await expect(trigger).toHaveFocus();
        await userEvent.click(trigger);
        await userEvent.click(within(await page.findByRole('dialog')).getByRole('button', { name: 'Применить' }));
        await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    },
};

export const EventTypeFilter: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const page = within(canvasElement.ownerDocument.body);
        const select = canvas.getByRole('combobox', { name: 'Тип события' });
        const button = canvas.getByRole('button', { name: 'Открыть фильтры' });
        const tabs = canvas.getByRole('tablist', { name: 'Категории событий' });
        await expect(select).toHaveTextContent('Любое');
        await expect(button.getBoundingClientRect().top).toBeGreaterThanOrEqual(tabs.getBoundingClientRect().bottom);
        await expect(select.getBoundingClientRect().left).toBeGreaterThan(button.getBoundingClientRect().left);
        await userEvent.click(select);
        for (const name of ['Любое', 'Play On', 'Турнир', 'Тренировка']) {
            await expect(page.getByRole('option', { name })).toBeVisible();
        }
        await userEvent.click(page.getByRole('option', { name: 'Play On' }));
        await expect(canvas.getByRole('status')).toHaveTextContent('Событий пока нет.');
        await userEvent.click(select);
        await userEvent.click(page.getByRole('option', { name: 'Турнир' }));
        await waitFor(() => expect(canvas.getByText('Summer Championship 2024')).toBeVisible());
    },
};

export const Locations: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const page = within(canvasElement.ownerDocument.body);
        const trigger = canvas.getByRole('button', { name: 'Локации' });
        const filter = canvas.getByRole('button', { name: 'Открыть фильтры' });
        const select = canvas.getByRole('combobox', { name: 'Тип события' });
        await expect(trigger.getBoundingClientRect().left).toBeGreaterThanOrEqual(filter.getBoundingClientRect().right);
        await expect(select.getBoundingClientRect().left).toBeGreaterThanOrEqual(trigger.getBoundingClientRect().right);
        await userEvent.click(trigger);
        const dialog = within(await page.findByRole('dialog', { name: 'Локации' }));
        const input = dialog.getByRole('searchbox', { name: 'Ваша локация' });
        await expect(dialog.getByRole('button', { name: 'Применить' })).toBeDisabled();
        await userEvent.type(input, 'неизвестная');
        await expect(dialog.getByRole('status')).toHaveTextContent('Локации не найдены.');
        await userEvent.clear(input);
        await userEvent.type(input, 'моск');
        await expect(dialog.queryByRole('radio', { name: 'Казань' })).not.toBeInTheDocument();
        await userEvent.click(dialog.getByRole('radio', { name: 'Москва' }));
        await userEvent.click(dialog.getByRole('button', { name: 'Применить' }));
        await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
        await expect(trigger).toHaveFocus();
        await expect(trigger).toHaveAttribute('title', 'Москва');
        await userEvent.click(trigger);
        const reopened = within(await page.findByRole('dialog', { name: 'Локации' }));
        await expect(reopened.getByRole('radio', { name: 'Москва' })).toBeChecked();
        await expect(reopened.getByRole('region', { name: 'Выбранная локация' })).toHaveTextContent('Москва');
        await expect(reopened.getByRole('region', { name: 'Выбранная локация' })).toHaveTextContent('Выбрана вручную');
        await userEvent.click(reopened.getByRole('radio', { name: 'Казань' }));
        await userEvent.click(reopened.getByRole('button', { name: 'Закрыть' }));
        await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
        await expect(trigger).toHaveAttribute('title', 'Москва');
    },
};
