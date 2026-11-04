'use client';

import { GlassWidgetBase } from './base-widget';
import { cn } from '../utils';

export interface AgendaCalendarEvent {
    id: string;
    title: string;
    /** ISO timestamp with UTC offset, or a Date representing an instant. */
    startsAt: string | Date;
    /** CSS color for the outlined calendar marker. */
    color?: string;
}

export interface AgendaCalendarWidgetProps {
    /** Current instant, supplied by the host so SSR and client render the same date. */
    date: Date;
    events?: readonly AgendaCalendarEvent[];
    /** Defaults to the viewer's local time zone. */
    timeZone?: string;
    /** Month views highlight date as today. month-events is a compatible alias for month. */
    variant?: 'agenda' | 'month' | 'month-events';
    className?: string;
}

function AgendaMonth({
    date,
    timeZone,
    events,
}: Pick<AgendaCalendarWidgetProps, 'date' | 'timeZone'> & {
    events: readonly (AgendaCalendarEvent & { start: Date })[];
}) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    });
    const parts = formatter.formatToParts(date);
    const part = (type: string) => Number(parts.find((value) => value.type === type)?.value);
    const year = part('year');
    const month = part('month');
    const today = part('day');
    const eventDays = new Map<number, (typeof events)[number][]>();
    for (const event of events) {
        const eventParts = formatter.formatToParts(event.start);
        const eventPart = (type: string) => Number(eventParts.find((value) => value.type === type)?.value);
        if (eventPart('year') === year && eventPart('month') === month) {
            const day = eventPart('day');
            eventDays.set(day, [...(eventDays.get(day) ?? []), event]);
        }
    }
    // UTC arithmetic preserves the viewer's calendar date across DST and host time zones.
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weeks = Math.ceil((offset + daysInMonth) / 7);

    return (
        <table className="w-full table-fixed border-separate border-spacing-0 text-center">
            <caption className="mb-[1.2cqw] text-left text-[clamp(11px,3.1cqw,20px)] font-semibold uppercase leading-tight tracking-wide text-white/60">
                {new Intl.DateTimeFormat('ru-RU', { timeZone, month: 'long', year: 'numeric' }).format(date)}
            </caption>
            <thead>
                <tr>
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                        <th
                            key={day}
                            scope="col"
                            className="pb-[1cqw] text-[clamp(9px,1.85cqw,12px)] font-medium text-white/60"
                        >
                            {day}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {Array.from({ length: weeks }, (_, week) => (
                    <tr key={week}>
                        {Array.from({ length: 7 }, (_, weekday) => {
                            const day = week * 7 + weekday - offset + 1;
                            return (
                                <td key={weekday} className="pt-[0.3cqw] pb-[clamp(6px,1.2cqw,8px)]">
                                    {day > 0 && day <= daysInMonth && (
                                        <span
                                            aria-current={day === today ? 'date' : undefined}
                                            className={cn(
                                                'relative mx-auto flex size-[clamp(14px,4.3cqw,28px)] items-center justify-center rounded-full text-[clamp(10px,2.15cqw,14px)] text-white/70',
                                                day === today &&
                                                    'bg-white/25 font-medium text-white shadow-sm ring-1 ring-cyan-400/50'
                                            )}
                                        >
                                            {day}
                                            {eventDays.has(day) && (
                                                <>
                                                    <span className="sr-only"> — запланированы события</span>
                                                    <span
                                                        aria-hidden="true"
                                                        className="absolute -bottom-[5px] left-1/2 flex -translate-x-1/2 gap-px text-amber-400"
                                                    >
                                                        {eventDays
                                                            .get(day)
                                                            ?.slice(0, 3)
                                                            .map((event) => (
                                                                <span
                                                                    key={event.id}
                                                                    className="size-[3px] rounded-full"
                                                                    style={{
                                                                        backgroundColor: event.color ?? 'currentColor',
                                                                    }}
                                                                />
                                                            ))}
                                                    </span>
                                                </>
                                            )}
                                        </span>
                                    )}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** A two-column daily summary with the next day's agenda, inspired by the Apple widget. */
export function AgendaCalendarWidget({
    date,
    events = [],
    timeZone,
    variant = 'agenda',
    className,
}: AgendaCalendarWidgetProps) {
    const dayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const format = (value: Date, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat('ru-RU', { ...options, timeZone }).format(value);
    const today = dayKey.format(date);
    const scheduled = events
        .map((event) => ({ ...event, start: new Date(event.startsAt) }))
        .filter((event) => Number.isFinite(event.start.getTime()))
        .sort((a, b) => a.start.getTime() - b.start.getTime());
    const upcoming = scheduled.filter((event) => event.start.getTime() >= date.getTime());
    const todayEvents = upcoming.filter((event) => dayKey.format(event.start) === today);
    const futureEvents = upcoming.filter((event) => dayKey.format(event.start) !== today);
    const nextDate = futureEvents[0]?.start;
    const nextEvents = nextDate
        ? upcoming.filter((event) => dayKey.format(event.start) === dayKey.format(nextDate))
        : [];

    const renderEvents = (items: typeof upcoming, label: string) => (
        <ul className="space-y-[1cqw]" aria-label={label}>
            {items.slice(0, 2).map((event) => (
                <li
                    key={event.id}
                    className="flex items-start gap-[1.3cqw] rounded-lg border border-white/5 bg-white/10 px-[1cqw] py-[0.6cqw]"
                >
                    <span
                        aria-hidden="true"
                        className="mt-[0.3cqw] size-[clamp(12px,3.7cqw,24px)] shrink-0 rounded-full border-2 text-amber-400"
                        style={{ borderColor: event.color ?? 'currentColor' }}
                    />
                    <div className="min-w-0 text-[clamp(13px,3.7cqw,24px)] leading-[1.1]">
                        <div className="line-clamp-2 font-semibold text-white/80" title={event.title}>
                            {event.title}
                        </div>
                        <time dateTime={event.start.toISOString()} className="text-white/60">
                            {format(event.start, {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                            })}
                        </time>
                    </div>
                </li>
            ))}
            {items.length > 3 && <li className="text-xs text-white/60">Ещё событий: {items.length - 3}</li>}
        </ul>
    );

    const agenda = (
        <div className="min-w-0">
            <div className="mb-[1.2cqw] text-[clamp(11px,3.1cqw,20px)] font-semibold uppercase leading-tight tracking-wide text-white/60">
                {nextDate ? format(nextDate, { weekday: 'long', day: 'numeric', month: 'short' }) : 'Ближайшие события'}
            </div>
            {nextEvents.length ? (
                renderEvents(nextEvents, 'Ближайшие события')
            ) : (
                <p className="text-[clamp(13px,3.7cqw,24px)] leading-tight text-white/60">
                    Нет запланированных событий
                </p>
            )}
        </div>
    );

    return (
        <div className={cn('w-full max-w-[646px] min-w-0 [container-type:inline-size]', className)}>
            <GlassWidgetBase
                glowColor="purple"
                interactive={false}
                className="block min-h-[80px] p-[5cqw] [&>div]:w-full"
                aria-label="Календарь событий"
            >
                <div className="grid min-h-[36.5cqw] grid-cols-2 items-start gap-[5cqw]">
                    <div className="min-w-0">
                        <div className="text-[clamp(12px,3.1cqw,20px)] font-semibold uppercase leading-tight tracking-wide text-cyan-400">
                            {format(date, { weekday: 'long' })}
                        </div>
                        <time
                            dateTime={date.toISOString()}
                            aria-label={format(date, { dateStyle: 'full' })}
                            className="block text-[clamp(40px,9.9cqw,64px)] font-light leading-none tracking-tight text-white"
                        >
                            {format(date, { day: 'numeric' })}
                        </time>
                        <div className="mt-[2cqw]">
                            {todayEvents.length ? (
                                renderEvents(todayEvents, 'События сегодня')
                            ) : (
                                <p className="text-[clamp(16px,4.35cqw,28px)] leading-[1.2] text-white/60">
                                    Событий нет
                                </p>
                            )}
                        </div>
                    </div>
                    {variant !== 'agenda' ? (
                        <div className="min-w-0">
                            <AgendaMonth date={date} timeZone={timeZone} events={upcoming} />
                        </div>
                    ) : (
                        agenda
                    )}
                </div>
            </GlassWidgetBase>
        </div>
    );
}
