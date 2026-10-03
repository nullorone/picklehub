import { GlassProgress } from '@picklehub/ui-web';
export default { title: 'Components/Progress' };
export const Example1 = {
    name: 'Basic Progress',
    render: () => (
        <div className="w-full max-w-md space-y-4">
            <GlassProgress aria-label="Completion" value={33} />
            <GlassProgress aria-label="Completion" value={66} />
            <GlassProgress aria-label="Completion" value={100} />
        </div>
    ),
};
export const Example2 = {
    name: 'Progress with Label',
    render: () => (
        <div className="w-full max-w-md space-y-2">
            <div className="flex justify-between text-sm">
                <span className="text-white/80">Uploading...</span>
                <span className="text-white/60">75%</span>
            </div>
            <GlassProgress aria-label="Completion" value={75} />
        </div>
    ),
};
