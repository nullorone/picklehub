import { GlassBadge } from '@picklehub/ui-web';
export default { title: 'Components/Badge' };
export const Example1 = {
    name: 'Badge Variants',
    render: () => (
        <div className="flex flex-wrap gap-4 justify-center">
            <GlassBadge>Default</GlassBadge>
            <GlassBadge variant="primary">Secondary</GlassBadge>
            <GlassBadge variant="outline">Outline</GlassBadge>
            <GlassBadge variant="destructive">Destructive</GlassBadge>
        </div>
    ),
};
export const Example2 = {
    name: 'Tags',
    render: () => (
        <div className="flex flex-wrap gap-2 justify-center">
            <GlassBadge variant="primary">React</GlassBadge>
            <GlassBadge variant="primary">TypeScript</GlassBadge>
            <GlassBadge variant="primary">Tailwind CSS</GlassBadge>
            <GlassBadge variant="primary">Next.js</GlassBadge>
        </div>
    ),
};
export const Example3 = {
    name: 'Status Indicators',
    render: () => (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <GlassBadge variant="success" className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                Online
            </GlassBadge>
            <GlassBadge variant="warning" className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-amber-400 mr-2" />
                Away
            </GlassBadge>
            <GlassBadge variant="destructive" className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-red-400 mr-2" />
                Offline
            </GlassBadge>
        </div>
    ),
};
