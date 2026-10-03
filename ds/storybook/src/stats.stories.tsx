import { DollarSign, Users } from 'lucide-react';
import { StatsGrid } from '@picklehub/ui-web';
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
