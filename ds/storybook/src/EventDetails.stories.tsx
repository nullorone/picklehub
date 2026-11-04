import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { EventDetails, type EventDetailsParticipant } from '../../../frontend/tg/src/components/EventDetails';

const people: EventDetailsParticipant[] = [
    { id: '1', name: 'Анна Смирнова', dupr: '3.75' },
    { id: '2', name: 'Михаил Волков', dupr: '4.10' },
    { id: '3', name: 'Александра Константинопольская' },
    { id: '4', name: 'Иван Петров', dupr: '3.50' },
];
const meta = {
    title: 'Mini App/EventDetails',
    component: EventDetails,
    parameters: { layout: 'fullscreen' },
    args: {
        event: {
            id: 101,
            type: 'tournament',
            organizer: {
                firstName: 'Ярослав',
                lastName: 'Свешников',
                phone: '+79671011017',
                telegramUsername: 'nullorone',
            },
            name: 'Осенний кубок PickleHub',
            schedule: {
                startAt: '2026-11-15T09:00:00Z',
                endAt: '2026-11-15T13:00:00Z',
                timeSlots: [],
                registrationDeadline: '14 ноября 2026, 18:00',
            },
            location: { name: 'Клуб PickleHub · Корт № 2', link: 'https://example.com/venue' },
            participants: 4,
            maxParticipants: 8,
            entryFee: 1500,
            prize: 'Кубки и медали призёрам',
            status: 'upcoming',
            rating: '3.0–4.5',
            format: 'American',
        },
        description: 'Дружеский турнир для любителей пиклбола.\nПриходите за 20 минут до начала для разминки.',
        participants: people,
        waitlist: [],
        onJoin: fn(),
    },
} satisfies Meta<typeof EventDetails>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Upcoming: Story = {
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('tab', { name: 'Основное' })).toHaveAttribute('aria-selected', 'true');
        await expect(canvas.getByRole('link', { name: 'Открыть место в Яндекс Картах' })).toHaveAttribute(
            'href',
            `https://yandex.ru/maps/?text=${encodeURIComponent(args.event.location.name)}`
        );
        await expect(canvas.getByRole('link', { name: 'Открыть место в Google Maps' })).toHaveAttribute(
            'href',
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(args.event.location.name)}`
        );
        await userEvent.click(canvas.getByRole('button', { name: 'Присоединиться' }));
        await expect(args.onJoin).toHaveBeenCalledWith('join');
        await userEvent.click(canvas.getByRole('tab', { name: 'Участники' }));
        await waitFor(() => expect(canvas.getByText('Анна Смирнова')).toBeVisible());
        await waitFor(() => expect(canvas.getByText('-/-')).toBeVisible());
        await waitFor(() => expect(canvas.getByText('В списке ожидания пока никого нет.')).toBeVisible());
        await userEvent.keyboard('{ArrowRight}');
        await expect(canvas.getByRole('tab', { name: 'Игра' })).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => expect(canvas.getByText('Информация об игре пока недоступна.')).toBeVisible());
        await userEvent.keyboard('{ArrowRight}');
        await expect(canvas.getByRole('tab', { name: 'Результаты' })).toHaveAttribute('aria-selected', 'true');
        await waitFor(() =>
            expect(canvas.getByText('Событие ещё не завершилось. Результаты появятся позже.')).toBeVisible()
        );
    },
};
export const Full: Story = {
    args: { event: { ...meta.args.event, maxParticipants: 4 }, waitlist: [{ id: '5', name: 'Ольга Соколова' }] },
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'В список ожидания' }));
        await expect(args.onJoin).toHaveBeenCalledWith('waitlist');
        await userEvent.click(canvas.getByRole('tab', { name: 'Участники' }));
        await waitFor(() => expect(canvas.getByText('Ольга Соколова')).toBeVisible());
    },
};
export const Completed: Story = {
    args: { event: { ...meta.args.event, status: 'completed' } },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('button', { name: 'Событие завершено' })).toBeDisabled();
        await expect(canvas.getByRole('tab', { name: 'Результаты' })).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => expect(canvas.getByText('Здесь будут результаты участников')).toBeVisible());
        await userEvent.click(canvas.getByRole('tab', { name: 'Основное' }));
        await expect(canvas.getByRole('tab', { name: 'Основное' })).toHaveAttribute('aria-selected', 'true');
    },
};
export const Ongoing: Story = { args: { event: { ...meta.args.event, status: 'ongoing' } } };
export const FreeAndEmpty: Story = {
    args: {
        event: { ...meta.args.event, entryFee: 0, participants: 0, prize: '' },
        participants: [],
        coverUrl: undefined,
        description: undefined,
    },
};
export const Joined: Story = {
    args: { registrationState: 'joined' },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByRole('button', { name: 'Вы участвуете' })).toBeDisabled();
    },
};
export const Waitlisted: Story = { args: { registrationState: 'waitlisted' } };
export const Pending: Story = {
    args: { isPending: true },
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByRole('button', { name: 'Отправляем…' })).toBeDisabled();
    },
};
export const StickyHeader: Story = {
    args: { stickyTop: 56, description: Array.from({ length: 12 }, () => meta.args.description).join('\n\n') },
    render: (args) => (
        <div data-scroll-example="" style={{ height: 640, width: 320, overflow: 'auto', position: 'relative' }}>
            <div style={{ position: 'sticky', top: 0, height: 56, zIndex: 30, background: 'var(--ds-background)' }}>
                PickleHub
            </div>
            <EventDetails {...args} />
        </div>
    ),
    play: async ({ canvasElement }) => {
        const scroll = canvasElement.querySelector<HTMLElement>('[data-scroll-example]')!;
        const bar = canvasElement.querySelector<HTMLElement>('[data-event-registration]')!;
        const tabs = canvasElement.querySelector<HTMLElement>('[data-event-tabs]')!;
        scroll.scrollTop = 420;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await expect(Math.abs(bar.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 56)).toBeLessThan(
            2
        );
        await expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
        await expect(Math.abs(tabs.getBoundingClientRect().top - bar.getBoundingClientRect().bottom)).toBeLessThan(2);
        const sticky = bar.parentElement!;
        const content = sticky.nextElementSibling as HTMLElement;
        await expect(getComputedStyle(sticky).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        const clippedTop = Number.parseFloat(content.style.clipPath.slice('inset('.length));
        await expect(clippedTop).toBeGreaterThan(0);
        await expect(
            Math.abs(content.getBoundingClientRect().top + clippedTop - sticky.getBoundingClientRect().bottom)
        ).toBeLessThan(2);
        const canvas = within(canvasElement);
        const initialScrollTop = scroll.scrollTop;
        const initialScrollHeight = scroll.scrollHeight;
        for (const name of ['Участники', 'Игра', 'Результаты', 'Основное']) {
            await userEvent.click(canvas.getByRole('tab', { name }));
            await expect(canvas.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
            await expect(canvas.getAllByRole('tabpanel')).toHaveLength(1);
            await expect(scroll.scrollHeight).toBe(initialScrollHeight);
            await expect(scroll.scrollTop).toBe(initialScrollTop);
            await expect(
                Math.abs(bar.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 56)
            ).toBeLessThan(2);
        }
        scroll.style.width = '430px';
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
        await expect(Math.abs(tabs.getBoundingClientRect().top - bar.getBoundingClientRect().bottom)).toBeLessThan(2);
        await expect(Math.abs(bar.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 56)).toBeLessThan(
            2
        );
    },
};

export const Organizer: Story = {
    args: {
        event: { ...meta.args.event, organizer: { ...meta.args.event.organizer, id: 'organizer' } },
        currentUserId: 'organizer',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const edit = canvas.getByRole('button', { name: 'Редактировать' });
        const cancel = canvas.getByRole('button', { name: 'Отменить событие' });
        await expect(edit).toBeVisible();
        await expect(cancel).toBeVisible();
        await expect(Math.abs(edit.getBoundingClientRect().top - cancel.getBoundingClientRect().top)).toBeLessThan(2);
        await expect(edit.getBoundingClientRect().bottom).toBeGreaterThan(
            canvas.getByRole('button', { name: 'Присоединиться' }).getBoundingClientRect().bottom
        );
    },
};
export const OtherParticipant: Story = {
    args: {
        event: { ...meta.args.event, organizer: { ...meta.args.event.organizer, id: 'organizer' } },
        currentUserId: 'participant',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
        await expect(canvas.queryByRole('button', { name: 'Отменить событие' })).not.toBeInTheDocument();
    },
};
export const Anonymous: Story = {
    args: { event: { ...meta.args.event, organizer: { ...meta.args.event.organizer, id: 'organizer' } } },
    play: OtherParticipant.play,
};

export const VenueAddress: Story = {
    args: {
        event: {
            ...meta.args.event,
            location: {
                ...meta.args.event.location,
                address: 'Москва, ул. Примерная, 10/2 & корпус #3',
            },
        },
    },
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        const address = args.event.location.address!;
        await waitFor(() => expect(canvas.getByText(address)).toBeVisible());
        const yandex = canvas.getByRole('link', { name: 'Открыть место в Яндекс Картах' });
        const google = canvas.getByRole('link', { name: 'Открыть место в Google Maps' });
        await expect(yandex).toBeVisible();
        await expect(google).toBeVisible();
        await expect(yandex).toHaveAttribute('href', `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`);
        await expect(google).toHaveAttribute(
            'href',
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
        );
        await expect(yandex).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(google).toHaveAttribute('rel', 'noopener noreferrer');
    },
};

export const OrganizerFullName: Story = {
    args: {
        event: {
            ...meta.args.event,
            organizer: {
                firstName: 'Ярослав',
                lastName: 'Свешников',
                phone: '+79671011017',
                telegramUsername: 'nullorone',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitFor(() => expect(canvas.getByText('Ярослав Свешников')).toBeVisible());
        await expect(
            canvas.getByRole('link', { name: 'Написать организатору Ярослав Свешников в Telegram' })
        ).toHaveAttribute('href', 'https://t.me/nullorone');
        await expect(canvas.queryByText('@nullorone')).not.toBeInTheDocument();
    },
};
export const OrganizerUsername: Story = {
    args: {
        event: {
            ...meta.args.event,
            organizer: { firstName: ' ', lastName: ' ', telegramUsername: '@nullorone' },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitFor(() => expect(canvas.getByText('@nullorone')).toBeVisible());
        await expect(canvas.queryByRole('link', { name: /Позвонить организатору/ })).not.toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: 'Написать организатору @nullorone в Telegram' })).toHaveAttribute(
            'href',
            'https://t.me/nullorone'
        );
    },
};

export const OrganizerLongName: Story = {
    args: {
        event: {
            ...meta.args.event,
            organizer: {
                firstName: 'ОченьДлинноеИмяОрганизатора',
                lastName: 'ОченьДлиннаяФамилияОрганизатора',
                phone: '+79671011017',
                telegramUsername: 'nullorone',
            },
        },
    },
    decorators: [
        (Story) => (
            <div style={{ width: 280 }}>
                <Story />
            </div>
        ),
    ],
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        const name = canvas.getByTitle(`${args.event.organizer.firstName} ${args.event.organizer.lastName}`);
        await waitFor(() => expect(name).toBeVisible());
        const row = name.parentElement!;
        const avatar = row.firstElementChild!;
        const organizer = within(row.parentElement!);
        const telegram = organizer.getByRole('link', { name: /в Telegram/ });
        const phone = organizer.getByRole('link', { name: /Позвонить организатору/ });
        await expect(telegram.getBoundingClientRect().top).toBeGreaterThan(avatar.getBoundingClientRect().bottom);
        await expect(telegram.getBoundingClientRect().left).toBe(avatar.getBoundingClientRect().left);
        await expect(phone.getBoundingClientRect().top).toBe(telegram.getBoundingClientRect().top);
        await expect(phone).toHaveAttribute('href', 'tel:+79671011017');
        await expect(phone.getBoundingClientRect().width).toBe(44);
        await expect(avatar.getBoundingClientRect().width).toBe(44);
        await expect(telegram.getBoundingClientRect().width).toBe(44);
        await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
        await expect(getComputedStyle(name).textOverflow).toBe('ellipsis');
        await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    },
};
