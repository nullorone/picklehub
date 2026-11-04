export function formatGameDate(value: string) {
    const date = new Date(value);
    const dateText = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
    }).format(date);
    const timeText = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
    }).format(date);
    return { dateText, timeText };
}

export function statusLabel(status: string) {
    if (status === "FULL") return "Мест нет";
    if (status === "CANCELLED") return "Отменена";
    return "Идёт набор";
}

export function getStatusBadgeVariant(status: string) {
    switch (status) {
        case "CANCELLED":
            return "destructive";
        case "FULL":
            return "success";
        default:
            return "warning";
    }
}
