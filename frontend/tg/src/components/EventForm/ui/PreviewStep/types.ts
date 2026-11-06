import type { FormValues } from "../../types";

export type PreviewStepProps = {
    values: FormValues;
    busy: boolean;
    onEdit: (step: number) => void;
};

export type PreviewSection = {
    title: string;
    step: number;
    rows: { label: string; value: string | number }[];
};
