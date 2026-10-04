import type { ComponentType } from "react";
import { FoundationPage } from "@/pages/FoundationPage.tsx";
import { GameListPage } from "@/pages/GameListPage.tsx";
import { GameDetailPage } from "@/pages/GameDetailPage.tsx";
import { GameCreatePage } from "@/pages/GameCreatePage.tsx";
import { ProfilePage } from "@/pages/ProfilePage.tsx";

interface Route {
    path: string;
    Component: ComponentType;
}

export const routes: Route[] = [
    { path: "/", Component: GameListPage },
    { path: "/matches/:matchId", Component: GameDetailPage },
    { path: "/games/new", Component: GameCreatePage },
    { path: "/matches/:matchId/edit", Component: GameCreatePage },
    { path: "/foundation", Component: FoundationPage },
    { path: "/profile", Component: ProfilePage },
];
