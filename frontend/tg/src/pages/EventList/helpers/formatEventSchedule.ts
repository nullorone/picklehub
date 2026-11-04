import type { GameEventSchedule } from "../types";

export function formatEventSchedule(
    event: Pick<GameEventSchedule, "startAt" | "endAt">,
) {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
    });
    const startDate = dateFormatter.format(start);
    const endDate = dateFormatter.format(end);
    const startTime = timeFormatter.format(start);
    const endTime = timeFormatter.format(end);

    return {
        date: startDate === endDate ? startDate : `${startDate} – ${endDate}`,
        time:
            startDate === endDate
                ? `${startTime}–${endTime}`
                : `${startDate}, ${startTime} – ${endDate}, ${endTime}`,
    };
}
