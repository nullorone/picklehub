import { useQuery } from "@tanstack/react-query";
import { tournaments } from "../mock.ts";
import type { GameEvent } from "../types.ts";

// Local data for the tournament design preview; separate from the /games API cache.
export function useTournamentList() {
    return useQuery({
        queryKey: ["tournaments", "mock-list"],
        queryFn: (): Promise<{ items: GameEvent[] }> =>
            Promise.resolve({ items: structuredClone(tournaments) }),
        networkMode: "always",
    });
}
