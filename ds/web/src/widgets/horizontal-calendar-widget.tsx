'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GlassSeparator } from '../liquid-glass/glass-separator';
import { Space } from '../Space/Space';
import { cn } from '../utils';
import type { AgendaCalendarEvent } from './agenda-calendar-widget';

export interface HorizontalCalendarWidgetProps {
    /** Сегодняшняя дата для диапазона календаря и выбора по умолчанию. */
    date: Date;
    /** Количество месяцев от текущего вперёд, от 1 до 24. По умолчанию 12. */
    months?: number;
    /** Количество предыдущих месяцев, от 0 до 24. По умолчанию 12. */
    pastMonths?: number;
    /** Glass surface by default; plain renders without the background, border or glow. */
    variant?: 'glass' | 'plain';
    timeZone?: string;
    /** Upcoming events; marker colors match the agenda calendar. */
    events?: readonly AgendaCalendarEvent[];
    /** Выбранная дата в YYYY-MM-DD. Если не передана, по умолчанию выбрана сегодняшняя дата. */
    selectedDate?: string;
    onDateSelect?: (date: string) => void;
    className?: string;
}

const DAY_WIDTH = 56;

export function HorizontalCalendarWidget({
    date,
    months = 12,
    pastMonths = 12,
    variant = 'glass',
    timeZone,
    events = [],
    selectedDate,
    onDateSelect,
    className,
}: HorizontalCalendarWidgetProps) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).formatToParts(date);
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
    const year = part('year');
    const month = part('month') - 1;
    const today = part('day');
    const [internalSelectedDate, setInternalSelectedDate] = useState(() =>
        new Date(Date.UTC(year, month, today)).toISOString().slice(0, 10)
    );
    const activeDate = selectedDate ?? internalSelectedDate;
    const count = Number.isFinite(months) ? Math.min(24, Math.max(1, Math.floor(months))) : 12;
    const pastCount = Number.isFinite(pastMonths) ? Math.min(24, Math.max(0, Math.floor(pastMonths))) : 12;
    const todayIndex = Math.round((Date.UTC(year, month, today) - Date.UTC(year, month - pastCount, 1)) / 86400000);
    // Календарные даты в UTC сохраняют последовательность дней при переходе на летнее время.
    const days = useMemo(() => {
        const start = Date.UTC(year, month - pastCount, 1);
        const end = Date.UTC(year, month + count, 1);
        return Array.from(
            { length: Math.round((end - start) / 86400000) },
            (_, index) => new Date(start + index * 86400000)
        );
    }, [year, month, count, pastCount]);
    const selectedIndex = days.findIndex((day) => day.toISOString().slice(0, 10) === activeDate);
    const targetIndex = selectedIndex >= 0 ? selectedIndex : todayIndex;
    const eventDays = new Map<string, AgendaCalendarEvent[]>();
    const eventFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const upcoming = events
        .map((event) => ({ ...event, start: new Date(event.startsAt) }))
        .filter((event) => Number.isFinite(event.start.getTime()) && event.start.getTime() >= date.getTime())
        .sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const event of upcoming) {
        const parts = eventFormatter.formatToParts(event.start);
        const value = (type: string) => parts.find((part) => part.type === type)?.value;
        const key = `${value('year')}-${value('month')}-${value('day')}`;
        eventDays.set(key, [...(eventDays.get(key) ?? []), event]);
    }
    const viewport = useRef<HTMLDivElement>(null);
    const targetScrollLeft = useRef(targetIndex * DAY_WIDTH);
    const returnTimer = useRef<ReturnType<typeof setTimeout>>();
    const [visibleIndex, setVisibleIndex] = useState(targetIndex);
    const [padding, setPadding] = useState(0);

    const updateMonth = () => {
        const element = viewport.current;
        if (!element) return;
        const edge = Math.max(0, (element.clientWidth - DAY_WIDTH) / 2);
        const center = element.scrollLeft + element.clientWidth / 2 - edge;
        const index = Math.max(0, Math.min(days.length - 1, Math.floor(center / DAY_WIDTH)));
        // The first day still belongs to the previous label; switch when day 2 reaches the center.
        setVisibleIndex(index > 0 && days[index].getUTCDate() === 1 ? index - 1 : index);
        clearTimeout(returnTimer.current);
        if (Math.abs(element.scrollLeft - targetScrollLeft.current) > 1) {
            returnTimer.current = setTimeout(() => {
                element.scrollTo({ left: targetScrollLeft.current, behavior: 'smooth' });
            }, 3000);
        }
    };

    useLayoutEffect(() => {
        targetScrollLeft.current = targetIndex * DAY_WIDTH;
        clearTimeout(returnTimer.current);
        returnTimer.current = setTimeout(() => {
            viewport.current?.scrollTo({ left: targetScrollLeft.current, behavior: 'smooth' });
        }, 3000);
        return () => clearTimeout(returnTimer.current);
    }, [targetIndex]);

    useLayoutEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const resize = () => setPadding(Math.max(0, (element.clientWidth - DAY_WIDTH) / 2));
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        return () => observer.disconnect();
    }, [variant]);

    useLayoutEffect(() => {
        const element = viewport.current;
        if (!element) return;
        clearTimeout(returnTimer.current);
        element.scrollLeft = targetScrollLeft.current;
        setVisibleIndex(Math.round(targetScrollLeft.current / DAY_WIDTH));
        return () => clearTimeout(returnTimer.current);
    }, [year, month, todayIndex, count, pastCount, padding, variant]);

    const labelDate = days[Math.min(visibleIndex, days.length - 1)];
    const label = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long' }).format(labelDate);
    const fullDate = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', dateStyle: 'full' });

    const Container = variant === 'plain' ? 'div' : Space;

    return (
        <Container
            {...(variant === 'glass' ? { padding: 0 } : {})}
            className={cn('w-full grid min-w-0 max-w-[646px]', className)}
        >
            <div
                ref={viewport}
                role="region"
                aria-label="Календарь дат, прокрутка по горизонтали"
                tabIndex={0}
                onScroll={updateMonth}
                className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-t-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
                <div className="flex w-max items-stretch pt-3 pb-0" style={{ paddingInline: padding }}>
                    {days.map((day, index) => {
                        const key = day.toISOString().slice(0, 10);
                        const isPast = index < todayIndex;
                        const isSelected = activeDate === key;
                        const dayEvents = eventDays.get(key) ?? [];
                        return (
                            <div
                                key={day.toISOString()}
                                className="relative flex h-14 w-14 shrink-0 items-center justify-center"
                            >
                                <button
                                    type="button"
                                    aria-label={`${fullDate.format(day)}${dayEvents.length ? `, событий: ${dayEvents.length}` : ''}`}
                                    aria-pressed={isSelected}
                                    onClick={() => {
                                        setInternalSelectedDate(key);
                                        onDateSelect?.(key);
                                    }}
                                    className="flex size-11 cursor-pointer items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                                >
                                    <time
                                        dateTime={day.toISOString().slice(0, 10)}
                                        aria-current={index === todayIndex ? 'date' : undefined}
                                        className={cn(
                                            'relative flex size-9 items-center justify-center rounded-full text-xl tabular-nums text-white/70',
                                            isSelected && 'text-cyan-400 ring-1 ring-cyan-400/50',
                                            isPast && !isSelected && 'text-white/25'
                                        )}
                                    >
                                        {day.getUTCDate()}
                                        {dayEvents.length > 0 && (
                                            <span
                                                aria-hidden="true"
                                                className="pointer-events-none absolute -bottom-[8px] left-1/2 flex -translate-x-1/2 gap-px text-amber-400"
                                            >
                                                {dayEvents.slice(0, 3).map((event) => (
                                                    <span
                                                        key={event.id}
                                                        className="size-[3px] rounded-full"
                                                        style={{ backgroundColor: event.color ?? 'currentColor' }}
                                                    />
                                                ))}
                                            </span>
                                        )}
                                    </time>
                                </button>
                                {index < days.length - 1 && (
                                    <GlassSeparator
                                        orientation="vertical"
                                        className="absolute right-0 inset-y-2 h-auto bg-gradient-to-b"
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <p
                aria-live="polite"
                aria-atomic="true"
                className="px-4 pb-3 pt-1 text-center text-sm font-medium capitalize text-white/60"
            >
                {label}
            </p>
        </Container>
    );
}
