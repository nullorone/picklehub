import { Label } from '@picklehub/ui-web/label';
import { GlassTextarea } from '@picklehub/ui-web';
export default { title: 'Forms/Textarea' };
export const Example1 = {
    name: 'Basic Textarea',
    render: () => (
        <div className="w-full max-w-md">
            <GlassTextarea placeholder="Type your message here..." />
        </div>
    ),
};
export const Example2 = {
    name: 'With Label and Character Count',
    render: () => (
        <div className="w-full max-w-md space-y-2">
            <Label className="text-white/80">Bio</Label>
            <GlassTextarea placeholder="Tell us about yourself..." rows={4} />
            <p className="text-xs text-white/40 text-right">0/500 characters</p>
        </div>
    ),
};
