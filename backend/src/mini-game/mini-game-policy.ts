import type { SubmitGameResultDto } from './mini-game.dto';
import { MiniGameMode } from './mini-game.dto';

export type ResultInvalidReason =
    | 'CONFIGURATION_MISMATCH'
    | 'MODE_MISMATCH'
    | 'DURATION_INVALID'
    | 'COUNTERS_INVALID'
    | 'RATE_IMPOSSIBLE';

export function validateGameResult(
    input: SubmitGameResultDto,
    expected: { mode: MiniGameMode; configurationVersion: string }
): ResultInvalidReason | null {
    if (input.configurationVersion !== expected.configurationVersion) return 'CONFIGURATION_MISMATCH';
    if (input.mode !== expected.mode) return 'MODE_MISMATCH';
    const counters = input.counters;
    if (
        counters.successfulReturns > counters.attempts ||
        counters.targetHits > counters.successfulReturns ||
        counters.leftTargetHits + counters.centerTargetHits + counters.rightTargetHits !== counters.targetHits ||
        counters.streakBonuses > Math.floor(counters.successfulReturns / 5)
    ) {
        return 'COUNTERS_INVALID';
    }
    if (input.mode === MiniGameMode.STANDARD && input.activeDurationMilliseconds !== 90_000) return 'DURATION_INVALID';
    if (input.mode === MiniGameMode.CALM && counters.attempts !== 20) return 'DURATION_INVALID';
    // This is deliberately a coarse plausibility bound, not server-side physics or reaction-time profiling.
    if (input.mode === MiniGameMode.STANDARD && counters.attempts > 180) return 'RATE_IMPOSSIBLE';
    return null;
}

export function startOfUtcDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function startOfUtcWeek(value: Date): Date {
    const day = startOfUtcDay(value);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day;
}

export function plus(value: Date, milliseconds: number): Date {
    return new Date(value.getTime() + milliseconds);
}
