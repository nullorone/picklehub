import { playersPerCourt } from "./const";

export function getDefaultCourtCount(participantLimit: number): number {
    return Math.max(1, Math.ceil(participantLimit / playersPerCourt));
}
