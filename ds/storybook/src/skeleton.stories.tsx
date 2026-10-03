import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter, GlassSkeleton } from '@picklehub/ui-web';
export default { title: 'Data display/Skeleton' };
export const Example1 = {
    name: 'Basic Skeletons',
    render: () => (
        <div className="space-y-4 w-full max-w-md">
            <GlassSkeleton className="h-4 w-3/4" />
            <GlassSkeleton className="h-4 w-1/2" />
            <GlassSkeleton className="h-32 w-full" />
        </div>
    ),
};
export const Example2 = {
    name: 'Card Skeleton',
    render: () => (
        <div className="w-full max-w-md">
            <GlassCard className="w-full">
                <GlassCardHeader className="space-y-2">
                    <GlassSkeleton className="h-5 w-1/2" />
                    <GlassSkeleton className="h-4 w-3/4" />
                </GlassCardHeader>
                <GlassCardContent className="space-y-2">
                    <GlassSkeleton className="h-4 w-full" />
                    <GlassSkeleton className="h-4 w-full" />
                    <GlassSkeleton className="h-4 w-2/3" />
                </GlassCardContent>
                <GlassCardFooter>
                    <GlassSkeleton className="h-10 w-24" />
                </GlassCardFooter>
            </GlassCard>
        </div>
    ),
};
export const Example3 = {
    name: 'Variant',
    render: () => (
        <div className="w-full max-w-md flex flex-col gap-4">
            <div className="flex items-center gap-4">
                <span className="text-white/60 text-sm w-20">Default</span>
                <GlassSkeleton variant="default" className="h-12 flex-1" />
            </div>
            <div className="flex items-center gap-4">
                <span className="text-white/60 text-sm w-20">Circular</span>
                <GlassSkeleton variant="circular" className="h-12 w-12" />
            </div>
            <div className="flex items-center gap-4">
                <span className="text-white/60 text-sm w-20">Text</span>
                <GlassSkeleton variant="text" className="flex-1" />
            </div>
            <div className="flex items-center gap-4">
                <span className="text-white/60 text-sm w-20">Card</span>
                <GlassSkeleton variant="card" className="flex-1 h-32" />
            </div>
        </div>
    ),
};
