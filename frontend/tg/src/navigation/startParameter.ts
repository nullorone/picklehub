export function gameIdFromStartParameter(value: unknown): string | null {
    if (typeof value !== "string" || !value.startsWith("g_")) return null;
    const gameId = value.slice(2);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        gameId,
    )
        ? gameId.toLowerCase()
        : null;
}
