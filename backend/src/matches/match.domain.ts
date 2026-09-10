import type { GameScoreDto } from './match.dto';
import { matchError } from './match.errors';

export interface RecommendationInput {
    distanceMeters: number | null;
    radiusMeters: number | null;
    startsAt: Date;
    startsFrom: Date | null;
    startsTo: Date | null;
    format: 'SINGLES' | 'DOUBLES';
    preferredFormat: 'SINGLES' | 'DOUBLES' | null;
    skillMin: number;
    skillMax: number;
    playerSkill: number;
}

export function chooseTeam(
    choice: 'TEAM_A' | 'TEAM_B' | 'ANY',
    occupancy: Readonly<Record<'TEAM_A' | 'TEAM_B', number>>,
    capacity: number
): 'TEAM_A' | 'TEAM_B' | null {
    if (choice !== 'ANY') return occupancy[choice] < capacity ? choice : null;
    const order = occupancy.TEAM_A < occupancy.TEAM_B ? ['TEAM_A', 'TEAM_B'] : ['TEAM_B', 'TEAM_A'];
    return (order.find((team) => occupancy[team as 'TEAM_A' | 'TEAM_B'] < capacity) ?? null) as
        | 'TEAM_A'
        | 'TEAM_B'
        | null;
}

export function recommendation(input: RecommendationInput): { score: number; reasons: string[] } {
    const distance =
        input.distanceMeters === null || input.radiusMeters === null
            ? 0.5
            : Math.max(0, 1 - input.distanceMeters / input.radiusMeters);
    const time = timeComponent(input.startsAt, input.startsFrom, input.startsTo);
    const format = input.preferredFormat === null ? 0.5 : input.format === input.preferredFormat ? 1 : 0.5;
    const halfRange = Math.max((input.skillMax - input.skillMin) / 2, 0.5);
    const centre = (input.skillMin + input.skillMax) / 2;
    const level = Math.max(0.5, 1 - (0.5 * Math.abs(input.playerSkill - centre)) / halfRange);
    const weighted = [
        { reason: input.distanceMeters === null ? 'DISTANCE_UNKNOWN' : 'NEARBY', value: 35 * distance },
        {
            reason: input.startsFrom === null && input.startsTo === null ? 'TIME_FLEXIBLE' : 'TIME_MATCH',
            value: 30 * time,
        },
        { reason: 'PREFERRED_FORMAT', value: 20 * format },
        { reason: 'LEVEL_FIT', value: 15 * level },
    ];
    weighted.sort((left, right) => right.value - left.value || left.reason.localeCompare(right.reason));
    return {
        score: Math.round(weighted.reduce((sum, item) => sum + item.value, 0)),
        reasons: weighted.slice(0, 2).map((item) => item.reason),
    };
}

function timeComponent(startsAt: Date, startsFrom: Date | null, startsTo: Date | null): number {
    if (startsFrom === null && startsTo === null) return 0.5;
    const lower = startsFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
    const upper = startsTo?.getTime() ?? Number.POSITIVE_INFINITY;
    const value = startsAt.getTime();
    if (value >= lower && value <= upper) return 1;
    const distance = value < lower ? lower - value : value - upper;
    return Math.max(0, 1 - distance / 86_400_000);
}

export function validateResult(
    mode: 'SCORED' | 'PLAYED_WITHOUT_SCORE',
    seriesFormat: 'BEST_OF_1' | 'BEST_OF_3' | 'BEST_OF_5' | undefined,
    winningTeam: 'TEAM_A' | 'TEAM_B' | undefined,
    games: GameScoreDto[] | undefined
): void {
    if (mode === 'PLAYED_WITHOUT_SCORE') {
        if (seriesFormat !== undefined || winningTeam !== undefined || (games?.length ?? 0) !== 0)
            throw matchError('VALIDATION_FAILED', 400);
        return;
    }
    if (seriesFormat === undefined || winningTeam === undefined || games === undefined) {
        throw matchError('VALIDATION_FAILED', 400);
    }
    const maximum = Number(seriesFormat.slice(-1));
    const needed = Math.floor(maximum / 2) + 1;
    let teamAWins = 0;
    let teamBWins = 0;
    for (const [index, game] of games.entries()) {
        if (
            game.gameNumber !== index + 1 ||
            Math.max(game.teamAPoints, game.teamBPoints) < 11 ||
            Math.abs(game.teamAPoints - game.teamBPoints) < 2 ||
            teamAWins >= needed ||
            teamBWins >= needed
        )
            throw matchError('VALIDATION_FAILED', 400);
        if (game.teamAPoints > game.teamBPoints) teamAWins += 1;
        else teamBWins += 1;
    }
    if (
        games.length > maximum ||
        Math.max(teamAWins, teamBWins) !== needed ||
        (winningTeam === 'TEAM_A' ? teamAWins : teamBWins) !== needed
    )
        throw matchError('VALIDATION_FAILED', 400);
}

export function normalizeText(value: string | null | undefined): string | null | undefined {
    if (value === null || value === undefined) return value;
    const normalized = Array.from(value.normalize('NFKC'))
        .filter((character) => (character.codePointAt(0) ?? 0) > 31 && character.codePointAt(0) !== 127)
        .join('')
        .replace(/\s+/gu, ' ')
        .trim();
    return normalized === '' ? null : normalized;
}
