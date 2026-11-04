import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { HorizontalCalendarWidget } from '@picklehub/ui-web';

const meta = {
    title: 'Widgets/Calendar/Horizontal',
    component: HorizontalCalendarWidget,
    args: { date: new Date('2026-10-21T09:00:00Z'), timeZone: 'Europe/Moscow', months: 4 },
    argTypes: { months: { control: { type: 'number', min: 1, max: 24 } } },
} satisfies Meta<typeof HorizontalCalendarWidget>;
export default meta;
type Story = StoryObj<typeof meta>;

async function centerDate(element: HTMLElement, date: string) {
    const region = within(element).getByRole('region');
    const target = region.querySelector(`time[datetime="${date}"]`)!;
    const bounds = target.getBoundingClientRect();
    const viewport = region.getBoundingClientRect();
    region.scrollLeft += bounds.left + bounds.width / 2 - viewport.left - viewport.width / 2;
    await fireEvent.scroll(region);
}

export const Default: Story = {
    name: 'Горизонтальный календарь',
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('октябрь')).toBeVisible();
        const today = canvas.getByRole('button', { name: 'среда, 21 октября 2026 г.' });
        await expect(today).toHaveAttribute('aria-pressed', 'true');
        const previous = canvas.getByRole('button', { name: 'вторник, 20 октября 2026 г.' });
        await userEvent.click(previous);
        await expect(previous).toHaveAttribute('aria-pressed', 'true');
        await expect(today).toHaveAttribute('aria-pressed', 'false');
        await centerDate(canvasElement, '2026-11-01');
        await expect(canvas.getByText('октябрь')).toBeVisible();
        await centerDate(canvasElement, '2026-11-02');
        await expect(canvas.getByText('ноябрь')).toBeVisible();
        await centerDate(canvasElement, '2026-10-31');
        await expect(canvas.getByText('октябрь')).toBeVisible();
    },
};

export const YearBoundary: Story = {
    name: 'Переход года',
    args: { date: new Date('2026-12-31T09:00:00Z'), months: 2 },
    play: async ({ canvasElement }) => {
        await centerDate(canvasElement, '2027-01-02');
        await expect(within(canvasElement).getByText('январь')).toBeVisible();
    },
};

export const InitialSelectedDate: Story = {
    name: 'Начальная дата из props',
    args: { selectedDate: '2026-10-20' },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('button', { name: 'вторник, 20 октября 2026 г.' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        await expect(canvas.getByRole('button', { name: 'среда, 21 октября 2026 г.' })).toHaveAttribute(
            'aria-pressed',
            'false'
        );
    },
};

export const PreviousMonths: Story = {
    name: 'Предыдущие месяцы',
    args: { date: new Date('2026-01-15T09:00:00Z') },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const region = canvas.getByRole('region');
        const today = region.querySelector('[aria-current="date"]')!;
        await expect(today).toHaveAttribute('datetime', '2026-01-15');
        const bounds = today.getBoundingClientRect();
        const viewport = region.getBoundingClientRect();
        await expect(Math.abs(bounds.left + bounds.width / 2 - viewport.left - viewport.width / 2)).toBeLessThan(2);
        await centerDate(canvasElement, '2025-12-15');
        await expect(canvas.getByText('декабрь')).toBeVisible();
        await expect(region.querySelector('time[datetime="2025-12-15"]')!.closest('button')).toBeEnabled();
        await centerDate(canvasElement, '2025-01-15');
        await expect(canvas.getByText('январь')).toBeVisible();
    },
};

export const PlainPreviousMonths: Story = {
    ...PreviousMonths,
    name: 'Предыдущие месяцы без плашки',
    args: { ...PreviousMonths.args, variant: 'plain' },
};

