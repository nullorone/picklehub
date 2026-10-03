import {
    GlassButton,
    GlassTooltipProvider,
    GlassTooltip,
    GlassTooltipTrigger,
    GlassTooltipContent,
} from '@picklehub/ui-web';
export default { title: 'Components/Tooltip' };
export const Example1 = {
    name: 'Basic Tooltip',
    render: () => (
        <GlassTooltipProvider>
            <GlassTooltip>
                <GlassTooltipTrigger asChild>
                    <GlassButton variant="outline">Hover me</GlassButton>
                </GlassTooltipTrigger>
                <GlassTooltipContent>
                    <p>Add to library</p>
                </GlassTooltipContent>
            </GlassTooltip>
        </GlassTooltipProvider>
    ),
};
export const Example2 = {
    name: 'Tooltip Positions',
    render: () => (
        <GlassTooltipProvider>
            <div className="flex gap-4">
                <GlassTooltip>
                    <GlassTooltipTrigger asChild>
                        <GlassButton variant="outline" size="sm">
                            Top
                        </GlassButton>
                    </GlassTooltipTrigger>
                    <GlassTooltipContent side="top">
                        <p>Top tooltip</p>
                    </GlassTooltipContent>
                </GlassTooltip>
                <GlassTooltip>
                    <GlassTooltipTrigger asChild>
                        <GlassButton variant="outline" size="sm">
                            Bottom
                        </GlassButton>
                    </GlassTooltipTrigger>
                    <GlassTooltipContent side="bottom">
                        <p>Bottom tooltip</p>
                    </GlassTooltipContent>
                </GlassTooltip>
                <GlassTooltip>
                    <GlassTooltipTrigger asChild>
                        <GlassButton variant="outline" size="sm">
                            Left
                        </GlassButton>
                    </GlassTooltipTrigger>
                    <GlassTooltipContent side="left">
                        <p>Left tooltip</p>
                    </GlassTooltipContent>
                </GlassTooltip>
            </div>
        </GlassTooltipProvider>
    ),
};
