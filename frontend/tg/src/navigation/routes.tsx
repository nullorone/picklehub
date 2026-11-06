import type { ComponentType } from "react";
import { EventListPage } from "../pages/EventList";
import { EventCreate } from "../pages/EventCreate";
import { EventEditPage } from "../pages/EventEdit";
import { ProfilePage } from "../pages/Profile";
import { Main } from "../pages/Main";
import {
    EventDetailsPage,
    EventDetailsRedirect,
} from "../pages/EventDetails/EventDetailsPage";

interface Route {
    path: string;
    Component: ComponentType;
}

export const routes: Route[] = [
    { path: "/", Component: Main },
    { path: "/event/list", Component: EventListPage },
    { path: "/event/:eventId", Component: EventDetailsRedirect },
    { path: "/event/:eventId/details", Component: EventDetailsPage },
    { path: "/event/new", Component: EventCreate },
    { path: "/event/:eventId/edit", Component: EventEditPage },
    { path: "/profile", Component: ProfilePage },
];