export const LeapYear: Story = {
    name: 'Високосный февраль',
    args: { date: new Date('2024-02-28T22:00:00Z'), months: 2 },
    play: async ({ canvasElement }) => {
        const today = canvasElement.querySelector('[aria-current="date"]');
        await expect(today).toHaveAttribute('datetime', '2024-02-29');
        await expect(today!.closest('button')).toBeEnabled();
        await expect(canvasElement.querySelector('time[datetime="2024-02-28"]')!.closest('button')).toBeEnabled();
        await centerDate(canvasElement, '2024-03-02');
        await expect(within(canvasElement).getByText('март')).toBeVisible();
    },
};

export const Narrow: Story = {
    name: 'Узкий экран',
    render: (args) => (
        <div className="w-[280px] max-w-full">
            <HorizontalCalendarWidget {...args} />
        </div>
    ),
    play: async ({ canvasElement }) => {
        const region = within(canvasElement).getByRole('region');
        await expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
        // Space's decorative glow extends 4px; check the actual scroll viewport, not its glow.
        await expect(region.getBoundingClientRect().width).toBe(region.parentElement!.clientWidth);
        await expect(getComputedStyle(region).scrollbarWidth).toBe('none');
        await centerDate(canvasElement, '2026-11-02');
        await expect(within(canvasElement).getByText('ноябрь')).toBeVisible();
    },
};

export const Selection: Story = {
    name: 'Выбор даты',
    args: { selectedDate: '2026-10-21', onDateSelect: fn() },
    render: function Render(args) {
        const [selectedDate, setSelectedDate] = useState(args.selectedDate);
        return (
            <HorizontalCalendarWidget
                {...args}
                selectedDate={selectedDate}
                onDateSelect={(date) => {
                    setSelectedDate(date);
                    args.onDateSelect?.(date);
                }}
            />
        );
    },
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        const current = canvas.getByRole('button', { name: 'среда, 21 октября 2026 г.' });
        const next = canvas.getByRole('button', { name: 'четверг, 22 октября 2026 г.' });
        const past = canvas.getByRole('button', { name: 'вторник, 20 октября 2026 г.' });
        await expect(past).toBeEnabled();
        await userEvent.click(past);
        await expect(args.onDateSelect).toHaveBeenLastCalledWith('2026-10-20');
        await expect(past).toHaveAttribute('aria-pressed', 'true');
        await expect(current).toHaveAttribute('aria-pressed', 'false');
        current.focus();
        past.focus();
        await expect(past).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        await expect(args.onDateSelect).toHaveBeenLastCalledWith('2026-10-20');
        await userEvent.click(next);
        await expect(args.onDateSelect).toHaveBeenLastCalledWith('2026-10-22');
        await expect(next).toHaveAttribute('aria-pressed', 'true');
        await expect(current).toHaveAttribute('aria-pressed', 'false');
        current.focus();
        await userEvent.keyboard('{Enter}');
        await expect(args.onDateSelect).toHaveBeenLastCalledWith('2026-10-21');
        await expect(current).toHaveAttribute('aria-pressed', 'true');
        await centerDate(canvasElement, '2026-11-21');
        const otherMonth = canvas.getByRole('button', { name: 'суббота, 21 ноября 2026 г.' });
        await userEvent.click(otherMonth);
        await expect(args.onDateSelect).toHaveBeenLastCalledWith('2026-11-21');
        await expect(otherMonth).toHaveAttribute('aria-pressed', 'true');
        await expect(current).toHaveAttribute('aria-pressed', 'false');
    },
};

export const Plain: Story = {
    name: 'Без фоновой плашки',
    args: { variant: 'plain' },
    play: Default.play,
};

export const PlainSelection: Story = {
    ...Selection,
    name: 'Выбор даты без плашки',
    args: { ...Selection.args, variant: 'plain', onDateSelect: fn() },
};

