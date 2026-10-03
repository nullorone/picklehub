import { Trash2, LogOut } from 'lucide-react';
import {
    GlassButton,
    GlassAlertDialog,
    GlassAlertDialogTrigger,
    GlassAlertDialogContent,
    GlassAlertDialogHeader,
    GlassAlertDialogTitle,
    GlassAlertDialogDescription,
    GlassAlertDialogFooter,
    GlassAlertDialogCancel,
    GlassAlertDialogAction,
} from '@picklehub/ui-web';
export default { title: 'Overlays/AlertDialog' };
export const Example1 = {
    name: 'Delete Confirmation',
    render: () => (
        <GlassAlertDialog>
            <GlassAlertDialogTrigger asChild>
                <GlassButton variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Account
                </GlassButton>
            </GlassAlertDialogTrigger>
            <GlassAlertDialogContent>
                <GlassAlertDialogHeader>
                    <GlassAlertDialogTitle>Are you absolutely sure?</GlassAlertDialogTitle>
                    <GlassAlertDialogDescription>
                        This action cannot be undone. This will permanently delete your account and remove your data
                        from our servers.
                    </GlassAlertDialogDescription>
                </GlassAlertDialogHeader>
                <GlassAlertDialogFooter>
                    <GlassAlertDialogCancel>Cancel</GlassAlertDialogCancel>
                    <GlassAlertDialogAction>Yes, delete account</GlassAlertDialogAction>
                </GlassAlertDialogFooter>
            </GlassAlertDialogContent>
        </GlassAlertDialog>
    ),
};
export const Example2 = {
    name: 'Log Out Confirmation',
    render: () => (
        <GlassAlertDialog>
            <GlassAlertDialogTrigger asChild>
                <GlassButton variant="outline">
                    <LogOut className="mr-2 h-4 w-4" /> Log Out
                </GlassButton>
            </GlassAlertDialogTrigger>
            <GlassAlertDialogContent>
                <GlassAlertDialogHeader>
                    <GlassAlertDialogTitle>Log out of your account?</GlassAlertDialogTitle>
                    <GlassAlertDialogDescription>
                        You will need to sign in again to access your account.
                    </GlassAlertDialogDescription>
                </GlassAlertDialogHeader>
                <GlassAlertDialogFooter>
                    <GlassAlertDialogCancel>Stay signed in</GlassAlertDialogCancel>
                    <GlassAlertDialogAction>Log out</GlassAlertDialogAction>
                </GlassAlertDialogFooter>
            </GlassAlertDialogContent>
        </GlassAlertDialog>
    ),
};
