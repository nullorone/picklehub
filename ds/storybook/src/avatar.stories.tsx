import { GlassAvatar, GlassAvatarImage, GlassAvatarFallback } from '@picklehub/ui-web';
export default { title: 'Components/Avatar' };
export const Example1 = {
    name: 'Basic Avatar',
    render: () => (
        <div className="flex gap-4">
            <GlassAvatar>
                <GlassAvatarImage src="/stylized-user-avatar.png" alt="User" />
                <GlassAvatarFallback>JD</GlassAvatarFallback>
            </GlassAvatar>
            <GlassAvatar>
                <GlassAvatarImage src="/avatar-woman.png" alt="User" />
                <GlassAvatarFallback>AB</GlassAvatarFallback>
            </GlassAvatar>
            <GlassAvatar>
                <GlassAvatarFallback>CN</GlassAvatarFallback>
            </GlassAvatar>
        </div>
    ),
};
export const Example2 = {
    name: 'Avatar Sizes',
    render: () => (
        <div className="flex items-center gap-4">
            <GlassAvatar className="h-8 w-8">
                <GlassAvatarFallback className="text-xs">SM</GlassAvatarFallback>
            </GlassAvatar>
            <GlassAvatar className="h-10 w-10">
                <GlassAvatarFallback className="text-sm">MD</GlassAvatarFallback>
            </GlassAvatar>
            <GlassAvatar className="h-14 w-14">
                <GlassAvatarFallback>LG</GlassAvatarFallback>
            </GlassAvatar>
            <GlassAvatar className="h-20 w-20">
                <GlassAvatarFallback className="text-lg">XL</GlassAvatarFallback>
            </GlassAvatar>
        </div>
    ),
};
