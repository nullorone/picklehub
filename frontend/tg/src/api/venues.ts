import { useQuery } from "@tanstack/react-query";
import type { components } from "@picklehub/api";
import { apiClient } from "./client";
import { ApiError } from "./games";

export type KnownVenue = components["schemas"]["KnownVenue"];

export function useVenues() {
    return useQuery({
        queryKey: ["venues"],
        queryFn: async ({ signal }) => {
            const { data, error, response } = await apiClient.GET("/venues", {
                signal,
            });
            if (!data)
                throw new ApiError(
                    response.status,
                    error?.code ?? "UNKNOWN",
                    "Не удалось загрузить площадки",
                );
            return data.items;
        },
        staleTime: 15 * 60 * 1000,
        retry: 1,
    });
}
