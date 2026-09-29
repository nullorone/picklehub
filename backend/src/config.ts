export interface AppConfig {
    nodeEnv: 'development' | 'test' | 'production';
    host: string;
    port: number;
    databaseUrl: string;
    frontendOrigins: string[];
    logLevel: 'error' | 'warn' | 'info';
    telegramBotToken: string;
    telegramWebhookSecret: string;
    telegramAppUrl: string;
}

const allowedNodeEnvs = ['development', 'test', 'production'] as const;
const allowedLogLevels = ['error', 'warn', 'info'] as const;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
    const errors: string[] = [];
    const nodeEnv = env.NODE_ENV ?? 'development';
    if (!allowedNodeEnvs.includes(nodeEnv as (typeof allowedNodeEnvs)[number])) {
        errors.push('NODE_ENV must be development, test, or production');
    }

    const host = env.HOST ?? '127.0.0.1';
    const portValue = env.PORT ?? '3000';
    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push('PORT must be an integer between 1 and 65535');
    }

    const databaseUrl = env.DATABASE_URL ?? '';
    try {
        const parsed = new URL(databaseUrl);
        if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
            errors.push('DATABASE_URL must use the PostgreSQL protocol');
        }
    } catch {
        errors.push('DATABASE_URL must be a valid PostgreSQL URL');
    }

    const frontendOrigins = (env.FRONTEND_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    for (const origin of frontendOrigins) {
        try {
            const parsed = new URL(origin);
            if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
                errors.push('FRONTEND_ORIGINS must contain only HTTP(S) origins');
                break;
            }
        } catch {
            errors.push('FRONTEND_ORIGINS must contain only valid HTTP(S) origins');
            break;
        }
    }

    const logLevel = env.LOG_LEVEL ?? 'info';
    if (!allowedLogLevels.includes(logLevel as (typeof allowedLogLevels)[number])) {
        errors.push('LOG_LEVEL must be error, warn, or info');
    }

    const telegramBotToken = env.TELEGRAM_BOT_TOKEN ?? '';
    if (!telegramBotToken || telegramBotToken.length > 512) {
        errors.push('TELEGRAM_BOT_TOKEN must be configured');
    }
    const telegramWebhookSecret = env.TELEGRAM_WEBHOOK_SECRET ?? '';
    const telegramAppUrl = env.TELEGRAM_APP_URL ?? '';
    if (nodeEnv === 'production' && !/^[A-Za-z0-9_-]{1,256}$/.test(telegramWebhookSecret)) {
        errors.push('TELEGRAM_WEBHOOK_SECRET must be configured');
    }
    if (nodeEnv === 'production') {
        try {
            if (new URL(telegramAppUrl).protocol !== 'https:') errors.push('TELEGRAM_APP_URL must be HTTPS');
        } catch {
            errors.push('TELEGRAM_APP_URL must be a valid HTTPS URL');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Invalid configuration: ${errors.join('; ')}`);
    }

    return {
        nodeEnv: nodeEnv as AppConfig['nodeEnv'],
        host,
        port,
        databaseUrl,
        frontendOrigins,
        logLevel: logLevel as AppConfig['logLevel'],
        telegramBotToken,
        telegramWebhookSecret,
        telegramAppUrl,
    };
}
