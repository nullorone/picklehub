import { z } from "zod";
import {
    Dumbbell,
    UsersRound,
    Shuffle,
    TrendingUp,
    Repeat2,
    Trophy,
    ListOrdered,
    Crown,
} from "lucide-react";
import { getFormatDescription } from "@/pages/EventList/helpers/getFormatDescription.ts";
import {
    moscowDateTimeInput,
    moscowDateTimeToUtc,
} from "@/helpers/gameTime.ts";
import type { FormValues, InitialValues, ChoiceOption } from "./types";
import {
    duprRatingSchema,
    participantGenderValues,
} from "./ui/RestrictionsStep/const";

export const maxCourtCount = 24;
export const maxParticipantCount = 96;

export const eventFormSchema = z
    .object({
        title: z
            .string()
            .trim()
            .min(1, "Укажите название события.")
            .max(120, "Название — до 120 символов."),
        isPrivate: z.boolean(),
        eventType: z.enum(["play-on", "training"]),
        trainingType: z.enum(["individual", "group"]).optional(),
        format: z.enum([
            "none",
            "americano",
            "mexicano",
            "round-robin",
            "single-elimination",
            "double-elimination",
            "pool-play",
            "swiss-system",
            "ladder",
            "king-of-the-court",
        ]),
        venueName: z
            .string()
            .trim()
            .min(1, "Укажите название площадки.")
            .max(120, "Название — до 120 символов."),
        venueAddress: z
            .string()
            .trim()
            .min(1, "Укажите адрес.")
            .max(300, "Адрес — до 300 символов."),
        startsAt: z.string().refine((value) => {
            const utc = moscowDateTimeToUtc(value);
            return Boolean(utc && Date.parse(utc) > Date.now());
        }, "Выберите дату и время в будущем."),
        durationMinutes: z
            .string()
            .refine(
                (value) =>
                    Number.isInteger(Number(value)) &&
                    Number(value) >= 30 &&
                    Number(value) <= 480,
                "Длительность должна быть от 30 до 480 минут.",
            ),
        courtCount: z
            .string()
            .refine(
                (value) =>
                    Number.isSafeInteger(Number(value)) &&
                    Number(value) >= 1 &&
                    Number(value) <= maxCourtCount,
                "Укажите целое число кортов от 1 до 24.",
            ),
        participantLimit: z
            .string()
            .refine(
                (value) =>
                    Number.isInteger(Number(value)) &&
                    Number(value) >= 2 &&
                    Number(value) <= maxParticipantCount,
                "Укажите от 2 до 96 мест.",
            ),
        availableSpotsMatchPlayers: z.boolean(),
        availableSpots: z
            .string()
            .refine(
                (value) =>
                    value.trim() !== "" &&
                    Number.isInteger(Number(value)) &&
                    Number(value) >= 0 &&
                    Number(value) <= maxParticipantCount,
                "Укажите от 0 до 96 свободных мест.",
            ),
        participantGender: z.enum(participantGenderValues),
        maleCount: z.string(),
        femaleCount: z.string(),
        duprRestricted: z.boolean(),
        duprMin: duprRatingSchema,
        duprMax: duprRatingSchema,
        waitlistEnabled: z.boolean(),
        waitlistAutoRotation: z.boolean(),
        playerModeration: z.boolean(),
        organizerParticipates: z.boolean(),
        desiredLevel: z
            .string()
            .trim()
            .max(80, "Подсказка уровня — до 80 символов."),
        invitedUsernames: z.string().refine(
            (value) =>
                value.trim() === "" ||
                value
                    .trim()
                    .split(/[\s,;]+/)
                    .every((username) =>
                        /^@?[A-Za-z0-9_]{1,32}$/.test(username),
                    ),
            "Укажите Telegram-логины через запятую, пробел или с новой строки.",
        ),
        description: z.string().max(2000, "Описание — до 2000 символов."),
    })
    .superRefine((values, context) => {
        if (values.participantGender === "mixed") {
            const counts = ["maleCount", "femaleCount"] as const;
            const validCounts = counts.every(
                (key) =>
                    /^\d{1,2}$/.test(values[key]) &&
                    Number(values[key]) >= 1 &&
                    Number(values[key]) <= Number(values.participantLimit),
            );
            for (const key of counts) {
                if (
                    !/^\d{1,2}$/.test(values[key]) ||
                    Number(values[key]) < 1 ||
                    Number(values[key]) > Number(values.participantLimit)
                ) {
                    context.addIssue({
                        code: "custom",
                        path: [key],
                        message: `Укажите целое число от 1 до ${values.participantLimit}.`,
                    });
                }
            }
            if (
                validCounts &&
                Number(values.maleCount) + Number(values.femaleCount) !==
                    Number(values.participantLimit)
            ) {
                context.addIssue({
                    code: "custom",
                    path: ["femaleCount"],
                    message: `Сумма мужчин и женщин должна быть равна количеству игроков: ${values.participantLimit}.`,
                });
            }
        }
        if (!values.duprRestricted) return;
        if (!values.duprMin && !values.duprMax) {
            context.addIssue({
                code: "custom",
                path: ["duprMin"],
                message: "Укажите хотя бы одну границу рейтинга.",
            });
        } else if (
            values.duprMin &&
            values.duprMax &&
            Number(values.duprMin) > Number(values.duprMax)
        ) {
            context.addIssue({
                code: "custom",
                path: ["duprMax"],
                message: "Верхняя граница должна быть не ниже нижней.",
            });
        }
    });

