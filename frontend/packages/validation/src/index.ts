import { z } from 'zod';

const apiBaseUrlSchema = z
    .string()
    .trim()
    .min(1)
    .refine(
        (value) => value.startsWith('/') || URL.canParse(value),
        'apiBaseUrl must be an absolute URL or a root-relative path'
    );

export const runtimeConfigSchema = z.strictObject({
    apiBaseUrl: apiBaseUrlSchema,
    environment: z.enum(['development', 'test', 'production']),
    release: z.string().trim().min(1).optional(),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export function parseRuntimeConfig(value: unknown): RuntimeConfig {
    return runtimeConfigSchema.parse(value);
}
