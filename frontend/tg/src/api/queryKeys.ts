export const gameKeys = {
    all: ["games"] as const,
    lists: () => [...gameKeys.all, "list"] as const,
    list: (cursor?: string, limit = 20) =>
        [...gameKeys.lists(), { cursor, limit }] as const,
    details: () => [...gameKeys.all, "detail"] as const,
    detail: (gameId: string) => [...gameKeys.details(), gameId] as const,
};
