import type { ComponentType } from "react";
import { FoundationPage } from "@/pages/FoundationPage.tsx";

interface Route {
    path: string;
    Component: ComponentType;
}

export const routes: Route[] = [{ path: "/", Component: FoundationPage }];
