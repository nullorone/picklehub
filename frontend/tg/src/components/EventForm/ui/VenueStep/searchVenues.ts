import type { KnownVenue } from "@/api/venues";
import { minVenueSearchLength } from "./const";

export function searchVenues(venues: KnownVenue[], query: string) {
    const normalize = (value: string) =>
        value
            .toLocaleLowerCase("ru")
            .replace(/ё/g, "е")
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim();
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (words.join("").length < minVenueSearchLength) return [];
    return venues.filter((venue) => {
        const text = normalize(`${venue.name} ${venue.address}`);
        return words.every((word) => text.includes(word));
    });
}
