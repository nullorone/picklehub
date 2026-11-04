import { retrieveRawInitData } from "@telegram-apps/sdk-react";
import { createApiClient } from "@picklehub/api";
import { useAppSelector } from "@/store/hooks.ts";
import type { SessionUser } from "@/store/sessionSlice.ts";
import {
    apiBaseUrl,
    mockUser,
    mockUserIds,
    mocksEnabled,
    setAccessToken,
} from "@/api/client.ts";

export type { SessionUser } from "@/store/sessionSlice.ts";
export const useSessionUser = () =>
    useAppSelector((state) => state.session.user);

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
