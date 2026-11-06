import { z } from "zod";

export const participantGenderValues = [
    "any",
    "male",
    "female",
    "mixed",
] as const;

export const participantGenderOptions = [
    { value: "any", label: "Любой" },
    { value: "male", label: "Мужчины" },
    { value: "female", label: "Женщины" },
    { value: "mixed", label: "Микст" },
] as const;

export const mixedParticipantFields = [
    { key: "maleCount", label: "Мужчин" },
    { key: "femaleCount", label: "Женщин" },
] as const;

export const minDuprRating = 2;
export const maxDuprRating = 8;
export const duprRatingStep = 0.001;
export const duprRatingPattern = /^\d+(?:\.\d{1,3})?$/;

export const duprRatingSchema = z
    .string()
    .refine(
        (value) => value === "" || duprRatingPattern.test(value),
        "Введите рейтинг с точностью до трёх знаков после точки, например 2.560 или 4.500.",
    )
    .refine(
        (value) =>
            value === "" ||
            !duprRatingPattern.test(value) ||
            (Number.isFinite(Number(value)) &&
                Number(value) >= minDuprRating &&
                Number(value) <= maxDuprRating),
        "Укажите рейтинг от 2.000 до 8.000.",
    );
