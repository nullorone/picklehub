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
    let instant = wallTime;
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: MOSCOW_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const fields = Object.fromEntries(
            formatter
                .formatToParts(new Date(instant))
                .map(({ type, value: part }) => [type, part]),
        );
        const representedWallTime = Date.UTC(
            Number(fields.year),
            Number(fields.month) - 1,
            Number(fields.day),
            Number(fields.hour),
            Number(fields.minute),
            Number(fields.second),
        );
        const correction = wallTime - representedWallTime;
        instant += correction;
        if (correction === 0) break;
    }
    const result = new Date(instant);
    return moscowDateTimeInput(result) === value
        ? result.toISOString()
        : undefined;
}
