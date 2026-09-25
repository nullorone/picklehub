export interface TelegramGameLinkAdapter {
    createGameLink(gameId: string): string;
}

/** Telegram Mini App launch parameters are added by S16; this adapter currently uses the app's direct route. */
export const telegramGameLinkAdapter: TelegramGameLinkAdapter = {
    createGameLink: (gameId) => {
        const link = new URL(window.location.href);
        link.searchParams.delete("mockUser");
        link.searchParams.delete("mockScenario");
        link.hash = `/matches/${gameId}`;
        return link.toString();
    },
};

export function gameShareLink(gameId: string): string {
    return telegramGameLinkAdapter.createGameLink(gameId);
}
