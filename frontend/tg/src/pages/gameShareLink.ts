export interface TelegramGameLinkAdapter {
    createGameLink(gameId: string): string;
}

export const telegramGameLinkAdapter: TelegramGameLinkAdapter = {
    createGameLink: (gameId) => {
        const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
        if (botUsername && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(botUsername)) {
            return `https://t.me/${botUsername}?start=g_${gameId}`;
        }
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