export const initialValues: InitialValues = {
    title: "",
    isPrivate: false,
    invitedUsernames: "",
    eventType: undefined,
    trainingType: undefined,
    format: undefined,
    venueName: "",
    venueAddress: "",
    startsAt: moscowDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    durationMinutes: "120",
    courtCount: "1",
    participantLimit: "8",
    availableSpots: "8",
    availableSpotsMatchPlayers: true,
    participantGender: "any",
    maleCount: "",
    femaleCount: "",
    duprRestricted: false,
    duprMin: "",
    duprMax: "",
    waitlistEnabled: false,
    waitlistAutoRotation: false,
    playerModeration: false,
    organizerParticipates: true,
    desiredLevel: "",
    description: "",
};

export const formatOptions: ChoiceOption<FormValues["format"]>[] = [
    {
        value: "none",
        label: "Без формата",
        description: "Свободная игра без турнирной схемы",
        icon: UsersRound,
        color: "blue",
    },
    {
        value: "americano",
        label: "Американо",
        description: getFormatDescription("American"),
        icon: Shuffle,
        color: "green",
    },
    {
        value: "mexicano",
        label: "Мексикано",
        description: "Пары по результатам раундов",
        icon: TrendingUp,
        color: "blue",
    },
    {
        value: "round-robin",
        label: "Round Robin",
        description: getFormatDescription("Round Robin"),
        icon: Repeat2,
        color: "purple",
    },
    {
        value: "single-elimination",
        label: "Single Elimination",
        description: getFormatDescription("Single Elimination"),
        icon: Trophy,
        color: "green",
    },
    {
        value: "double-elimination",
        label: "Double Elimination",
        description: getFormatDescription("Double Elimination"),
        icon: Trophy,
        color: "purple",
    },
    {
        value: "pool-play",
        label: "Pool Play",
        description: getFormatDescription("Pool Play"),
        icon: UsersRound,
        color: "blue",
    },
    {
        value: "swiss-system",
        label: "Swiss System",
        description: getFormatDescription("Swiss System"),
        icon: Shuffle,
        color: "green",
    },
    {
        value: "ladder",
        label: "Ladder",
        description: getFormatDescription("Ladder"),
        icon: ListOrdered,
        color: "blue",
    },
    {
        value: "king-of-the-court",
        label: "King of the Court",
        description: getFormatDescription("King of the Court"),
        icon: Crown,
        color: "purple",
    },
];

export const eventTypeOptions: ChoiceOption<FormValues["eventType"]>[] = [
    {
        value: "play-on",
        label: "Play on",
        description: "Играйте с другими участниками",
        icon: UsersRound,
        color: "green",
    },
    {
        value: "training",
        label: "Тренировка",
        description: "Развивайте технику и навыки",
        icon: Dumbbell,
        color: "blue",
    },
];

export const trainingTypeOptions = [
    { value: "individual", label: "Индивидуальная" },
    { value: "group", label: "Групповая" },
] as const;

export const firstStep = 0;
export const stepFieldsByEventType: Record<
    FormValues["eventType"],
    (keyof FormValues)[][]
> = {
    "play-on": [
        ["title", "isPrivate"],
        ["eventType"],
        ["format"],
        ["courtCount", "participantLimit", "availableSpots"],
        [
            "participantGender",
            "maleCount",
            "femaleCount",
            "duprRestricted",
            "duprMin",
            "duprMax",
        ],
        ["venueName", "venueAddress"],
        ["startsAt", "durationMinutes"],
        ["desiredLevel", "description"],
    ],
    training: [
        ["title", "isPrivate"],
        ["eventType"],
        ["trainingType"],
        ["courtCount", "participantLimit", "availableSpots"],
        [
            "participantGender",
            "maleCount",
            "femaleCount",
            "duprRestricted",
            "duprMin",
            "duprMax",
        ],
        ["venueName", "venueAddress"],
        ["startsAt", "durationMinutes"],
        ["desiredLevel", "description"],
    ],
};
export const stepTitlesByEventType: Record<FormValues["eventType"], string[]> =
    {
        "play-on": [
            "Название и доступ",
            "Тип события",
            "Формат игры",
            "Корты и игроки",
            "Ограничения",
            "Площадка",
            "Дата и время",
            "Описание",
        ],
        training: ["Название и доступ", "Тип события", "Тип тренировки"],
    };
