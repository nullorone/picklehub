import { CalendarDays, Check, Clock, Eye, Share } from 'lucide-react';
import { useEffect } from 'react';
import { GlassButton } from '../Button/Button';
import { GlassCard, GlassCardContent, GlassCardHeader } from '../liquid-glass/glass-card';
import {
    GlassDialog,
    GlassDialogContent,
    GlassDialogDescription,
    GlassDialogTitle,
} from '../liquid-glass/glass-dialog';
import { confettiOptions, eventDateOptions, eventTimeOptions } from './const';
import type { EventCreatedDialogProps } from './types';

export function EventCreatedDialog({
    open,
    startsAt,
    timeZone,
    shareMessage,
    onClose,
    onShare,
}: EventCreatedDialogProps) {
    useEffect(() => {
        if (!open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let disposed = false;
        let reset: (() => void) | undefined;
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        canvas.dataset.eventConfetti = '';
        canvas.className = 'pointer-events-none fixed inset-0 z-[60] h-full w-full';

        void import('canvas-confetti')
            .then(({ default: confetti }) => {
                if (disposed) return;
                document.body.appendChild(canvas);
                const fire = confetti.create(canvas, { resize: true, disableForReducedMotion: true });
                reset = () => fire.reset();
                void fire({ ...confettiOptions, angle: 60, origin: { x: 0, y: 0.65 } });
                const finished = fire({ ...confettiOptions, angle: 120, origin: { x: 1, y: 0.65 } });
                void finished?.then(() => canvas.remove());
            })
            .catch(() => canvas.remove());

        return () => {
            disposed = true;
            reset?.();
            canvas.remove();
        };
    }, [open]);

    const date = new Date(startsAt);
    const dateLabel = new Intl.DateTimeFormat('ru-RU', { ...eventDateOptions, timeZone }).format(date);
    const timeLabel = new Intl.DateTimeFormat('ru-RU', { ...eventTimeOptions, timeZone }).format(date);

    return (
        <GlassDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <GlassDialogContent className="max-w-md border-0 bg-slate-950/90 p-0 shadow-none before:hidden">
                <GlassCard>
                    <GlassCardHeader className="space-y-2 text-center">
                        <div className="mb-2 flex justify-center">
                            <div className="rounded-lg bg-linear-to-br from-cyan-400 to-blue-500 p-2">
                                <Check className="h-6 w-6 text-white" aria-hidden="true" />
                            </div>
                        </div>
                        <GlassDialogTitle className="text-xl">Событие успешно создано</GlassDialogTitle>
                        <GlassDialogDescription>Всё готово! Пригласите игроков присоединиться.</GlassDialogDescription>
                    </GlassCardHeader>
                    <GlassCardContent className="space-y-5">
                        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-white">
                            <p className="text-sm text-white/60">Начало события</p>
                            <time dateTime={startsAt} className="grid gap-3">
                                <span className="flex items-center gap-3">
                                    <CalendarDays className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                                    {dateLabel}
                                </span>
                                <span className="flex items-center gap-3">
                                    <Clock className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                                    {timeLabel}
                                </span>
                            </time>
                        </div>
                        <div className="grid gap-3">
                            <GlassButton
                                variant="primary"
                                size="lg"
                                className="border-0 focus-visible:ring-0"
                                onClick={onClose}
                            >
                                <Eye aria-hidden="true" />
                                Посмотреть
                            </GlassButton>
                            <GlassButton variant="accent" size="lg" onClick={onShare}>
                                <Share aria-hidden="true" />
                                Поделиться
                            </GlassButton>
                        </div>
                        {shareMessage && (
                            <p role="status" className="text-center text-sm text-white/80">
                                {shareMessage}
                            </p>
                        )}
                    </GlassCardContent>
                </GlassCard>
            </GlassDialogContent>
        </GlassDialog>
    );
}
