import {
    CurrentWeatherWidget,
    DetailedWeatherWidget,
    ForecastWeatherWidget,
    ForecastWidget,
    HourlyWeatherWidget,
} from '@picklehub/ui-web';
export default { title: 'Widgets/Weather' };
export const Example1 = {
    name: 'Current Weather Widget',
    render: () => (
        <div className="flex flex-wrap gap-6 justify-center">
            <CurrentWeatherWidget
                location="San Francisco"
                temperature={18}
                feelsLike={16}
                high={22}
                low={14}
                condition="cloudy"
                humidity={68}
                windSpeed={15}
            />
            <CurrentWeatherWidget
                location="Mumbai"
                temperature={35}
                feelsLike={38}
                high={37}
                low={28}
                condition="sunny"
                humidity={45}
                windSpeed={8}
            />
        </div>
    ),
};
export const Example2 = {
    name: 'Forecast Widget',
    render: () => (
        <ForecastWeatherWidget
            current={{
                temperature: 18,
                condition: 'cloudy',
                icon: 'cloud',
            }}
            forecast={[
                { day: 'Mon', high: 22, low: 14, condition: 'sunny' },
                { day: 'Tue', high: 24, low: 15, condition: 'sunny' },
                { day: 'Wed', high: 20, low: 13, condition: 'cloudy' },
                { day: 'Thu', high: 18, low: 12, condition: 'rainy' },
                { day: 'Fri', high: 21, low: 14, condition: 'cloudy' },
            ]}
        />
    ),
};
export const Example3 = {
    name: 'Large Weather Widget',
    render: () => (
        <div className="flex flex-wrap gap-6">
            <DetailedWeatherWidget location="Mumbai" temperature={29} condition="sunny" />
            <DetailedWeatherWidget location="London" temperature={8} condition="rainy" />
        </div>
    ),
};
export const Example4 = {
    name: 'Forecast Widget',
    render: () => (
        <ForecastWidget
            forecast={[
                { day: 'Mon', high: 22, low: 14, condition: 'sunny' },
                { day: 'Tue', high: 24, low: 15, condition: 'sunny' },
                { day: 'Wed', high: 20, low: 13, condition: 'cloudy' },
                { day: 'Thu', high: 18, low: 12, condition: 'rainy' },
                { day: 'Fri', high: 21, low: 14, condition: 'cloudy' },
            ]}
        />
    ),
};
export const Example5 = {
    name: 'Hourly Forecast Widget',
    render: () => (
        <HourlyWeatherWidget
            hours={[
                { time: 'Now', temperature: 18, icon: 'cloud' },
                { time: '2PM', temperature: 20, icon: 'sun' },
                { time: '4PM', temperature: 22, icon: 'sun' },
                { time: '6PM', temperature: 19, icon: 'cloud' },
                { time: '8PM', temperature: 16, icon: 'snow' },
            ]}
        />
    ),
};
export const Example6 = {
    name: 'Weather Details Widget',
    render: () => (
        <DetailedWeatherWidget
            location="New York"
            temperature={22}
            condition="sunny"
            humidity={65}
            windSpeed={12}
            feelsLike={24}
        />
    ),
};
