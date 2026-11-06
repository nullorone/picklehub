import type { GameDetail } from "@/api/games.ts";
import type { GameEvent } from "../EventList/types";

export function toGameEvent(game: GameDetail): GameEvent {
    const organizer = game.participants.find(
        (participant) => participant.userId === game.organizerId,
    );
    const endsAt = new Date(
        Date.parse(game.startsAt) + game.durationMinutes * 60_000,
    ).toISOString();
    return {
        id: game.id,
        type: "match",
        name: game.venueName,
        organizer: {
            id: game.organizerId,
            firstName: organizer?.displayName ?? "Организатор",
            telegramUsername: "",
        },
        schedule: {
            startAt: game.startsAt,
            endAt: endsAt,
            timeSlots: [],
            registrationDeadline: game.startsAt,
        },
        location: {
            name: game.venueName,
            address: game.venueAddress,
            link: "",
        },
        participants: game.participantCount,
        maxParticipants: game.participantLimit,
        entryFee: 0,
        prize: "",
        status:
            game.status === "CANCELLED" || Date.parse(endsAt) <= Date.now()
                ? "completed"
                : Date.parse(game.startsAt) <= Date.now()
                  ? "ongoing"
                  : "upcoming",
        rating: game.desiredLevel,
        format: "Без формата",
    };
}
