import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
    id: string;
    first_name: string;
    last_name?: string;
    username?: string;
}

export function validateTelegramInitData(
    initData: string,
    botToken: string,
    nowSeconds = Math.floor(Date.now() / 1000)
): TelegramUser {
    if (typeof initData !== 'string' || initData.length < 1 || initData.length > 8192) {
        throw new Error('TELEGRAM_AUTH_INVALID');
    }

    const params = new URLSearchParams(initData);
    const entries = [...params.entries()];
    const values = new Map<string, string>();
    for (const [key, value] of entries) {
        if (!key || values.has(key)) throw new Error('TELEGRAM_AUTH_INVALID');
        values.set(key, value);
    }

    const suppliedHash = values.get('hash');
    const authDate = Number(values.get('auth_date'));
    const rawUser = values.get('user');
    if (!suppliedHash || !/^[a-f0-9]{64}$/i.test(suppliedHash) || !Number.isSafeInteger(authDate) || !rawUser) {
        throw new Error('TELEGRAM_AUTH_INVALID');
    }
    if (authDate > nowSeconds + 30 || nowSeconds - authDate > 86400) {
        throw new Error('TELEGRAM_AUTH_INVALID');
    }

    const dataCheckString = entries
        .filter(([key]) => key !== 'hash')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest();
    const actualHash = Buffer.from(suppliedHash, 'hex');
    if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
        throw new Error('TELEGRAM_AUTH_INVALID');
    }

    try {
        const user = JSON.parse(rawUser) as Partial<TelegramUser>;
        if (
            (typeof user.id !== 'string' && typeof user.id !== 'number') ||
            (typeof user.id === 'number' && !Number.isSafeInteger(user.id)) ||
            !/^\d{1,20}$/.test(String(user.id)) ||
            typeof user.first_name !== 'string' ||
            user.first_name.length < 1 ||
            user.first_name.length > 128
        ) {
            throw new Error('TELEGRAM_AUTH_INVALID');
        }
        return { ...user, id: String(user.id), first_name: user.first_name };
    } catch {
        throw new Error('TELEGRAM_AUTH_INVALID');
    }
}

export function createSessionToken(): string {
    return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
