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

export const onboardingFormSchema = z.strictObject({
    displayName: z
        .string()
        .trim()
        .min(2, 'Введите не менее 2 символов')
        .max(50, 'Введите не более 50 символов')
        .refine((value) => !/\p{Cc}/u.test(value), 'Уберите управляющие символы')
        .transform((value) => value.normalize('NFC')),
    duprProfileUrl: z
        .string()
        .trim()
        .refine((value) => value === '' || URL.canParse(value), 'Введите корректную ссылку')
        .refine((value) => value === '' || new URL(value).protocol === 'https:', 'Ссылка должна использовать HTTPS')
        .refine((value) => {
            if (value === '') return true;
            const url = new URL(value);
            return !url.username && !url.password && !url.search && !url.hash && !url.port;
        }, 'Ссылка не должна содержать логин, параметры, фрагмент или порт'),
    gameFormats: z.array(z.enum(['SINGLES', 'DOUBLES'])).min(1, 'Выберите хотя бы один формат'),
    localityId: z.uuid('Выберите населённый пункт'),
    skillSelfAssessment: z.coerce
        .number()
        .refine((value) => value >= 1 && value <= 5 && value * 2 === Math.round(value * 2), {
            message: 'Выберите уровень от 1,0 до 5,0 с шагом 0,5',
        }),
    timeZone: z.string().trim().min(1, 'Выберите часовой пояс').max(64),
});

export type OnboardingForm = z.input<typeof onboardingFormSchema>;

export const emailSchema = z.email('Введите корректный email').trim().max(320);

export function readSafeMagicFragment(hash: string): {
    readonly attemptId: string | undefined;
    readonly identityId: string | undefined;
    readonly token: string | undefined;
    readonly target: string;
} {
    const parameters = new URLSearchParams(hash.replace(/^#/u, ''));
    const token = parameters.get('token') ?? undefined;
    const attemptId = parameters.get('attempt') ?? undefined;
    const identityId = parameters.get('identity') ?? undefined;
    const requestedTarget = parameters.get('next') ?? '/onboarding';
    const target = ['/onboarding', '/account', '/'].includes(requestedTarget) ? requestedTarget : '/onboarding';
    return {
        attemptId: attemptId && z.uuid().safeParse(attemptId).success ? attemptId : undefined,
        identityId: identityId && z.uuid().safeParse(identityId).success ? identityId : undefined,
        token: token && /^[A-Za-z0-9_-]{43}$/u.test(token) ? token : undefined,
        target,
    };
}
