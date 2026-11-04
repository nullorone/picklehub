import type { EventFormStepProps } from "../../types";

export type CourtsStepProps = EventFormStepProps<
    | "courtCount"
    | "courtCountMatchPlayers"
    | "participantLimit"
    | "availableSpots"
    | "availableSpotsMatchPlayers"
    | "waitlistEnabled"
    | "waitlistAutoRotation"
    | "playerModeration"
    | "organizerParticipates"
> & {
    formId: string;
};
