import { Settings } from 'lucide-react';
import { Label } from '@picklehub/ui-web/label';
import {
    GlassButton,
    GlassInput,
    GlassDialog,
    GlassDialogTrigger,
    GlassDialogContent,
    GlassDialogHeader,
    GlassDialogTitle,
    GlassDialogDescription,
    GlassDialogFooter,
    GlassSwitch,
} from '@picklehub/ui-web';
export default { title: 'Components/Dialogs' };
export const Example1 = {
    name: 'Basic Dialog',
    render: () => (
        <GlassDialog>
            <GlassDialogTrigger asChild>
                <GlassButton variant="primary">Open Dialog</GlassButton>
            </GlassDialogTrigger>
            <GlassDialogContent>
                <GlassDialogHeader className="text-left">
                    <GlassDialogTitle>Edit Profile</GlassDialogTitle>
                    <GlassDialogDescription>Make changes to your profile here.</GlassDialogDescription>
                </GlassDialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-white/80">Name</Label>
                        <GlassInput placeholder="John Doe" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-white/80">Email</Label>
                        <GlassInput type="email" placeholder="john@example.com" />
                    </div>
                </div>
                <GlassDialogFooter className="flex-row justify-end gap-2">
                    <GlassButton variant="outline">Cancel</GlassButton>
                    <GlassButton variant="primary">Save changes</GlassButton>
                </GlassDialogFooter>
            </GlassDialogContent>
        </GlassDialog>
    ),
};
export const Example2 = {
    name: 'Settings Dialog',
    render: () => (
        <GlassDialog>
            <GlassDialogTrigger asChild>
                <GlassButton variant="outline">
                    <Settings className="mr-2 h-4 w-4" /> Settings
                </GlassButton>
            </GlassDialogTrigger>
            <GlassDialogContent>
                <GlassDialogHeader className="text-left">
                    <GlassDialogTitle>Notification Settings</GlassDialogTitle>
                    <GlassDialogDescription>Configure how you receive notifications.</GlassDialogDescription>
                </GlassDialogHeader>
                <div className="py-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-white/80">Email notifications</Label>
                        <GlassSwitch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label className="text-white/80">Push notifications</Label>
                        <GlassSwitch />
                    </div>
                </div>
                <GlassDialogFooter className="flex-row justify-end gap-2">
                    <GlassButton variant="primary">Save</GlassButton>
                </GlassDialogFooter>
            </GlassDialogContent>
        </GlassDialog>
    ),
};
