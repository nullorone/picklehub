export interface GameEventSchedule {
    /** Дата и время начала в UTC в формате RFC 3339. */
    startAt: string;
    /** Дата и время окончания в UTC в формате RFC 3339, позже startAt. */
    endAt: string;
    timeSlots: string[];
    registrationDeadline: string;
}

export interface GameEventOrganizer {
    id?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    telegramUsername: string;
    phone?: string;
}

export interface GameEvent {
    id: number | string;
    type: "match" | "tournament" | "trainee";
    organizer: GameEventOrganizer;
    delegateIds?: string[];
    name: string;
    schedule: GameEventSchedule;
    location: {
        name: string;
        address?: string;
        link: string;
    };
    participants: number;
    maxParticipants: number;
    entryFee: number;
    prize: string;
    status: "upcoming" | "ongoing" | "completed";
    rating?: string;
    format:
        | "American"
        | "Round Robin"
        | "Single Elimination"
        | "Double Elimination"
        | "Pool Play"
        | "Swiss System"
        | "Ladder"
        | "King of the Court"
        | "Без формата";
}
