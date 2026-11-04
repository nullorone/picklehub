import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { AgendaCalendarWidget } from '@picklehub/ui-web';

const meta = {
    title: 'Widgets/Calendar/Agenda',
    component: AgendaCalendarWidget,
    args: {
        date: new Date('2026-10-21T09:00:00Z'),
        timeZone: 'Europe/Moscow',
        events: [{ id: 'next', title: 'Элайнеры. Новая встреча', startsAt: '2026-10-28T19:00:00Z' }],
    },
    parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AgendaCalendarWidget>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {
    name: 'Как на скриншоте',
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Событий нет')).toBeVisible();
        await expect(canvas.getByText('среда, 28 окт.')).toBeVisible();
        await expect(canvas.getByText('22:00')).toBeVisible();
    },
};

export const Today: Story = {
    name: 'События сегодня',
    args: {
        events: [
            { id: 'later', title: 'Вечерняя игра', startsAt: '2026-10-21T18:00:00Z', color: '#22d3ee' },
            { id: 'past', title: 'Утренняя игра', startsAt: '2026-10-21T06:00:00Z' },
            { id: 'first', title: 'Открытая тренировка', startsAt: '2026-10-21T12:00:00Z', color: '#c084fc' },
            { id: 'tomorrow', title: 'Завтрашняя игра', startsAt: '2026-10-22T12:00:00Z' },
        ],
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const items = within(canvas.getByRole('list', { name: 'События сегодня' })).getAllByRole('listitem');
        await expect(items).toHaveLength(2);
        await expect(items[0]).toHaveTextContent('Открытая тренировка15:00');
        await expect(canvas.queryByText('Утренняя игра')).not.toBeInTheDocument();
        await expect(canvas.queryByText(/Событий сегодня:/)).not.toBeInTheDocument();
    },
};

export const Empty: Story = {
    name: 'Нет событий',
    args: { events: [] },
};

export const Narrow: Story = {
    name: 'Узкий контейнер',
    render: (args) => (
        <div className="w-[280px] max-w-full">
            <AgendaCalendarWidget {...args} />
        </div>
    ),
    play: async ({ canvasElement }) => {
        const widget = within(canvasElement).getByRole('article', { name: 'Календарь событий' });
        await expect(widget.scrollWidth).toBeLessThanOrEqual(widget.clientWidth);
    },
};

export const TimeZoneBoundary: Story = {
    name: 'Смена даты в часовом поясе',
    args: {
        date: new Date('2026-10-21T22:00:00Z'),
        events: [{ id: 'night', title: 'Ночная игра', startsAt: '2026-10-21T23:00:00Z' }],
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('22')).toBeVisible();
        await expect(canvas.getByRole('list', { name: 'События сегодня' })).toBeVisible();
        await expect(canvas.getByText('02:00')).toBeVisible();
    },
};

export const Month: Story = {
    name: 'Месяц справа',
    args: { variant: 'month' },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const month = canvas.getByRole('table', { name: 'октябрь 2026 г.' });
        await expect(month.querySelector('[aria-current="date"]')).toHaveTextContent('21');
        await expect(within(month).getAllByRole('columnheader')).toHaveLength(7);
        await expect(within(month).getByText('31')).toBeVisible();
        await expect(canvas.getByText('Событий нет')).toBeVisible();
    },
};

export const MonthNarrow: Story = {
    ...Narrow,
    name: 'Месяц в узком контейнере',
    args: { variant: 'month', date: new Date('2026-03-21T09:00:00Z') },
};

export const MonthLeapYear: Story = {
    name: 'Месяц: високосный год и часовой пояс',
    args: { variant: 'month', date: new Date('2024-02-28T22:00:00Z') },
    play: async ({ canvasElement }) => {
        const month = within(canvasElement).getByRole('table', { name: 'февраль 2024 г.' });
        await expect(month.querySelector('[aria-current="date"]')).toHaveTextContent('29');
        await expect(within(month).queryByText('30')).not.toBeInTheDocument();
        const firstWeek = within(month).getAllByRole('row')[1];
        await expect(within(firstWeek).getAllByRole('cell')[3]).toHaveTextContent('1');
    },
};

