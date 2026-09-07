import { z } from 'zod';

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
        OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
        OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
        OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(10),
        OUTBOX_CLAIM_TTL_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
    })
    .superRefine((environment, context) => {
        if (environment.NODE_ENV === 'production' && environment.REDIS_NAMESPACE === 'local') {
            context.addIssue({
                code: 'custom',
                path: ['REDIS_NAMESPACE'],
                message: 'Production must use an explicit non-local Redis namespace',
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
