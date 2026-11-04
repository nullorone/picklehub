import { DollarSign, Users } from 'lucide-react';
import {
    StatsGrid,
    MetricStat as MetricStatComponent,
    ComparisonStat as ComparisonStatComponent,
    CircularProgressStat as CircularProgressStatComponent,
} from '@picklehub/ui-web';
export default { title: 'Widgets/Stats' };
export const Example1 = {
    name: 'Stats Grid',
    render: () => (
        <div className="flex flex-wrap gap-6">
            <StatsGrid
                stats={[
                    {
                        title: 'Total Users',
                        value: '12,345',
                        change: { value: 12.5, type: 'increase' },
                        icon: <Users className="w-5 h-5" />,
                    },
                    {
                        title: 'Revenue',
                        value: '$45,678',
                        change: { value: 8.2, type: 'increase' },
                        glowColor: 'green',
                        icon: <DollarSign className="w-5 h-5" />,
                    },
                    {
                        title: 'Active Sessions',
                        value: '1,234',
                        change: { value: 5.3, type: 'decrease' },
                        glowColor: 'red',
                    },
                ]}
            />
        </div>
    ),
};

export const ProfileStats = {
    name: 'Profile Stats',
    render: () => (
        <div className="w-full max-w-md">
            <StatsGrid
                variant="centered"
                stats={[
                    { title: 'Выигранные игры', value: 32, glowColor: 'green' },
                    { title: 'Процент побед', value: '71%', glowColor: 'blue' },
                    { title: 'Текущая серия', value: 5, glowColor: 'amber' },
                    { title: 'Средний счет', value: 9.2, glowColor: 'purple' },
                ]}
            />
        </div>
    ),
};

export const MetricStat = {
    name: 'Metric Stat',
    render: () => (
        <div className="flex flex-wrap gap-6">
            <MetricStatComponent label="Участники" value={12} max={16} icon={<Users className="h-4 w-4" />} />
            <MetricStatComponent label="Процент побед" value={68} unit="%" glowColor="green" />
            <MetricStatComponent label="Цель выполнена" value={10} max={10} glowColor="purple" />
        </div>
    ),
};

export const ComparisonStat = {
    name: 'Comparison Stat',
    render: () => (
        <div className="flex flex-wrap gap-6">
            <ComparisonStatComponent title="Сыграно игр" current={47} previous={40} glowColor="green" />
            <ComparisonStatComponent title="Средний счёт" current={8} previous={10} glowColor="red" />
            <ComparisonStatComponent title="Участники клуба" current={24} previous={24} glowColor="blue" />
            <ComparisonStatComponent title="Первые победы" current={3} previous={0} glowColor="purple" />
            <ComparisonStatComponent title="Турниры" current={0} previous={0} glowColor="amber" />
        </div>
    ),
};

export const CircularProgressStat = {
    name: 'Circular Progress Stat',
    render: () => (
        <div className="flex flex-wrap items-start gap-6">
            <CircularProgressStatComponent label="Победы" value={68} unit="%" size="sm" glowColor="green" />
            <CircularProgressStatComponent label="Игры" value={32} max={50} size="md" glowColor="cyan" />
            <CircularProgressStatComponent label="Цель" value={100} unit="%" size="lg" glowColor="purple" />
        </div>
    ),
};
