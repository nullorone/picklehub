import { playersPerCourt } from "./const";

export function getDefaultCourtCount(participantLimit: string): string {
    return String(
        Math.max(1, Math.ceil(Number(participantLimit) / playersPerCourt)),
    );
}
