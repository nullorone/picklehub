const MOSCOW_TIME_ZONE = "Europe/Moscow";

export function moscowDateTimeInput(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: MOSCOW_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(value);
    const fields = Object.fromEntries(
        parts.map(({ type, value: part }) => [type, part]),
    );
    return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

export function moscowDateTimeToUtc(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) return undefined;
    const [, year, month, day, hour, minute] = match;
    const wallTime = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
    );
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: MOSCOW_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(wallTime));
    const fields = Object.fromEntries(
        parts.map(({ type, value: part }) => [type, part]),
    );
    if (
        fields.year !== year ||
        fields.month !== month ||
        fields.day !== day ||
        fields.hour !== hour ||
        fields.minute !== minute
    )
        return undefined;
    const representedWallTime = Date.UTC(
        Number(fields.year),
        Number(fields.month) - 1,
        Number(fields.day),
        Number(fields.hour),
        Number(fields.minute),
        Number(fields.second),
    );
    return new Date(wallTime - (representedWallTime - wallTime)).toISOString();
}
