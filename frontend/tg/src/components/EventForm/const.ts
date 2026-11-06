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

import {
    paymentAmountSchema,
    costPerPersonSchema,
} from "./ui/PaymentStep/const";

import { getDefaultCourtCount } from "./ui/CourtsStep/getDefaultCourtCount";

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
        venueName: z.string().trim().max(120, "Название — до 120 символов."),
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
        manualEndTimeEnabled: z.boolean(),
        timeSlotsEnabled: z.boolean(),
        timeSlots: z.array(z.object({ start: z.number(), end: z.number() })),
        courtCountMatchPlayers: z.boolean(),
        courtCount: z
            .number()
            .refine(
                (value) =>
                    Number.isSafeInteger(Number(value)) &&
                    Number(value) >= 1 &&
                    Number(value) <= maxCourtCount,
                "Укажите целое число кортов от 1 до 24.",
            ),
        participantLimit: z
            .number()
            .refine(
                (value) =>
                    Number.isInteger(Number(value)) &&
                    Number(value) >= 2 &&
                    Number(value) <= maxParticipantCount,
                "Укажите от 2 до 96 мест.",
            ),
        availableSpotsMatchPlayers: z.boolean(),
        availableSpots: z
            .number()
            .refine(
                (value) =>
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
        totalCost: paymentAmountSchema,
        costPerPerson: costPerPersonSchema,
        costBreakdownEnabled: z.boolean(),
        organizerFee: paymentAmountSchema,
        courtHourlyRate: paymentAmountSchema,
        otherExpenses: paymentAmountSchema,
        description: z.string().max(2000, "Комментарий — до 2000 символов."),
    })
    .superRefine((values, context) => {
        if (values.timeSlotsEnabled) {
            const slots = [...values.timeSlots].sort(
                (a, b) => a.start - b.start,
            );
            if (
                slots.length === 0 ||
                slots.some(
                    (slot, index) =>
                        !Number.isInteger(slot.start) ||
                        !Number.isInteger(slot.end) ||
                        slot.start < 0 ||
                        slot.end > Number(values.durationMinutes) ||
                        slot.end <= slot.start ||
                        (index > 0 && slot.start < slots[index - 1].end),
                )
            ) {
                context.addIssue({
                    code: "custom",
                    path: ["timeSlots"],
                    message:
                        "Укажите слоты внутри времени события, без пересечений. Окончание должно быть позже начала.",
                });
            }
        }
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

const DEFAULT_PARTICIPANT = 4;

export const initialValues: InitialValues = {
    title: "",
    isPrivate: false,
    invitedUsernames: "",
    eventType: "play-on",
    trainingType: undefined,
    format: undefined,
    venueName: "",
    venueAddress: "",
    startsAt: moscowDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    durationMinutes: "120",
    manualEndTimeEnabled: false,
    timeSlotsEnabled: false,
    timeSlots: [],
    courtCount: getDefaultCourtCount(DEFAULT_PARTICIPANT),
    courtCountMatchPlayers: true,
    participantLimit: DEFAULT_PARTICIPANT,
    availableSpots: DEFAULT_PARTICIPANT - 1,
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
    totalCost: "",
    costPerPerson: "",
    costBreakdownEnabled: false,
    organizerFee: "",
    courtHourlyRate: "",
    otherExpenses: "",
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
// В MVP тип события всегда Play On, поэтому шаг выбора временно пропускается.
export const hiddenEventTypeStep = 1;
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
        ["startsAt", "durationMinutes", "timeSlotsEnabled", "timeSlots"],
        [
            "totalCost",
            "costPerPerson",
            "costBreakdownEnabled",
            "organizerFee",
            "courtHourlyRate",
            "otherExpenses",
            "description",
        ],
        [],
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
        ["startsAt", "durationMinutes", "timeSlotsEnabled", "timeSlots"],
        [
            "totalCost",
            "costPerPerson",
            "costBreakdownEnabled",
            "organizerFee",
            "courtHourlyRate",
            "otherExpenses",
            "description",
        ],
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
            "Оплата",
            "Предпросмотр",
        ],
        training: ["Название и доступ", "Тип события", "Тип тренировки"],
    };
