import { GlassSeparator } from '@picklehub/ui-web';
export default { title: 'Data display/Separator' };
export const Example1 = {
    name: 'Horizontal Separator',
    render: () => (
        <div className="w-full max-w-md space-y-4">
            <div>
                <h4 className="text-sm font-medium text-white">Section One</h4>
                <p className="text-sm text-white/60">Content for the first section.</p>
            </div>
            <GlassSeparator />
            <div>
                <h4 className="text-sm font-medium text-white">Section Two</h4>
                <p className="text-sm text-white/60">Content for the second section.</p>
            </div>
        </div>
    ),
};
export const Example2 = {
    name: 'Vertical Separator',
    render: () => (
        <div className="flex h-8 items-center gap-4">
            <span className="text-sm text-white">Blog</span>
            <GlassSeparator orientation="vertical" />
            <span className="text-sm text-white">Docs</span>
            <GlassSeparator orientation="vertical" />
            <span className="text-sm text-white">Source</span>
        </div>
    ),
};
