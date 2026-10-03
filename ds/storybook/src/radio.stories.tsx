import { Label } from '@picklehub/ui-web/label';
import { GlassRadioGroup, GlassRadioGroupItem } from '@picklehub/ui-web';
export default { title: 'Forms/Radio' };
export const Example1 = {
    name: 'Basic Radio Group',
    render: () => (
        <GlassRadioGroup defaultValue="option-1">
            <div className="flex items-center space-x-2">
                <GlassRadioGroupItem value="option-1" id="option-1" />
                <Label htmlFor="option-1" className="text-white/80">
                    Option 1
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <GlassRadioGroupItem value="option-2" id="option-2" />
                <Label htmlFor="option-2" className="text-white/80">
                    Option 2
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <GlassRadioGroupItem value="option-3" id="option-3" />
                <Label htmlFor="option-3" className="text-white/80">
                    Option 3
                </Label>
            </div>
        </GlassRadioGroup>
    ),
};
export const Example2 = {
    name: 'Horizontal Layout',
    render: () => (
        <GlassRadioGroup defaultValue="sm" className="flex gap-4">
            <div className="flex items-center space-x-2">
                <GlassRadioGroupItem value="sm" id="sm" />
                <Label htmlFor="sm" className="text-white/80">
                    Small
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <GlassRadioGroupItem value="md" id="md" />
                <Label htmlFor="md" className="text-white/80">
                    Medium
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <GlassRadioGroupItem value="lg" id="lg" />
                <Label htmlFor="lg" className="text-white/80">
                    Large
                </Label>
            </div>
        </GlassRadioGroup>
    ),
};
