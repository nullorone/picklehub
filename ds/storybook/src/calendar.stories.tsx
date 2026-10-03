import { CalendarWidget, CompactCalendarWidget, EventsCalendarWidget } from '@picklehub/ui-web';
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
    render: () => (
        <div className="flex flex-wrap gap-6">
            <CompactCalendarWidget />
            <CompactCalendarWidget date={new Date(2025, 0, 1)} />
        </div>
    ),
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
