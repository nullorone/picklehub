import { CalendarWidget, CompactCalendarWidget, EventsCalendarWidget } from '@picklehub/ui-web';
import type { StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
export default { title: 'Widgets/Calendar' };
export const Example1 = {
    name: 'Calendar Widget',
    render: () => (
        <div className="flex flex-wrap gap-6 justify-center">
            <CalendarWidget />
            <CalendarWidget date={new Date(2025, 0, 1)} />
        </div>
    ),
};
export const Example2 = {
    name: 'Month Calendar Widget',
    args: { size: 1 },
    argTypes: { size: { control: { type: 'number', min: 0.25, step: 0.25 } } },
    render: ({ size }: { size: number }) => (
        <div className="flex flex-wrap items-start gap-6">
            <CompactCalendarWidget size={size} />
            <CompactCalendarWidget size={size} date={new Date(2025, 0, 1)} />
        </div>
    ),
};

export const MonthSizes: StoryObj = {
    name: 'Month Calendar Widget — масштаб',
    render: () => (
        <div className="flex flex-wrap items-start gap-6">
            {[1, 4, 0.5, 0].map((size) => (
                <div key={size} data-testid={`size-${size}`}>
                    <CompactCalendarWidget date={new Date(2025, 0, 1)} size={size} />
                </div>
            ))}
        </div>
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const base = within(canvas.getByTestId('size-1')).getByRole('article').getBoundingClientRect();
        const baseText = within(canvas.getByTestId('size-1')).getByText('1').getBoundingClientRect();
        for (const size of [4, 0.5, 0]) {
            const view = within(canvas.getByTestId(`size-${size}`));
            const card = view.getByRole('article').getBoundingClientRect();
            const text = view.getByText('1').getBoundingClientRect();
            const factor = size || 1;
            await expect(card.width / base.width).toBeCloseTo(factor, 1);
            await expect(card.height / base.height).toBeCloseTo(factor, 1);
            await expect(text.height / baseText.height).toBeCloseTo(factor, 1);
        }
    },
};
export const Example3 = {
    name: 'Event Widget',
    render: () => (
        <EventsCalendarWidget
            date={new Date(2025, 0, 1)}
            events={[
                { id: '1', title: 'Team Meeting', time: '9:00 AM', color: 'blue' },
                { id: '2', title: 'Lunch with Client', time: '12:30 PM', color: 'green' },
                { id: '3', title: 'Project Review', time: '3:00 PM', color: 'purple' },
            ]}
        />
    ),
};
