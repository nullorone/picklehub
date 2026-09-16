import { z } from 'zod';

const httpsUrl = z
    .url()
    .refine((value) => value.startsWith('https://'), { message: 'External provider URLs must use HTTPS' });

const environmentSchema = z
    .object({
        NODE_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
        APP_ROLE: z.enum(['api', 'worker']).default('api'),
        HOST: z.string().min(1).default('0.0.0.0'),
        PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
        DATABASE_URL: z.string().min(1).startsWith('postgresql://'),
        REDIS_URL: z
            .string()
            .min(1)
            .regex(/^rediss?:\/\//u),
        REDIS_NAMESPACE: z
            .string()
            .min(1)
            .regex(/^[a-z0-9-]+$/u)
            .default('local'),
        LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
        DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(1000),
        SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
        HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().min(16_384).max(2_097_152).default(262_144),
        HTTP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10_000).default(300),
        HEALTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(1000).default(120),
        OPERATIONS_METRICS_KEY: z.string().min(32).optional(),
        CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(2).max(100).default(5),
        CIRCUIT_BREAKER_RESET_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
        EMERGENCY_DISABLE_CONTENT: z.enum(['true', 'false']).default('false'),
        EMERGENCY_DISABLE_ADVERTISING: z.enum(['true', 'false']).default('false'),
        EMERGENCY_DISABLE_MINI_GAME: z.enum(['true', 'false']).default('false'),
        EMERGENCY_DISABLE_OUTBOUND_NOTIFICATIONS: z.enum(['true', 'false']).default('false'),
        EMERGENCY_DISABLE_VENUE_PROVIDERS: z.enum(['true', 'false']).default('false'),
        RU_DATA_RESIDENCY_CONFIRMED: z.enum(['true', 'false']).default('false'),
        OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
        OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
        OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(10),
        OUTBOX_CLAIM_TTL_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
        IDENTITY_HMAC_KEY: z.string().min(32).default('local-identity-hmac-key-change-me-0001'),
        IDENTITY_ENCRYPTION_KEY: z
            .string()
            .regex(/^[a-f0-9]{64}$/u)
            .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
        TELEGRAM_BOT_TOKEN: z.string().min(1).default('local-telegram-bot-token'),
        IDENTITY_ALLOWED_ORIGINS: z.string().default('https://localhost'),
        MAGIC_LINK_BASE_URL: z
            .url()
            .refine((value) => value.startsWith('https://'))
            .default('https://localhost/auth/email'),
        EMAIL_PROVIDER_ENDPOINT: z
            .url()
            .refine((value) => value.startsWith('https://'))
            .optional(),
        EMAIL_PROVIDER_TOKEN: z.string().min(32).optional(),
        VENUE_PROVIDER_POLICY_VERSION: z.string().min(1).optional(),
        VENUE_OVERPASS_ENDPOINT: httpsUrl.optional(),
        VENUE_OVERPASS_USER_AGENT: z.string().min(8).max(200).optional(),
        VENUE_OVERPASS_LICENSE: z.string().min(1).max(160).optional(),
        VENUE_OVERPASS_ATTRIBUTION_TEXT: z.string().min(1).max(300).optional(),
        VENUE_OVERPASS_ATTRIBUTION_LINK: httpsUrl.optional(),
        VENUE_OVERPASS_STORAGE_ALLOWED: z.enum(['true', 'false']).default('false'),
        VENUE_OVERPASS_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).max(300_000).default(10_000),
        VENUE_GEOCODER_ENDPOINT: httpsUrl.optional(),
        VENUE_GEOCODER_TOKEN: z.string().min(16).optional(),
        VENUE_GEOCODER_STORAGE_ALLOWED: z.enum(['true', 'false']).default('false'),
        VENUE_GEOCODER_ATTRIBUTION_TEXT: z.string().min(1).max(300).optional(),
        VENUE_GEOCODER_ATTRIBUTION_LINK: httpsUrl.optional(),
        VENUE_GEOCODER_LICENSE: z.string().min(1).max(160).optional(),
        MATCH_POLICY_VERSION: z.string().min(1).max(64).default('matches-v1'),
        MATCH_PUBLISH_MINIMUM_LEAD_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
        MATCH_PUBLISH_HORIZON_DAYS: z.coerce.number().int().min(1).max(365).default(90),
        MATCH_WAITLIST_OFFER_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
        MATCH_START_EARLY_MINUTES: z.coerce.number().int().min(0).max(1440).default(30),
        MATCH_START_LATE_HOURS: z.coerce.number().int().min(1).max(72).default(6),
        MATCH_RESULT_DEADLINE_HOURS: z.coerce.number().int().min(1).max(720).default(72),
        MATCH_CONFIRMATION_DEADLINE_HOURS: z.coerce.number().int().min(1).max(720).default(48),
        COMMUNICATION_DELIVERY_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
        COMMUNICATION_DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(12).default(8),
        COMMUNICATION_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5000),
        COMMUNICATION_ENCRYPTION_KEY: z
            .string()
            .regex(/^[a-f0-9]{64}$/u)
            .default('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'),
        COMMUNICATION_HMAC_KEY: z.string().min(32).default('local-communication-hmac-key-0001'),
        SAFETY_ENCRYPTION_KEY: z
            .string()
            .regex(/^[a-f0-9]{64}$/u)
            .default('89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567'),
        SAFETY_POLICY_VERSION: z.string().min(1).max(128).default('trust-safety-v1'),
        NOTIFICATION_EMAIL_PROVIDER_ENDPOINT: httpsUrl.optional(),
        NOTIFICATION_EMAIL_PROVIDER_TOKEN: z.string().min(32).optional(),
        NOTIFICATION_TELEGRAM_ENABLED: z.enum(['true', 'false']).default('false'),
        NOTIFICATION_EMAIL_ENABLED: z.enum(['true', 'false']).default('false'),
        PROFILE_DUPR_POLICY_VERSION: z.string().min(1).max(128).optional(),
        PROFILE_DUPR_ALLOWED_HOSTS: z.string().default(''),
        PROFILE_DUPR_ALLOWED_PATH_PATTERN: z.string().max(500).default('^/player/[^/]+/?$'),
        PROFILE_DUPR_OUTBOUND_ENABLED: z.enum(['true', 'false']).default('false'),
        PROFILE_AVATAR_STORAGE_BASE_URL: httpsUrl.optional(),
        CONTENT_PUBLIC_BASE_URL: httpsUrl.optional(),
        CONTENT_MEDIA_BASE_URL: httpsUrl.optional(),
        CONTENT_FETCH_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).optional(),
        CONTENT_FETCH_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).optional(),
        CONTENT_SOURCE_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).max(3_600_000).optional(),
        CONTENT_CHECKLIST_VERSION: z
            .string()
            .regex(/^[1-9][0-9]*\.[0-9]+\.[0-9]+$/u)
            .optional(),
        ADVERTISING_ASSET_BASE_URL: httpsUrl.default('https://localhost/assets/advertising'),
        MINI_GAME_SIGNING_KEY: z.string().min(32).default('local-mini-game-signing-key-change-me-0001'),
        MINI_GAME_ENCRYPTION_KEY: z
            .string()
            .regex(/^[a-f0-9]{64}$/u)
            .default('13579bdf2468ace013579bdf2468ace013579bdf2468ace013579bdf2468ace0'),
        MINI_GAME_ORIGIN: z
            .url()
            .refine((value) => /^https:\/\/[^/?#]+$/u.test(value), {
                message: 'Mini-game origin must be one exact HTTPS origin',
            })
            .default('https://game.localhost'),
        MINI_GAME_REWARDS_ENABLED: z.enum(['true', 'false']).default('true'),
        MINI_GAME_RU_RESIDENCY_CONFIRMED: z.enum(['true', 'false']).default('false'),
        MINI_GAME_DAILY_SESSION_LIMIT: z.coerce.number().int().min(1).max(20).default(20),
        MINI_GAME_DAILY_RESULT_LIMIT: z.coerce.number().int().min(1).max(10).default(10),
    })
    .superRefine((environment, context) => {
        if (environment.NODE_ENV === 'production' && environment.REDIS_NAMESPACE === 'local') {
            context.addIssue({
                code: 'custom',
                path: ['REDIS_NAMESPACE'],
                message: 'Production must use an explicit non-local Redis namespace',
            });
        }
        const allowedOrigins = environment.IDENTITY_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());
        if (
            environment.NODE_ENV === 'production' &&
            (allowedOrigins.length < 2 ||
                allowedOrigins.some(
                    (origin) =>
                        !/^https:\/\/[^/?#*]+$/u.test(origin) ||
                        origin.includes('*') ||
                        origin === 'https://localhost' ||
                        origin.endsWith('.invalid')
                ))
        ) {
            context.addIssue({
                code: 'custom',
                path: ['IDENTITY_ALLOWED_ORIGINS'],
                message: 'Production requires exact HTTPS web and TMA origins without wildcards',
            });
        }
        if (environment.NODE_ENV === 'production' && environment.OPERATIONS_METRICS_KEY === undefined) {
            context.addIssue({
                code: 'custom',
                path: ['OPERATIONS_METRICS_KEY'],
                message: 'Production requires a separately rotated operations metrics key',
            });
        }
        if (environment.NODE_ENV === 'production' && environment.RU_DATA_RESIDENCY_CONFIRMED !== 'true') {
            context.addIssue({
                code: 'custom',
                path: ['RU_DATA_RESIDENCY_CONFIRMED'],
                message: 'Production requires an explicit Russian data residency approval gate',
            });
        }
        if (
            environment.NODE_ENV === 'production' &&
            (environment.IDENTITY_HMAC_KEY.startsWith('local-') ||
                environment.IDENTITY_ENCRYPTION_KEY.startsWith('0123456789abcdef') ||
                environment.TELEGRAM_BOT_TOKEN.startsWith('local-'))
        ) {
            context.addIssue({
                code: 'custom',
                path: ['IDENTITY_HMAC_KEY'],
                message: 'Production identity secrets must be explicitly configured',
            });
        }
        if (
            environment.NODE_ENV === 'production' &&
            (environment.MINI_GAME_SIGNING_KEY.startsWith('local-') ||
                environment.MINI_GAME_ENCRYPTION_KEY.startsWith('13579bdf2468ace0'))
        ) {
            context.addIssue({
                code: 'custom',
                path: ['MINI_GAME_SIGNING_KEY'],
                message: 'Production mini-game secrets must be explicitly configured',
            });
        }
        if (
            environment.NODE_ENV === 'production' &&
            environment.MINI_GAME_REWARDS_ENABLED === 'true' &&
            environment.MINI_GAME_RU_RESIDENCY_CONFIRMED !== 'true'
        ) {
            context.addIssue({
                code: 'custom',
                path: ['MINI_GAME_RU_RESIDENCY_CONFIRMED'],
                message: 'Production mini-game rewards require confirmed Russian data residency',
            });
        }
        if (
            environment.NODE_ENV === 'production' &&
            (environment.COMMUNICATION_ENCRYPTION_KEY.startsWith('abcdef0123456789') ||
                environment.COMMUNICATION_HMAC_KEY.startsWith('local-'))
        ) {
            context.addIssue({
                code: 'custom',
                path: ['COMMUNICATION_ENCRYPTION_KEY'],
                message: 'Production communication encryption key must be explicitly configured',
            });
        }
        if (environment.NODE_ENV === 'production' && environment.SAFETY_ENCRYPTION_KEY.startsWith('89abcdef01234567')) {
            context.addIssue({
                code: 'custom',
                path: ['SAFETY_ENCRYPTION_KEY'],
                message: 'Production safety encryption key must be explicitly configured',
            });
        }
        if (
            environment.NOTIFICATION_EMAIL_ENABLED === 'true' &&
            (environment.NOTIFICATION_EMAIL_PROVIDER_ENDPOINT === undefined ||
                environment.NOTIFICATION_EMAIL_PROVIDER_TOKEN === undefined)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['NOTIFICATION_EMAIL_PROVIDER_ENDPOINT'],
                message: 'Notification email delivery requires an explicitly configured provider',
            });
        }
        const overpassConfigured = environment.VENUE_OVERPASS_ENDPOINT !== undefined;
        if (
            overpassConfigured &&
            (environment.VENUE_OVERPASS_STORAGE_ALLOWED !== 'true' ||
                environment.VENUE_PROVIDER_POLICY_VERSION === undefined ||
                environment.VENUE_OVERPASS_USER_AGENT === undefined ||
                environment.VENUE_OVERPASS_LICENSE === undefined ||
                environment.VENUE_OVERPASS_ATTRIBUTION_TEXT === undefined)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['VENUE_OVERPASS_ENDPOINT'],
                message: 'Overpass requires an approved storage capability and complete provenance metadata',
            });
        }
        const geocoderConfigured = environment.VENUE_GEOCODER_ENDPOINT !== undefined;
        if (
            geocoderConfigured &&
            (environment.VENUE_PROVIDER_POLICY_VERSION === undefined ||
                environment.VENUE_GEOCODER_ATTRIBUTION_TEXT === undefined ||
                environment.VENUE_GEOCODER_LICENSE === undefined)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['VENUE_GEOCODER_ENDPOINT'],
                message: 'Geocoder requires complete reviewed provenance metadata',
            });
        }
        if (
            environment.NODE_ENV === 'production' &&
            (environment.EMAIL_PROVIDER_ENDPOINT === undefined || environment.EMAIL_PROVIDER_TOKEN === undefined)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['EMAIL_PROVIDER_ENDPOINT'],
                message: 'Production requires an approved email provider adapter',
            });
        }
        if (environment.PROFILE_DUPR_ALLOWED_HOSTS !== '' && environment.PROFILE_DUPR_POLICY_VERSION === undefined) {
            context.addIssue({
                code: 'custom',
                path: ['PROFILE_DUPR_POLICY_VERSION'],
                message: 'DUPR links require an explicitly reviewed policy version',
            });
        }
        if (
            environment.PROFILE_DUPR_OUTBOUND_ENABLED === 'true' &&
            (environment.PROFILE_DUPR_ALLOWED_HOSTS === '' || environment.PROFILE_DUPR_POLICY_VERSION === undefined)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['PROFILE_DUPR_OUTBOUND_ENABLED'],
                message: 'DUPR outbound links require an approved allowlist and policy version',
            });
        }
    });

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
    const result = environmentSchema.safeParse(input);

    if (!result.success) {
        const fields = result.error.issues.map((issue) => issue.path.join('.') || 'environment').join(', ');
        throw new Error(`Invalid environment configuration: ${fields}`);
    }

    return result.data;
}

export function getEnvironment(): Environment {
    cachedEnvironment ??= parseEnvironment(process.env);
    return cachedEnvironment;
}

export function resetEnvironmentCache(): void {
    cachedEnvironment = undefined;
}
