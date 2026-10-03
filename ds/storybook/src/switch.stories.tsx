import { Label } from '@picklehub/ui-web/label';
import { GlassSwitch } from '@picklehub/ui-web';
export default { title: 'Components/Switch' };
export const Example1 = {
    name: 'Basic Switch',
    render: () => (
        <div className="flex items-center space-x-2">
            <GlassSwitch id="airplane" />
            <Label htmlFor="airplane" className="text-white/80">
                Airplane Mode
            </Label>
        </div>
    ),
};
export const Example2 = {
    name: 'Switch States',
    render: () => (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <GlassSwitch id="notifications" defaultChecked />
                <Label htmlFor="notifications" className="text-white/80">
                    Enable notifications
                </Label>
            </div>
            <div className="flex items-center gap-3">
                <GlassSwitch id="marketing" defaultChecked />
                <Label htmlFor="marketing" className="text-white/80">
                    Marketing emails
                </Label>
            </div>
        </div>
    ),
};
export const Example3 = {
    name: 'Settings Panel',
    render: () => (
        <div className="w-full max-w-md space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-white font-medium">Dark Mode</p>
                    <p className="text-white/50 text-sm">Use dark theme across the app</p>
                </div>
                <GlassSwitch aria-label="Dark Mode" defaultChecked />
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-white font-medium">Push Notifications</p>
                    <p className="text-white/50 text-sm">Receive push notifications</p>
                </div>
                <GlassSwitch aria-label="Push Notifications" />
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-white font-medium">Auto Updates</p>
                    <p className="text-white/50 text-sm">Keep app up to date automatically</p>
                </div>
                <GlassSwitch aria-label="Auto Updates" defaultChecked />
            </div>
        </div>
    ),
};
