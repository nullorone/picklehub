import type { EventFormStepProps } from "../../types";

export type RestrictionsStepProps = EventFormStepProps<
    | "participantGender"
    | "participantLimit"
    | "maleCount"
    | "femaleCount"
    | "duprRestricted"
    | "duprMin"
    | "duprMax"
> & {
    formId: string;
    onDuprBlur: (field: "duprMin" | "duprMax", value: string) => void;
};
