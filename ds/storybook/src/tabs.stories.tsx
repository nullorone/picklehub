import { Settings, User, Bell } from 'lucide-react';
import { Label } from '@picklehub/ui-web/label';
import {
    GlassButton,
    GlassInput,
    GlassTabs,
    GlassTabsList,
    GlassTabsTrigger,
    GlassTabsContent,
} from '@picklehub/ui-web';
export default { title: 'Components/Tabs' };
export const Example1 = {
    name: 'Basic Tabs',
    render: () => (
        <GlassTabs defaultValue="account" className="w-full max-w-lg">
            <GlassTabsList>
                <GlassTabsTrigger value="account">Account</GlassTabsTrigger>
                <GlassTabsTrigger value="password">Password</GlassTabsTrigger>
                <GlassTabsTrigger value="settings">Settings</GlassTabsTrigger>
            </GlassTabsList>
            <GlassTabsContent value="account">
                <div className="p-4 rounded-xl bg-white/5">
                    <p className="text-white/80">Manage your account settings and preferences.</p>
                </div>
            </GlassTabsContent>
            <GlassTabsContent value="password">
                <div className="p-4 rounded-xl bg-white/5">
                    <p className="text-white/80">Update your password and security settings.</p>
                </div>
            </GlassTabsContent>
            <GlassTabsContent value="settings">
                <div className="p-4 rounded-xl bg-white/5">
                    <p className="text-white/80">Configure general application settings.</p>
                </div>
            </GlassTabsContent>
        </GlassTabs>
    ),
};
export const Example2 = {
    name: 'Icon Tabs',
    render: () => (
        <GlassTabs defaultValue="profile" className="w-full max-w-lg">
            <GlassTabsList className="w-full">
                <GlassTabsTrigger value="profile" className="group flex-1">
                    <User className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">Profile</span>
                </GlassTabsTrigger>
                <GlassTabsTrigger value="notifications" className="group flex-1">
                    <Bell className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">Notifications</span>
                </GlassTabsTrigger>
                <GlassTabsTrigger value="settings" className="group flex-1">
                    <Settings className="h-4 w-4" />
                    <span className="ml-2 hidden group-data-[state=active]:inline sm:inline">Settings</span>
                </GlassTabsTrigger>
            </GlassTabsList>
            <GlassTabsContent value="profile">
                <div className="p-4 rounded-xl bg-white/5">
                    <p className="text-white/80">Your profile information and public details.</p>
                </div>
            </GlassTabsContent>
            <GlassTabsContent value="notifications">
                <div className="p-4 rounded-xl bg-white/5">
                    <p className="text-white/80">Manage your notification preferences.</p>
                </div>
            </GlassTabsContent>
            <GlassTabsContent value="settings">
                <div className="p-4 rounded-xl bg-white/5">
                    <p className="text-white/80">Application settings and configuration.</p>
                </div>
            </GlassTabsContent>
        </GlassTabs>
    ),
};
export const Example3 = {
    name: 'Settings Panel',
    render: () => (
        <GlassTabs defaultValue="general" className="w-full">
            <GlassTabsList className="w-full">
                <GlassTabsTrigger value="general" className="flex-1 px-2 sm:px-4">
                    General
                </GlassTabsTrigger>
                <GlassTabsTrigger value="notifications" className="flex-1 px-2 sm:px-4">
                    Notifications
                </GlassTabsTrigger>
                <GlassTabsTrigger value="security" className="flex-1 px-2 sm:px-4">
                    Security
                </GlassTabsTrigger>
            </GlassTabsList>
            <GlassTabsContent value="general">
                <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                        <Label className="text-white/80 text-sm">Display Name</Label>
                        <GlassInput placeholder="John Doe" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label className="text-white/80 text-sm">Email</Label>
                        <GlassInput placeholder="john@example.com" />
                    </div>
                    <GlassButton variant="primary">Save Changes</GlassButton>
                </div>
            </GlassTabsContent>
            <GlassTabsContent value="notifications">
                <div className="space-y-4">
                    <p className="text-white/60 text-sm">Configure how you receive notifications.</p>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                            <span className="text-white/80 text-sm">Email notifications</span>
                            <div className="w-10 h-6 bg-cyan-500/50 rounded-full" />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                            <span className="text-white/80 text-sm">Push notifications</span>
                            <div className="w-10 h-6 bg-white/20 rounded-full" />
                        </div>
                    </div>
                </div>
            </GlassTabsContent>
            <GlassTabsContent value="security">
                <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                        <Label className="text-white/80 text-sm">Current Password</Label>
                        <GlassInput type="password" placeholder="Enter current password" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label className="text-white/80 text-sm">New Password</Label>
                        <GlassInput type="password" placeholder="Enter new password" />
                    </div>
                    <GlassButton variant="primary">Update Password</GlassButton>
                </div>
            </GlassTabsContent>
        </GlassTabs>
    ),
};
