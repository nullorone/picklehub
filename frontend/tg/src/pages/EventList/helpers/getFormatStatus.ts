import { GameEvent } from "../types.ts";

export function getFormatStatus(status: GameEvent["status"]) {
    switch (status) {
        case "upcoming":
            return "Планируется";
        case "ongoing":
            return "Идет";
        default:
            return "Завершен";
    }
}
