import type { FieldPathValue } from "react-hook-form";
import type { z } from "zod";
import type { LucideIcon } from "lucide-react";
import type { eventFormSchema } from "./const";

export type FormValues = z.infer<typeof eventFormSchema>;
export type InitialValues = Omit<FormValues, "eventType" | "format"> & {
    eventType?: FormValues["eventType"];
    format?: FormValues["format"];
};

export type ChoiceOption<T extends string> = {
    value: T;
    label: string;
    description: string;
    icon: LucideIcon;
    color: "green" | "blue" | "purple";
};

export type EventFormStepProps<K extends keyof FormValues> = {
    values: Pick<FormValues, K>;
    errors: Partial<Record<K, string | undefined>>;
    hidden: boolean;
    busy: boolean;
    update: <F extends K>(key: F, value: FieldPathValue<FormValues, F>) => void;
};
