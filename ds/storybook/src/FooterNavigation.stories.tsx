import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import { Footer } from '../../../frontend/tg/src/components/Footer';

function NavigationExample() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    return (
        <>
            <output aria-label="Текущий маршрут">{pathname}</output>
            <Link to="/event/example/details">Открыть событие</Link>
            <button onClick={() => navigate(-1)}>Назад</button>
            <Footer />
        </>
    );
}
const meta = {
    title: 'Mini App/FooterNavigation',
    component: NavigationExample,
    decorators: [
        (Story) => (
            <MemoryRouter>
                <Story />
            </MemoryRouter>
        ),
    ],
} satisfies Meta<typeof NavigationExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HomeFromEvent: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('link', { name: 'Открыть событие' }));
        await expect(canvas.getByLabelText('Текущий маршрут')).toHaveTextContent('/event/example/details');
        await userEvent.click(canvas.getByRole('button', { name: 'Главная' }));
        await expect(canvas.getByLabelText('Текущий маршрут')).toHaveTextContent(/^\/$/);
    },
};
export const RouteSelection: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const profile = canvas.getByRole('button', { name: 'Профиль' });
        const create = canvas.getByRole('button', { name: 'Создать' });
        await userEvent.click(profile);
        await expect(canvas.getByLabelText('Текущий маршрут')).toHaveTextContent('/profile');
        await expect(profile).toHaveAttribute('aria-current', 'page');
        await userEvent.click(create);
        await expect(canvas.getByLabelText('Текущий маршрут')).toHaveTextContent('/event/new');
        await expect(create).toHaveAttribute('aria-current', 'page');
        await userEvent.click(canvas.getByRole('button', { name: 'Назад' }));
        await expect(profile).toHaveAttribute('aria-current', 'page');
        await userEvent.click(canvas.getByRole('button', { name: 'Главная' }));
        await expect(canvas.getByLabelText('Текущий маршрут')).toHaveTextContent(/^\/$/);
    },
};
