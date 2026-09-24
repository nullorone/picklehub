import { createApiClient } from "@picklehub/api";

const mocksEnabled =
    import.meta.env.DEV && import.meta.env.VITE_API_MOCKS !== "false";
const mockUser =
    new URLSearchParams(window.location.search).get("mockUser") ?? "player-1";

export const apiClient = createApiClient(
    import.meta.env.VITE_API_URL ?? "",
    mocksEnabled ? `dev:${mockUser}` : undefined,
);
