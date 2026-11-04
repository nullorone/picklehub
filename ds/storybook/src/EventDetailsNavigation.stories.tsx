import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Card } from '../../../frontend/tg/src/components/Card/Card';
import { EventDetailsPage } from '../../../frontend/tg/src/pages/EventDetails/EventDetailsPage';
import { tournaments } from '../../../frontend/tg/src/pages/EventList/mock';
import { Provider } from 'react-redux';
import { store } from '../../../frontend/tg/src/store/store';

const event = { ...tournaments[1], name: 'Событие из выбранной карточки', entryFee: 2350 };
function NavigationExample({ initialPath = '/' }: { initialPath?: string }) {
    return (
        <Provider store={store}>
            <MemoryRouter initialEntries={[initialPath]}>
                <Routes>
                    <Route path="/" element={<Card {...event} />} />
                    <Route path="/event/:eventId/details" element={<EventDetailsPage />} />
                    <Route path="/event/list" element={<p>Список событий</p>} />
                </Routes>
            </MemoryRouter>
        </Provider>
    );
}
const meta = { title: 'Mini App/EventDetailsNavigation', component: NavigationExample } satisfies Meta<
    typeof NavigationExample
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FromCard: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('link', { name: 'Подробнее' }));
        await expect(canvas.getByRole('heading', { name: event.name })).toBeVisible();
        await expect(canvas.getByText(/2\s*350 ₽/)).toBeVisible();
        await waitFor(() =>
            expect(
                canvas.getByText(
                    new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
                        new Date(event.schedule.startAt)
                    )
                )
            ).toBeVisible()
        );
        await waitFor(() => expect(canvas.getByText(event.location.name)).toBeVisible());
        await expect(canvas.queryByRole('link', { name: event.location.name })).not.toBeInTheDocument();
        await userEvent.click(canvas.getByRole('tab', { name: 'Участники' }));
        await waitFor(() => expect(canvas.getByText('Список участников пока недоступен.')).toBeVisible());
        await userEvent.click(canvas.getByRole('link', { name: '← Все события' }));
        await expect(canvas.getByText('Список событий')).toBeVisible();
    },
};
export const DirectLink: Story = {
    args: { initialPath: `/event/${tournaments[0].id}/details` },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('heading', { name: tournaments[0].name })).toBeVisible();
        await expect(canvas.getByRole('button', { name: 'Присоединиться' })).toBeDisabled();
    },
};
export const MissingEvent: Story = {
    args: { initialPath: '/event/unknown/details' },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Событие не найдено.');
    },
};
