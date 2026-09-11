export interface ResolvedLocalInstant {
    instant: Date;
    offsetMinutes: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/u;

export function assertTimeZone(timeZone: string): void {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export function resolveLocalInstant(
    localDate: string,
    localTime: string,
    timeZone: string,
    overlap: 'EARLIER_OFFSET' | 'LATER_OFFSET'
): ResolvedLocalInstant | null {
    const date = DATE_PATTERN.exec(localDate);
    const time = TIME_PATTERN.exec(localTime);
    if (date === null || time === null) throw new Error('Invalid local calendar position');
    assertTimeZone(timeZone);
    const parts = [Number(date[1]), Number(date[2]), Number(date[3]), Number(time[1]), Number(time[2])] as const;
    const naive = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });
    const candidates: ResolvedLocalInstant[] = [];
    for (let offsetMinutes = -840; offsetMinutes <= 840; offsetMinutes += 15) {
        const instant = new Date(naive - offsetMinutes * 60_000);
        const formatted = Object.fromEntries(
            formatter
                .formatToParts(instant)
                .filter((part) => part.type !== 'literal')
                .map((part) => [part.type, Number(part.value)])
        );
        if (
            formatted.year === parts[0] &&
            formatted.month === parts[1] &&
            formatted.day === parts[2] &&
            formatted.hour === parts[3] &&
            formatted.minute === parts[4]
        )
            candidates.push({ instant, offsetMinutes });
    }
    candidates.sort((left, right) => left.instant.getTime() - right.instant.getTime());
    const first = candidates[0];
    const last = candidates.at(-1);
    if (first === undefined || last === undefined) return null;
    return overlap === 'EARLIER_OFFSET' ? first : last;
}

export function localDateInZone(now: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

export function addCalendarDays(value: string, days: number): string {
    const match = DATE_PATTERN.exec(value);
    if (match === null) throw new Error('Invalid local date');
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
    return date.toISOString().slice(0, 10);
}

export function isoWeekday(value: string): number {
    const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
    return day === 0 ? 7 : day;
}

export function calendarDayDistance(from: string, to: string): number {
    return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}
