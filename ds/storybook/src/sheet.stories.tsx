import { Label } from '@picklehub/ui-web/label';
import {
    GlassButton,
    GlassInput,
    GlassSheet,
    GlassSheetTrigger,
    GlassSheetContent,
    GlassSheetHeader,
    GlassSheetTitle,
    GlassSheetDescription,
    GlassSheetFooter,
    GlassSheetClose,
} from '@picklehub/ui-web';
export default { title: 'Overlays/Sheet' };
export const Example1 = {
    name: 'Basic Sheet',
    render: () => (
        <GlassSheet>
            <GlassSheetTrigger asChild>
                <GlassButton variant="outline">Open Sheet</GlassButton>
            </GlassSheetTrigger>
            <GlassSheetContent>
                <GlassSheetHeader>
                    <GlassSheetTitle>Edit Profile</GlassSheetTitle>
                    <GlassSheetDescription>Make changes to your profile here.</GlassSheetDescription>
                </GlassSheetHeader>
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
                <GlassSheetFooter>
                    <GlassSheetClose asChild>
                        <GlassButton variant="outline">Cancel</GlassButton>
                    </GlassSheetClose>
                    <GlassButton variant="primary">Save changes</GlassButton>
                </GlassSheetFooter>
            </GlassSheetContent>
        </GlassSheet>
    ),
};
export const Example2 = {
    name: 'Sheet Sides',
    render: () => (
        <div className="flex flex-wrap gap-4">
            <GlassSheet>
                <GlassSheetTrigger asChild>
                    <GlassButton variant="outline">Left</GlassButton>
                </GlassSheetTrigger>
                <GlassSheetContent side="left">
                    <GlassSheetHeader>
                        <GlassSheetTitle>Left Sheet</GlassSheetTitle>
                    </GlassSheetHeader>
                </GlassSheetContent>
            </GlassSheet>
            <GlassSheet>
                <GlassSheetTrigger asChild>
                    <GlassButton variant="outline">Top</GlassButton>
                </GlassSheetTrigger>
                <GlassSheetContent side="top">
                    <GlassSheetHeader>
                        <GlassSheetTitle>Top Sheet</GlassSheetTitle>
                    </GlassSheetHeader>
                </GlassSheetContent>
            </GlassSheet>
            <GlassSheet>
                <GlassSheetTrigger asChild>
                    <GlassButton variant="outline">Bottom</GlassButton>
                </GlassSheetTrigger>
                <GlassSheetContent side="bottom">
                    <GlassSheetHeader>
                        <GlassSheetTitle>Bottom Sheet</GlassSheetTitle>
                    </GlassSheetHeader>
                </GlassSheetContent>
            </GlassSheet>
        </div>
    ),
};
