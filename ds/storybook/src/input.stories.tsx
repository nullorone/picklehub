import { Label } from '@picklehub/ui-web/label';
import { GlassInput } from '@picklehub/ui-web';
export default { title: 'Components/Input' };
export const Example1 = {
    name: 'Basic Input',
    render: () => (
        <div className="w-full max-w-sm">
            <GlassInput placeholder="Enter your email" type="email" />
        </div>
    ),
};
export const Example2 = {
    name: 'With Label',
    render: () => (
        <div className="w-full max-w-sm space-y-2">
            <Label className="text-white/80">Username</Label>
            <GlassInput placeholder="johndoe" />
        </div>
    ),
};
export const Example3 = {
    name: 'Different Types',
    render: () => (
        <div className="w-full max-w-sm space-y-4">
            <GlassInput type="password" placeholder="Password" />
            <GlassInput type="number" placeholder="Age" />
            <GlassInput type="date" aria-label="Date" />
        </div>
    ),
};
