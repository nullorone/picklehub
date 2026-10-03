import { Label } from '@picklehub/ui-web/label';
import { GlassButton, GlassInput, GlassPopover, GlassPopoverTrigger, GlassPopoverContent } from '@picklehub/ui-web';
export default { title: 'Overlays/Popover' };
export const Example1 = {
    name: 'Basic Popover',
    render: () => (
        <GlassPopover>
            <GlassPopoverTrigger asChild>
                <GlassButton variant="outline">Open Popover</GlassButton>
            </GlassPopoverTrigger>
            <GlassPopoverContent className="w-80">
                <div className="space-y-2">
                    <h4 className="font-medium text-white">Dimensions</h4>
                    <p className="text-sm text-white/60">Set the dimensions for the layer.</p>
                </div>
                <div className="grid gap-2 pt-4">
                    <div className="grid grid-cols-3 items-center gap-4">
                        <Label className="text-white/80">Width</Label>
                        <GlassInput className="col-span-2 h-8" defaultValue="100%" />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                        <Label className="text-white/80">Height</Label>
                        <GlassInput className="col-span-2 h-8" defaultValue="25px" />
                    </div>
                </div>
            </GlassPopoverContent>
        </GlassPopover>
    ),
};
export const Example2 = {
    name: 'Popover Alignment',
    render: () => (
        <div className="flex gap-4">
            <GlassPopover>
                <GlassPopoverTrigger asChild>
                    <GlassButton variant="outline" size="sm">
                        Start
                    </GlassButton>
                </GlassPopoverTrigger>
                <GlassPopoverContent align="start" className="w-48">
                    <p className="text-sm text-white/70">Aligned to start</p>
                </GlassPopoverContent>
            </GlassPopover>
            <GlassPopover>
                <GlassPopoverTrigger asChild>
                    <GlassButton variant="outline" size="sm">
                        Center
                    </GlassButton>
                </GlassPopoverTrigger>
                <GlassPopoverContent align="center" className="w-48">
                    <p className="text-sm text-white/70 text-center">Aligned to center</p>
                </GlassPopoverContent>
            </GlassPopover>
            <GlassPopover>
                <GlassPopoverTrigger asChild>
                    <GlassButton variant="outline" size="sm">
                        End
                    </GlassButton>
                </GlassPopoverTrigger>
                <GlassPopoverContent align="end" className="w-48">
                    <p className="text-sm text-white/70 text-right">Aligned to end</p>
                </GlassPopoverContent>
            </GlassPopover>
        </div>
    ),
};
