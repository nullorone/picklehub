import { timingSafeEqual } from 'node:crypto';

export const gameStartParameter = (gameId: string): string | null =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gameId)
        ? `g_${gameId.toLowerCase()}`
        : null;

export const gameIdFromStartParameter = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.startsWith('g_')) return null;
    const id = value.slice(2);
    return gameStartParameter(id) ? id.toLowerCase() : null;
};

export function safeSecretEquals(actual: unknown, expected: string): boolean {
    if (typeof actual !== 'string' || !expected) return false;
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
}

export function parseStartMessage(
    update: unknown
): { telegramUserId: bigint; chatId: bigint; gameId: string | null } | null {
    if (!update || typeof update !== 'object' || !('message' in update)) return null;
    const message = update.message;
    if (!message || typeof message !== 'object' || !('chat' in message) || !('from' in message) || !('text' in message))
        return null;
    const chat = message.chat;
    const sender = message.from;
    if (!chat || typeof chat !== 'object' || !('id' in chat) || !('type' in chat) || chat.type !== 'private')
        return null;
    if (!sender || typeof sender !== 'object' || !('id' in sender) || ('is_bot' in sender && sender.is_bot === true))
        return null;
    if (typeof message.text !== 'string') return null;
    const match = /^\/start(?:@[A-Za-z0-9_]{5,32})?(?: ([A-Za-z0-9_-]{1,64}))?$/.exec(message.text);
    if (!match) return null;
    const userId = String(sender.id);
    const chatId = String(chat.id);
    if (!/^\d{1,20}$/.test(userId) || !/^\d{1,20}$/.test(chatId) || userId !== chatId) return null;
    return { telegramUserId: BigInt(userId), chatId: BigInt(chatId), gameId: gameIdFromStartParameter(match[1]) };
}

export function miniAppUrl(baseUrl: string, gameId: string | null): string {
    const url = new URL(baseUrl);
    if (gameId) url.hash = `/matches/${gameId}`;
    return url.toString();
}
