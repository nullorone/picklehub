import { useEffect, useMemo } from "react";
import { Navigate, Route, Routes, HashRouter } from "react-router-dom";
import {
    retrieveLaunchParams,
    useSignal,
    isMiniAppDark,
} from "@telegram-apps/sdk-react";
import { AppRoot } from "@telegram-apps/telegram-ui";
import { tokens } from "@picklehub/tokens";
import { createApiClient } from "@picklehub/api";

import { routes } from "@/navigation/routes.tsx";

export const apiClient = createApiClient(import.meta.env.VITE_API_URL ?? "");

export function App() {
    const lp = useMemo(() => retrieveLaunchParams(), []);
    const isDark = useSignal(isMiniAppDark);

    useEffect(() => {
        const root = document.documentElement;
        Object.entries(tokens.color).forEach(([group, scale]) => {
            Object.entries(scale).forEach(([step, value]) => {
                root.style.setProperty(`--token-color-${group}-${step}`, value);
            });
        });
        Object.entries(tokens.theme).forEach(([mode, roles]) => {
            Object.entries(roles).forEach(([role, value]) => {
                root.style.setProperty(`--token-theme-${mode}-${role}`, value);
            });
        });
        Object.entries(tokens.space).forEach(([step, value]) => {
            root.style.setProperty(`--token-space-${step}`, value);
        });
        Object.entries(tokens.fontSize).forEach(([step, value]) => {
            root.style.setProperty(`--token-font-size-${step}`, value);
        });
        Object.entries(tokens.radius).forEach(([step, value]) => {
            root.style.setProperty(`--token-radius-${step}`, value);
        });
    }, []);

    useEffect(() => {
        document.documentElement.dataset.theme = isDark ? "dark" : "light";
    }, [isDark]);

    return (
        <AppRoot
            appearance={isDark ? "dark" : "light"}
            platform={
                ["macos", "ios"].includes(lp.tgWebAppPlatform) ? "ios" : "base"
            }
        >
            <div className="min-h-dvh bg-background text-text">
                <HashRouter>
                    <Routes>
                        {routes.map((route) => (
                            <Route key={route.path} {...route} />
                        ))}
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </HashRouter>
            </div>
        </AppRoot>
    );
}
