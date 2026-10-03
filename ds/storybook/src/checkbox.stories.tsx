import { GlassCheckbox } from '@picklehub/ui-web';
export default { title: 'Forms/Checkbox' };
export const Example1 = {
    name: 'Basic Checkbox',
    render: () => (
        <label className="flex items-center space-x-2">
            <GlassCheckbox />
            <span className="text-white/80">Accept terms and conditions</span>
        </label>
    ),
};
export const Example2 = {
    name: 'Checkbox Group',
    render: () => (
        <div className="space-y-3">
            <label className="flex items-center space-x-2">
                <GlassCheckbox defaultChecked />
                <span className="text-white/80">Email notifications</span>
            </label>
            <label className="flex items-center space-x-2">
                <GlassCheckbox />
                <span className="text-white/80">SMS notifications</span>
            </label>
            <label className="flex items-center space-x-2">
                <GlassCheckbox defaultChecked />
                <span className="text-white/80">Push notifications</span>
            </label>
        </div>
    ),
};