export const Events: Story = {
    name: 'Цветные точки событий',
    args: {
        selectedDate: '2026-10-21',
        onDateSelect: fn(),
        events: [
            { id: 'later', title: 'Игра', startsAt: '2026-10-21T18:00:00Z', color: '#22d3ee' },
            { id: 'first', title: 'Тренировка', startsAt: '2026-10-21T12:00:00Z', color: '#c084fc' },
            { id: 'default', title: 'Встреча', startsAt: '2026-10-21T19:00:00Z' },
            { id: 'extra', title: 'Ещё встреча', startsAt: '2026-10-21T20:00:00Z' },
            { id: 'next', title: 'Ночная игра', startsAt: '2026-10-21T22:00:00Z', color: '#22d3ee' },
            { id: 'past', title: 'Прошла', startsAt: '2026-10-20T12:00:00Z' },
            { id: 'invalid', title: 'Некорректная дата', startsAt: 'invalid' },
        ],
    },
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        const today = canvas.getByRole('button', { name: 'среда, 21 октября 2026 г., событий: 4' });
        const dots = today.querySelectorAll('[aria-hidden="true"] > span');
        await expect(dots).toHaveLength(3);
        await expect(getComputedStyle(dots[0]).backgroundColor).toBe('rgb(192, 132, 252)');
        await expect(getComputedStyle(dots[1]).backgroundColor).toBe('rgb(34, 211, 238)');
        await expect(getComputedStyle(dots[2]).backgroundColor).toBe(getComputedStyle(dots[2].parentElement!).color);
        const tomorrow = canvas.getByRole('button', { name: 'четверг, 22 октября 2026 г., событий: 1' });
        await expect(tomorrow.querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(1);
        const past = canvas.getByRole('button', { name: 'вторник, 20 октября 2026 г.' });
        await expect(past.querySelector('[aria-hidden="true"]')).toBeNull();
        await userEvent.click(today);
        await expect(args.onDateSelect).toHaveBeenLastCalledWith('2026-10-21');
    },
};

export const PlainEvents: Story = {
    ...Events,
    name: 'Цветные точки без плашки',
    args: { ...Events.args, variant: 'plain', onDateSelect: fn() },
};

export const ReturnAfterScroll: Story = {
    name: 'Возврат после прокрутки',
    args: { selectedDate: '2026-11-02' },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const region = canvas.getByRole('region');
        const initial = region.scrollLeft;
        await centerDate(canvasElement, '2026-11-04');
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await centerDate(canvasElement, '2026-11-03');
        await new Promise((resolve) => setTimeout(resolve, 2100));
        // More than 3s since the first scroll, but less than 3s since the latest one.
        await expect(region.scrollLeft).not.toBe(initial);
        await expect(canvas.getByText('ноябрь')).toBeVisible();
        const away = region.scrollLeft;
        await waitFor(
            async () => {
                await expect(region.scrollLeft).toBeGreaterThan(initial);
                await expect(region.scrollLeft).toBeLessThan(away);
            },
            { timeout: 1500 }
        );
        await waitFor(() => expect(region.scrollLeft).toBe(initial), { timeout: 1500 });
        await expect(canvas.getByText('ноябрь')).toBeVisible();
        await expect(canvas.getByRole('button', { name: 'понедельник, 2 ноября 2026 г.' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
    },
};

export const PlainReturnAfterScroll: Story = {
    ...ReturnAfterScroll,
    name: 'Плавный возврат без плашки',
    args: { ...ReturnAfterScroll.args, variant: 'plain' },
};

export const CenterAfterSelection: Story = {
    name: 'Центрирование выбранной даты с задержкой',
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const region = canvas.getByRole('region');
        const initial = region.scrollLeft;
        await userEvent.click(canvas.getByRole('button', { name: 'четверг, 22 октября 2026 г.' }));
        await new Promise((resolve) => setTimeout(resolve, 2100));
        await expect(region.scrollLeft).toBe(initial);
        await waitFor(
            () => {
                const selected = region.querySelector('[aria-pressed="true"] time')!.getBoundingClientRect();
                const bounds = region.getBoundingClientRect();
                expect(Math.abs(selected.left + selected.width / 2 - bounds.left - bounds.width / 2)).toBeLessThan(2);
            },
            { timeout: 2000 }
        );
    },
};
