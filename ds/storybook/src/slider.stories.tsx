import { Label } from '@picklehub/ui-web/label';
import { GlassSlider } from '@picklehub/ui-web';
export default { title: 'Components/Slider' };
export const Example1 = {
    name: 'Basic Slider',
    render: () => (
        <div className="w-full max-w-md space-y-4">
            <GlassSlider aria-label="Value" defaultValue={[50]} max={100} step={1} />
        </div>
    ),
};
export const Example2 = {
    name: 'Slider with Labels',
    render: () => (
        <div className="w-full max-w-md space-y-2">
            <div className="flex justify-between text-sm">
                <Label className="text-white/80">Volume</Label>
                <span className="text-white/60">75%</span>
            </div>
            <GlassSlider aria-label="Volume" defaultValue={[75]} max={100} step={1} />
        </div>
    ),
};
