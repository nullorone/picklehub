import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Navigate,
    Route,
    Routes,
    HashRouter,
    useLocation,
} from "react-router-dom";
import {
    retrieveLaunchParams,
    useSignal,
    isMiniAppDark,
} from "@telegram-apps/sdk-react";
import { AppRoot } from "@telegram-apps/telegram-ui";
import { Button } from "@/components/ui/Button/Button.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routes } from "@/navigation/routes.tsx";
import {
    createTelegramSession,
    SessionContext,
    type SessionUser,
} from "@/api/session.ts";
import { setAccessToken } from "@/api/client.ts";
import { gameIdFromStartParameter } from "@/navigation/startParameter.ts";

function StartParameterRoute({ startParameter }: { startParameter: unknown }) {
    const location = useLocation();
    const gameId = gameIdFromStartParameter(startParameter);
    return location.pathname === "/" && gameId ? (
        <Navigate to={`/matches/${gameId}`} replace />
    ) : null;
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 0,
            refetchOnWindowFocus: true,
            refetchOnMount: "always",
        },
        mutations: { retry: false, networkMode: "always" },
    },
});

export function App() {
    const lp = useMemo(() => retrieveLaunchParams(), []);
    const isDark = useSignal(isMiniAppDark);
    const [user, setUser] = useState<SessionUser | null>(null);
    const [authError, setAuthError] = useState("");
    const loginPromise = useRef<Promise<void> | null>(null);

    const login = useCallback(() => {
        if (loginPromise.current) return loginPromise.current;
        setUser(null);
        setAccessToken("");
        queryClient.clear();
        setAuthError("");
        const pending = createTelegramSession()
            .then(setUser)
            .catch((error: unknown) => {
                setAuthError(
                    error instanceof Error
                        ? error.message
                        : "Не удалось войти.",
                );
            })
            .finally(() => {
                loginPromise.current = null;
            });
        loginPromise.current = pending;
        return pending;
    }, []);

    useEffect(() => {
        void login();
        const expired = () => void login();
        window.addEventListener("picklehub:session-expired", expired);
        return () =>
            window.removeEventListener("picklehub:session-expired", expired);
    }, [login]);

    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === "visible") {
                void queryClient.invalidateQueries({ queryKey: ["games"] });
            }
        };
        document.addEventListener("visibilitychange", refresh);
        return () => document.removeEventListener("visibilitychange", refresh);
    }, []);

    useEffect(() => {
        document.documentElement.dataset.theme = isDark ? "dark" : "light";
        document.documentElement.dataset.dsTheme = isDark ? "dark" : "light";
    }, [isDark]);

    return (
        <QueryClientProvider client={queryClient}>
            <AppRoot
                appearance={isDark ? "dark" : "light"}
                platform={
                    ["macos", "ios"].includes(lp.tgWebAppPlatform)
                        ? "ios"
                        : "base"
                }
            >
                <SessionContext.Provider value={user}>
                    <div className="tg-shell min-h-dvh text-text">
                        {user ? (
                            <HashRouter>
                                <StartParameterRoute
                                    startParameter={lp.tgWebAppStartParam}
                                />
                                <Routes>
                                    {routes.map((route) => (
                                        <Route key={route.path} {...route} />
                                    ))}
                                    <Route
                                        path="*"
                                        element={<Navigate to="/" />}
                                    />
                                </Routes>
                            </HashRouter>
                        ) : (
                            <main
                                className="mx-auto grid max-w-lg gap-4 p-6"
                                role={authError ? "alert" : "status"}
                            >
                                <h1 className="text-xl font-semibold">
                                    {authError
                                        ? "Не удалось войти"
                                        : "Входим через Telegram…"}
                                </h1>
                                {authError && (
                                    <>
                                        <p>{authError}</p>
                                        <Button
                                            onClick={() => void login()}
                                            type="button"
                                        >
                                            Повторить вход
                                        </Button>
                                    </>
                                )}
                            </main>
                        )}
                    </div>
                </SessionContext.Provider>
            </AppRoot>
        </QueryClientProvider>
    );
}
