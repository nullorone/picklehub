import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Navigate,
    Route,
    Routes,
    HashRouter,
    useLocation,
    useMatch,
} from "react-router-dom";
import {
    retrieveLaunchParams,
    useSignal,
    isMiniAppDark,
    initDataUser,
} from "@telegram-apps/sdk-react";
import { AppRoot } from "@telegram-apps/telegram-ui";
import { Button } from "@/components/Button/Button.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routes } from "@/navigation/routes.tsx";
import { createTelegramSession, useSessionUser } from "@/api/session.ts";
import { useAppDispatch } from "@/store/hooks.ts";
import { sessionStarted, sessionCleared } from "@/store/sessionSlice.ts";
import { setAccessToken } from "@/api/client.ts";
import { gameIdFromStartParameter } from "@/navigation/startParameter.ts";
import { Footer } from "@/components/Footer.tsx";
import { Provider } from "react-redux";
import { store } from "../store/store.ts";
import { LoadingScreen } from "@picklehub/ui-web";

function StartParameterRoute({ startParameter }: { startParameter: unknown }) {
    const location = useLocation();
    const gameId = gameIdFromStartParameter(startParameter);
    return location.pathname === "/" && gameId ? (
        <Navigate to={`/event/${gameId}`} replace />
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
    return (
        <Provider store={store}>
            <HashRouter>
                <AppContent />
            </HashRouter>
        </Provider>
    );
}

function AppContent() {
    const isEventDetailsPage = Boolean(useMatch("/event/:eventId/details"));
    const lp = useMemo(() => retrieveLaunchParams(), []);
    const isDark = useSignal(isMiniAppDark);
    const user = useSessionUser();
    const dispatch = useAppDispatch();
    const [authError, setAuthError] = useState("");
    const loginPromise = useRef<Promise<void> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const isShowLoading = useRef(false);

    const login = useCallback(() => {
        if (loginPromise.current) return loginPromise.current;
        dispatch(sessionCleared());
        setAccessToken("");
        queryClient.clear();
        setAuthError("");
        const pending = createTelegramSession()
            .then((sessionUser) => {
                dispatch(
                    sessionStarted({
                        user: sessionUser,
                        avatarUrl: initDataUser()?.photo_url || null,
                    }),
                );
            })
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
    }, [dispatch]);

    useEffect(() => {
        void login();
        const expired = () => void login();
        window.addEventListener("picklehub:session-expired", expired);
        return () =>
            window.removeEventListener("picklehub:session-expired", expired);
    }, [login]);

    useEffect(() => {
        document.documentElement.dataset.theme = isDark ? "dark" : "light";
        document.documentElement.dataset.dsTheme = isDark ? "dark" : "light";
    }, [isDark]);

    useEffect(() => {
        if (isShowLoading.current) return;
        setIsLoading(true);

        const timerId = setTimeout(() => {
            isShowLoading.current = true;
            setIsLoading(false);
        }, 3000);

        return () => clearTimeout(timerId);
    }, [isShowLoading]);

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
                <div
                    className={`relative tg-shell min-h-dvh text-text${isEventDetailsPage ? "" : " px-3"}`}
                >
                    {isLoading && (
                        <LoadingScreen
                            text={"Загружаем события..."}
                            fullScreen
                            backgroundOpacity={0.96}
                            backgroundColor={"#101827"}
                        />
                    )}
                    {user ? (
                        <>
                            {/*{!isEventDetailsPage && <Header />}*/}
                            <StartParameterRoute
                                startParameter={lp.tgWebAppStartParam}
                            />
                            <main className={isEventDetailsPage ? "" : "pt-4"}>
                                <Routes>
                                    {routes.map((route) => (
                                        <Route key={route.path} {...route} />
                                    ))}
                                    <Route
                                        path="*"
                                        element={<Navigate to="/" />}
                                    />
                                </Routes>
                            </main>
                            <Footer />
                        </>
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
            </AppRoot>
        </QueryClientProvider>
    );
}
