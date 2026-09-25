import { createApiClient } from "@picklehub/api";

const mocksEnabled =
    import.meta.env.DEV && import.meta.env.VITE_API_MOCKS !== "false";
export const mockUser =
    new URLSearchParams(window.location.search).get("mockUser") ?? "player-1";

export const mockUserIds: Record<string, string> = {
    "player-1": "00000000-0000-4000-8000-000000000001",
    "player-2": "00000000-0000-4000-8000-000000000002",
    "player-3": "00000000-0000-4000-8000-000000000003",
    "player-4": "00000000-0000-4000-8000-000000000099",
};

export const apiClient = createApiClient(
    import.meta.env.VITE_API_URL ?? "",
    mocksEnabled ? `dev:${mockUser}` : undefined,
);
