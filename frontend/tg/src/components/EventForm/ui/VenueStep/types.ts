import type { KnownVenue } from "@/api/venues";
import type { EventFormStepProps } from "../../types";

export type VenueMode = "search" | "manual" | "selected";

export type VenueStepProps = EventFormStepProps<
    "venueName" | "venueAddress"
> & {
    venues: KnownVenue[];
    loading: boolean;
    loadError: boolean;
    onRetry: () => void;
};
