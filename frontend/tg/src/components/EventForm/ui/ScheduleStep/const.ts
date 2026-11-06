export const durationOptions = [
    { value: "60", label: "1 ч" },
    { value: "90", label: "1,5 ч" },
    { value: "120", label: "2 ч" },
    { value: "180", label: "3 ч" },
] as const;

export const defaultSlotDuration = 60;

export const slotTimeFields = [
    { key: "start", label: "Начало" },
    { key: "end", label: "Окончание" },
] as const;
