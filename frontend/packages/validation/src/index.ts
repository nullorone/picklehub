import { z } from 'zod';

const apiBaseUrlSchema = z
    .string()
    .trim()
    .min(1)
    .refine(
        (value) => value.startsWith('/') || URL.canParse(value),
        'apiBaseUrl must be an absolute URL or a root-relative path'
    );

export const runtimeConfigSchema = z
    .strictObject({
        apiBaseUrl: apiBaseUrlSchema,
        environment: z.enum(['development', 'test', 'production']),
        map: z
            .strictObject({
                attributionText: z.string().trim().min(1).max(200),
                attributionUrl: z.url().refine((value) => new URL(value).protocol === 'https:', 'Use an HTTPS link'),
                styleUrl: z
                    .string()
                    .trim()
                    .min(1)
                    .refine(
                        (value) =>
                            value.startsWith('/') || (URL.canParse(value) && new URL(value).protocol === 'https:'),
                        'map.styleUrl must be an HTTPS URL or a root-relative path'
                    ),
            })
            .optional(),
        release: z.string().trim().min(1).optional(),
    })
    .superRefine((config, context) => {
        if (config.environment !== 'production') return;
        if (config.apiBaseUrl !== '/v1') {
            context.addIssue({
                code: 'custom',
                path: ['apiBaseUrl'],
                message: 'Production browsers must use the reviewed same-origin /v1 API path',
            });
        }
        if (
            config.map !== undefined &&
            (config.map.attributionUrl.includes('.invalid') ||
                (!config.map.styleUrl.startsWith('/') &&
                    new URL(config.map.styleUrl).hostname !== 'tiles.picklehub.ru'))
        ) {
            context.addIssue({
                code: 'custom',
                path: ['map'],
                message: 'Production maps must use the reviewed tiles.picklehub.ru delivery origin',
            });
        }
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

const matchSkillSchema = z.coerce
    .number()
    .refine((value) => value >= 1 && value <= 5 && value * 2 === Math.round(value * 2), {
        message: 'Уровень должен быть от 1,0 до 5,0 с шагом 0,5',
    });

export const matchDraftFormSchema = z
    .strictObject({
        bookingNote: z.string().trim().max(280, 'Не более 280 символов'),
        bookingState: z.enum(['UNKNOWN', 'NOT_BOOKED', 'BOOKED_EXTERNALLY']),
        description: z.string().trim().max(1000, 'Не более 1000 символов'),
        format: z.enum(['SINGLES', 'DOUBLES']),
        joinMode: z.enum(['AUTO', 'APPROVAL']),
        skillMax: matchSkillSchema,
        skillMin: matchSkillSchema,
        startsLocal: z.string().min(1, 'Укажите дату и время'),
        timeZone: z.string().trim().min(1, 'Укажите часовой пояс').max(64),
        venueId: z.union([z.uuid('Выберите площадку'), z.literal('')]),
        visibility: z.enum(['PUBLIC', 'UNLISTED']),
    })
    .refine((value) => value.skillMin <= value.skillMax, {
        message: 'Минимальный уровень не может быть выше максимального',
        path: ['skillMax'],
    });

export type MatchDraftForm = z.input<typeof matchDraftFormSchema>;

export const matchGameSchema = z
    .strictObject({
        gameNumber: z.number().int().min(1).max(5),
        teamAPoints: z.coerce.number().int().min(0).max(99),
        teamBPoints: z.coerce.number().int().min(0).max(99),
    })
    .refine(
        (game) =>
            Math.max(game.teamAPoints, game.teamBPoints) >= 11 && Math.abs(game.teamAPoints - game.teamBPoints) >= 2,
        'Партия заканчивается минимум при 11 очках и разнице не менее двух'
    );

export function localDateTimeToUtc(localDateTime: string, timeZone: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(localDateTime);
    if (!match) throw new Error('Укажите корректные дату и время');
    const target = Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5])
    );
    const formatter = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        month: '2-digit',
        timeZone,
        year: 'numeric',
    });
    let instant = target;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const parts = Object.fromEntries(
            formatter
                .formatToParts(new Date(instant))
                .filter((part) => part.type !== 'literal')
                .map((part) => [part.type, Number(part.value)])
        );
        const represented = Date.UTC(
            parts.year ?? 0,
            (parts.month ?? 1) - 1,
            parts.day ?? 1,
            parts.hour === 24 ? 0 : (parts.hour ?? 0),
            parts.minute ?? 0
        );
        const correction = target - represented;
        if (correction === 0) return new Date(instant).toISOString();
        instant += correction;
    }
    throw new Error('Это местное время не существует из-за перевода часов. Выберите другое время.');
}

export function validateMatchSeries(
    series: 'BEST_OF_1' | 'BEST_OF_3' | 'BEST_OF_5',
    games: readonly { readonly teamAPoints: number; readonly teamBPoints: number }[]
): 'TEAM_A' | 'TEAM_B' {
    const winsNeeded = series === 'BEST_OF_1' ? 1 : series === 'BEST_OF_3' ? 2 : 3;
    let teamA = 0;
    let teamB = 0;
    for (const game of games) {
        if (teamA === winsNeeded || teamB === winsNeeded)
            throw new Error('После победы в серии лишних партий быть не должно');
        if (game.teamAPoints > game.teamBPoints) teamA += 1;
        else teamB += 1;
    }
    if (teamA !== winsNeeded && teamB !== winsNeeded)
        throw new Error('Добавьте партии до победы одной из команд в серии');
    return teamA > teamB ? 'TEAM_A' : 'TEAM_B';
}

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
