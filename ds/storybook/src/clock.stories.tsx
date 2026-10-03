import {
    AnalogClockWidget,
    DigitalClockWidget,
    StopwatchWidget,
    TimerWidget,
    WorldClockWidget,
} from '@picklehub/ui-web';
export default { title: 'Widgets/Clock' };
export const Example1 = {
    name: 'Digital Clock Widget',
    render: () => (
        <div className="flex flex-wrap gap-6 justify-center">
            <DigitalClockWidget />
            <DigitalClockWidget showSeconds />
            <DigitalClockWidget showSeconds format="24h" />
        </div>
    ),
};
export const Example2 = {
    name: 'Analog Clock Widget',
    render: () => (
        <div className="flex flex-wrap gap-6 justify-center">
            <AnalogClockWidget showNumbers size="sm" />
            <AnalogClockWidget showNumbers size="md" />
            <AnalogClockWidget size="lg" showNumbers={false} />
        </div>
    ),
};
export const Example3 = {
    name: 'World Clock Widget',
    render: () => (
        <div className="flex flex-wrap gap-6">
            <WorldClockWidget
                clocks={[
                    { city: 'New York', timezone: 'America/New_York' },
                    { city: 'London', timezone: 'Europe/London', isDay: true },
                    { city: 'Tokyo', timezone: 'Asia/Tokyo', isDay: false },
                ]}
            />
        </div>
    ),
};
export const Example4 = {
    name: 'Countdown Timer Widget',
    render: () => (
        <div className="flex justify-center items-center p-4">
            <TimerWidget initialMinutes={5} />
        </div>
    ),
};
export const Example5 = {
    name: 'Stopwatch Widget',
    render: () => (
        <div className="flex justify-center items-center p-4">
            <StopwatchWidget />
        </div>
    ),
};
