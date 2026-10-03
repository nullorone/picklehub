import { Star } from 'lucide-react';
import {
    GlassButton,
    GlassCard,
    GlassCardHeader,
    GlassCardTitle,
    GlassCardDescription,
    GlassCardContent,
    GlassCardFooter,
    GlassAvatar,
    GlassAvatarImage,
    GlassAvatarFallback,
    GlassBadge,
} from '@picklehub/ui-web';
export default { title: 'Components/Card' };
export const Example1 = {
    name: 'Basic Card',
    render: () => (
        <GlassCard className="w-full max-w-sm">
            <GlassCardHeader>
                <GlassCardTitle>Card Title</GlassCardTitle>
                <GlassCardDescription>Card description goes here with additional context.</GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent>
                <p className="text-white/80">This is the card content area where you can add any content.</p>
            </GlassCardContent>
            <GlassCardFooter>
                <GlassButton>Action</GlassButton>
            </GlassCardFooter>
        </GlassCard>
    ),
};
export const Example2 = {
    name: 'Card with Image',
    render: () => (
        <GlassCard className="w-full max-w-sm">
            <div className="rounded-t-2xl overflow-hidden">
                <div className="h-32 bg-linear-to-r from-purple-500 to-pink-500" />
            </div>
            <GlassCardContent className="pt-4">
                <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-300" /> Featured Product
                </h3>
                <p className="text-white/60 text-sm mt-2">
                    A short description of the featured product or service that is concise and to the point.
                </p>
            </GlassCardContent>
            <GlassCardFooter>
                <GlassButton variant="primary">Explore</GlassButton>
            </GlassCardFooter>
        </GlassCard>
    ),
};
export const Example3 = {
    name: 'Profile Card',
    render: () => (
        <GlassCard className="w-full max-w-sm">
            <GlassCardHeader className="items-center">
                <GlassAvatar className="h-16 w-16">
                    <GlassAvatarImage src="/diverse-avatars.png" alt="User" />
                    <GlassAvatarFallback>JD</GlassAvatarFallback>
                </GlassAvatar>
                <GlassCardTitle className="mt-4">John Doe</GlassCardTitle>
                <GlassCardDescription>Software Engineer</GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent className="text-center">
                <div className="flex justify-center gap-4">
                    <GlassBadge>React</GlassBadge>
                    <GlassBadge variant="outline">TypeScript</GlassBadge>
                </div>
            </GlassCardContent>
            <GlassCardFooter className="justify-center">
                <GlassButton variant="outline" size="sm">
                    View Profile
                </GlassButton>
            </GlassCardFooter>
        </GlassCard>
    ),
};