export const MonthEvents: Story = {
    name: 'Месяц и события слева',
    args: { ...Today.args, variant: 'month-events' },
    play: async (context) => {
        await Today.play?.(context);
        const canvas = within(context.canvasElement);
        const date = canvas.getByLabelText('среда, 21 октября 2026 г.');
        const agenda = canvas.getByRole('list', { name: 'События сегодня' });
        const month = canvas.getByRole('table');
        await expect(agenda.getBoundingClientRect().top).toBeGreaterThan(date.getBoundingClientRect().bottom);
        await expect(agenda.getBoundingClientRect().right).toBeLessThan(month.getBoundingClientRect().left);
        await expect(month.querySelector('[aria-current="date"]')).toHaveTextContent('21');
    },
};

export const MonthEventsUpcoming: Story = {
    name: 'Месяц и ближайшие события',
    args: { variant: 'month-events' },
};

export const MonthEventsEmpty: Story = {
    name: 'Месяц и события: пустой список',
    args: { variant: 'month-events', events: [] },
};

export const MonthEventsNarrow: Story = {
    ...Narrow,
    name: 'Месяц и события в узком контейнере',
    args: { ...Today.args, variant: 'month-events' },
};

export const MonthToday: Story = {
    name: 'Месяц: события сегодня слева',
    args: { ...Today.args, variant: 'month' },
    play: Today.play,
};

export const PastEvents: Story = {
    name: 'Сегодня больше нет событий',
    args: {
        variant: 'month-events',
        events: [{ id: 'past', title: 'Завершённая игра', startsAt: '2026-10-21T06:00:00Z' }],
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Событий нет')).toBeVisible();
        await expect(canvas.queryByRole('list')).not.toBeInTheDocument();
    },
};

export const EventDots: Story = {
    name: 'Точки предстоящих событий',
    args: {
        variant: 'month',
        events: [
            { id: 'today', title: 'Сегодня', startsAt: '2026-10-21T12:00:00Z' },
            { id: 'next', title: 'Следующая игра', startsAt: '2026-10-27T22:00:00Z' },
            { id: 'same', title: 'Ещё игра', startsAt: '2026-10-28T18:00:00Z' },
            { id: 'past', title: 'Прошла', startsAt: '2026-10-20T12:00:00Z' },
            { id: 'other-month', title: 'В ноябре', startsAt: '2026-11-25T12:00:00Z' },
        ],
    },
    play: async ({ canvasElement }) => {
        const month = within(canvasElement).getByRole('table');
        const marked = within(month).getAllByText('— запланированы события');
        await expect(marked).toHaveLength(2);
        await expect(marked[0].parentElement).toHaveTextContent('21');
        await expect(marked[1].parentElement).toHaveTextContent('28');
        await expect(marked[1].parentElement?.querySelector('[aria-hidden="true"]')).toBeVisible();
    },
};

export const MatchingEventColors: Story = {
    name: 'Цвета точек и событий',
    args: {
        variant: 'month-events',
        events: [
            { id: 'purple', title: 'Тренировка', startsAt: '2026-10-21T12:00:00Z', color: '#c084fc' },
            { id: 'cyan', title: 'Игра', startsAt: '2026-10-21T15:00:00Z', color: '#22d3ee' },
            { id: 'default', title: 'Встреча', startsAt: '2026-10-21T18:00:00Z' },
        ],
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const month = canvas.getByRole('table');
        const dots = month.querySelectorAll('[aria-current="date"] [aria-hidden="true"] > span');
        const events = within(canvas.getByRole('list', { name: 'События сегодня' })).getAllByRole('listitem');
        await expect(dots).toHaveLength(3);
        for (let index = 0; index < dots.length; index++) {
            const marker = events[index].querySelector('[aria-hidden="true"]')!;
            await expect(getComputedStyle(dots[index]).backgroundColor).toBe(getComputedStyle(marker).borderColor);
        }
    },
};
