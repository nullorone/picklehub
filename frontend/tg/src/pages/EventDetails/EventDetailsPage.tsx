import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { EventDetails } from "../../components/EventDetails";
import { tournaments } from "../EventList/mock";
import type { GameEvent } from "../EventList/types";
import { useAppSelector } from "../../store/hooks";

export function EventDetailsPage() {
    const currentUserId = useAppSelector((state) => state.session.user?.id);
    const { eventId } = useParams();
    const location = useLocation();
    const state = location.state as { event?: GameEvent } | null;
    const event =
        state?.event && String(state.event.id) === eventId
            ? state.event
            : tournaments.find((item) => String(item.id) === eventId);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
    }, [eventId]);

    return (
        <div className="mx-auto w-full max-w-lg pb-32">
            <Link
                to="/"
                className="inline-flex min-h-11 items-center text-sm text-ds-text underline underline-offset-4 mx-4"
            >
                ← Все события
            </Link>
            {event ? (
                <>
                    <EventDetails
                        event={event}
                        currentUserId={currentUserId}
                        participants={[]}
                        waitlist={[]}
                        stickyTop={0}
                    />
                    {/*{event.status === "upcoming" && (*/}
                    {/*    <p className="px-4 text-sm text-ds-text-secondary">*/}
                    {/*        Запись на это событие пока недоступна.*/}
                    {/*    </p>*/}
                    {/*)}*/}
                </>
            ) : (
                <p role="status" className="py-8 text-ds-text">
                    Событие не найдено.
                </p>
            )}
        </div>
    );
}
