import type { HTMLAttributes } from 'react';
import { ChartNoAxesColumnIncreasing } from 'lucide-react';
import { cn } from '../utils';
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription } from './glass-card';
import { GlassAvatar, GlassAvatarImage, GlassAvatarFallback } from './glass-avatar';

export interface GlassProfileCardProps extends HTMLAttributes<HTMLDivElement> {
    name: string;
    avatarSrc?: string;
    dupr?: string;
    duprLogoSrc?: string;
    ranking: number;
}

export function GlassProfileCard({
    name,
    avatarSrc,
    dupr,
    duprLogoSrc,
    ranking,
    className,
    ...props
}: GlassProfileCardProps) {
    return (
        <GlassCard className={className} {...props}>
            <GlassCardHeader className="flex-row items-center gap-4 p-6">
                <div className="shrink-0">
                    <GlassAvatar className="h-16 w-16">
                        {avatarSrc && <GlassAvatarImage src={avatarSrc} alt={name} />}
                        <GlassAvatarFallback className="text-2xl font-bold">
                            {name.trim().charAt(0).toUpperCase() || '?'}
                        </GlassAvatarFallback>
                    </GlassAvatar>
                </div>
                <div className="flex min-w-0 flex-col items-start gap-2">
                    <GlassCardTitle className="break-words leading-snug font-bold">{name}</GlassCardTitle>
                    <div
                        className={cn(
                            'inline-flex items-center gap-1 rounded-2xl border border-white/20',
                            'bg-white/10 px-2 py-0.5 text-sm text-white'
                        )}
                    >
                        {dupr ? (
                            <>
                                {duprLogoSrc ? (
                                    <img
                                        src={duprLogoSrc}
                                        alt="DUPR"
                                        width={32}
                                        height={16}
                                        className="h-4 w-8 rounded"
                                    />
                                ) : (
                                    <span>DUPR</span>
                                )}
                                <span>{dupr}</span>
                            </>
                        ) : (
                            <>
                                <ChartNoAxesColumnIncreasing size={14} className="shrink-0" aria-hidden="true" />
                                <span className="sr-only">Рейтинг DUPR отсутствует</span>
                                <span aria-hidden="true">-/-</span>
                            </>
                        )}
                    </div>
                    <GlassCardDescription className="text-white/90">Место в рейтинге #{ranking}</GlassCardDescription>
                </div>
            </GlassCardHeader>
        </GlassCard>
    );
}
