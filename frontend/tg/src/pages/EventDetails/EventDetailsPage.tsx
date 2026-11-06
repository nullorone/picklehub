import { useEffect } from "react";
import { useGame } from "@/api/useGames.ts";
import { ApiError } from "@/api/games.ts";
import { GlassButton } from "@picklehub/ui-web";
import { toGameEvent } from "./toGameEvent";
import { gameIdPattern } from "./const";
import type { ApiEventDetailsProps } from "./types";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { EventDetails } from "../../components/EventDetails";
import { tournaments } from "../EventList/mock";
import type { GameEvent } from "../EventList/types";
import { useAppSelector } from "../../store/hooks";

export function EventDetailsRedirect() {
    const { eventId } = useParams();
    return <Navigate to={`/event/${eventId}/details`} replace />;
}

function ApiEventDetails({ eventId }: ApiEventDetailsProps) {
    const gameQuery = useGame(eventId);
    const currentUserId = useAppSelector((state) => state.session.user?.id);
    const game = gameQuery.data;

    if (game) {
        return (
            <EventDetails
                event={toGameEvent(game)}
                currentUserId={currentUserId}
                description={game.description}
                participants={game.participants.map((participant) => ({
                    id: participant.userId,
                    name: participant.displayName,
                }))}
                waitlist={[]}
                registrationState={
                    game.participants.some(
                        (participant) => participant.userId === currentUserId,
                    )
                        ? "joined"
                        : "none"
                }
            />
        );
    }
    if (gameQuery.isPending) return <p role="status">Загружаем событие…</p>;
    if (gameQuery.error instanceof ApiError && gameQuery.error.status === 404) {
        return <p role="status">Событие не найдено.</p>;
    }
    return (
        <div role="alert" className="grid gap-3 px-4 py-8">
            <p>Не удалось загрузить событие.</p>
            <GlassButton onClick={() => void gameQuery.refetch()}>
                Повторить
            </GlassButton>
        </div>
    );
}

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
            ) : eventId && gameIdPattern.test(eventId) ? (
                <ApiEventDetails eventId={eventId} />
            ) : (
                <p role="status" className="py-8 text-ds-text">
                    Событие не найдено.
                </p>
            )}
        </div>
    );
}
