import { createContext, useContext } from "react";
import { retrieveRawInitData } from "@telegram-apps/sdk-react";
import { createApiClient, type components } from "@picklehub/api";
import {
    apiBaseUrl,
    mockUser,
    mockUserIds,
    mocksEnabled,
    setAccessToken,
} from "@/api/client.ts";

export type SessionUser = components["schemas"]["SessionUser"];
export const SessionContext = createContext<SessionUser | null>(null);
export const useSessionUser = () => useContext(SessionContext);

export async function createTelegramSession(): Promise<SessionUser> {
    if (mocksEnabled) {
        setAccessToken(`dev:${mockUser}`);
        return { id: mockUserIds[mockUser], displayName: mockUser };
    }
    if (!apiBaseUrl) throw new Error("Не задан адрес API.");
    const initData = retrieveRawInitData();
    if (!initData) throw new Error("Откройте приложение через Telegram.");
    const client = createApiClient(apiBaseUrl);
    const { data, error } = await client.POST("/sessions/telegram", {
        body: { initData },
    });
    if (!data)
        throw new Error(error?.message ?? "Не удалось войти через Telegram.");
    setAccessToken(data.accessToken);
    return data.user;
}
