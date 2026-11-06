import { z } from "zod";

export const paymentAmountSchema = z
    .string()
    .refine(
        (value) =>
            value === "" ||
            (/^\d+(?:[.,]\d{1,2})?$/.test(value) &&
                Number.isFinite(Number(value.replace(",", ".")))),
        "Укажите неотрицательную сумму, до двух знаков после запятой.",
    );

export const maxCostPerPerson = 99999;
export const costPerPersonSchema = z
    .string()
    .refine(
        (value) =>
            value === "" ||
            (/^\d{1,5}$/.test(value) && Number(value) <= maxCostPerPerson),
        "Укажите целую сумму от 0 до 99999.",
    );

export const costFields = [
    { key: "courtHourlyRate", label: "Корт/час" },
    { key: "organizerFee", label: "Комиссия организатору" },
    { key: "otherExpenses", label: "Прочие расходы" },
] as const;
