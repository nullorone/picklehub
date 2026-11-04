import { GlassBadge } from "@picklehub/ui-web";
import type { GameEvent } from "../../pages/EventList/types";

const labels: Record<GameEvent["type"], string> = {
    match: "Play On",
    tournament: "Турнир",
    trainee: "Тренировка",
};

export function EventTypeBadge({ type }: { type: GameEvent["type"] }) {
    return (
        <GlassBadge
            className={
                type === "match"
                    ? "bg-blue-500/20 border-blue-400/30 text-blue-100"
                    : type === "tournament"
                      ? "bg-purple-500/20 border-purple-400/30 text-purple-100"
                      : "bg-yellow-500/20 border-yellow-400/30 text-yellow-100"
            }
            size={"s"}
        >
            {labels[type]}
        </GlassBadge>
    );
}
