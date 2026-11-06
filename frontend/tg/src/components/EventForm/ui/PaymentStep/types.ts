import type { EventFormStepProps } from "../../types";

export type PaymentStepProps = EventFormStepProps<
    | "totalCost"
    | "costPerPerson"
    | "costBreakdownEnabled"
    | "organizerFee"
    | "courtHourlyRate"
    | "otherExpenses"
    | "description"
    | "participantLimit"
    | "courtCount"
    | "durationMinutes"
>;
