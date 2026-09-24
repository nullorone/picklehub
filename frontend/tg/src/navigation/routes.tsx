import type { ComponentType } from "react";
import { FoundationPage } from "@/pages/FoundationPage.tsx";
import { GameListPage } from "@/pages/GameListPage.tsx";
import { GameDetailPage } from "@/pages/GameDetailPage.tsx";
import { GameCreatePage } from "@/pages/GameCreatePage.tsx";

interface Route {
    path: string;
    Component: ComponentType;
}

export const routes: Route[] = [
    { path: "/", Component: GameListPage },
    { path: "/matches/:matchId", Component: GameDetailPage },
    { path: "/games/new", Component: GameCreatePage },
    { path: "/foundation", Component: FoundationPage },
];
