import { projectionChecksum } from '../tournament-canonical';
import { tournamentInvariant } from '../tournament.errors';
import { latestResults } from '../tournament-score';
import type {
    StrategyEntrant,
    StrategyMatch,
    StrategyResult,
    StrategyRound,
    StrategySlot,
    StrategyStage,
    StrategyStanding,
    TournamentFormatStrategyInput,
    TournamentFormatStrategyOutput,
} from '../tournament.types';

export interface MutableStanding {
    entrantId: string;
    matchPoints: number;
    wins: number;
    gameDifferential: number;
    pointDifferential: number;
    pointsScored: number;
    tieBreakLot: bigint;
    opponents: string[];
}

export function orderedEntrants(input: TournamentFormatStrategyInput): StrategyEntrant[] {
    const entrants = [...input.entrants].sort((left, right) => left.seed - right.seed || compareLot(left, right));
    tournamentInvariant(
        new Set(entrants.map(({ id }) => id)).size === entrants.length,
        'INVALID_ENTRANTS',
        'Entrants must be unique'
    );
    tournamentInvariant(
        new Set(entrants.map(({ seed }) => seed)).size === entrants.length,
        'INVALID_ENTRANTS',
        'Seeds must be unique'
    );
    tournamentInvariant(
        new Set(entrants.map(({ tieBreakLot }) => tieBreakLot)).size === entrants.length,
        'INVALID_ENTRANTS',
        'Lots must be unique'
    );
    return entrants;
}

export function compareLot(left: StrategyEntrant, right: StrategyEntrant): number {
    return left.tieBreakLot < right.tieBreakLot
        ? -1
        : left.tieBreakLot > right.tieBreakLot
          ? 1
          : left.id.localeCompare(right.id);
}

export function circleRounds<T>(values: readonly T[]): (readonly [T, T | undefined])[][] {
    const ring: (T | undefined)[] = [...values];
    if (ring.length % 2 === 1) ring.push(undefined);
    const output: (readonly [T, T | undefined])[][] = [];
    for (let round = 0; round < ring.length - 1; round += 1) {
        const pairs: (readonly [T, T | undefined])[] = [];
        for (let index = 0; index < ring.length / 2; index += 1) {
            const left = ring[index];
            const right = ring[ring.length - 1 - index];
            if (left !== undefined) pairs.push([left, right]);
            else if (right !== undefined) pairs.push([right, undefined]);
        }
        output.push(pairs);
        ring.splice(1, 0, ring.pop());
    }
    return output;
}

export function slot(position: number, entrant?: StrategyEntrant): StrategySlot {
    return entrant === undefined
        ? { position: position as 1 | 2 }
        : { position: position as 1 | 2, entrantId: entrant.id };
}

export function sourceSlot(
    position: 1 | 2,
    sourceMatchKey: string,
    sourceOutcome: 'WINNER' | 'LOSER' = 'WINNER'
): StrategySlot {
    return { position, sourceMatchKey, sourceOutcome };
}

export function makeRound(
    stageKey: string,
    sequence: number,
    rawMatches: readonly Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[],
    courtCount: number
): StrategyRound {
    const key = `${stageKey}:round:${String(sequence)}`;
    return {
        key,
        stageKey,
        sequence,
        matches: rawMatches.map((match, index) => ({
            ...match,
            stageKey,
            roundKey: key,
            sequence: index + 1,
            courtRank: (index % courtCount) + 1,
            batch: Math.floor(index / courtCount) + 1,
        })),
    };
}

export function playedResultMap(results: readonly StrategyResult[]): ReadonlyMap<string, StrategyResult> {
    return latestResults(results);
}

export function basicStandings(
    entrants: readonly StrategyEntrant[],
    matches: readonly StrategyMatch[],
    results: ReadonlyMap<string, StrategyResult>,
    extra?: (entrantId: string, row: MutableStanding) => Readonly<Record<string, number | string>>
): StrategyStanding[] {
    const rows = new Map<string, MutableStanding>(
        entrants.map((entrant) => [
            entrant.id,
            {
                entrantId: entrant.id,
                matchPoints: 0,
                wins: 0,
                gameDifferential: 0,
                pointDifferential: 0,
                pointsScored: 0,
                tieBreakLot: entrant.tieBreakLot,
                opponents: [],
            },
        ])
    );
    for (const match of matches) applyResult(rows, match, results.get(match.key));
    const sorted = [...rows.values()].sort(compareStanding);
    return sorted.map((row, index) => ({
        entrantId: row.entrantId,
        rank: index + 1,
        matchPoints: row.matchPoints,
        wins: row.wins,
        gameDifferential: row.gameDifferential,
        pointDifferential: row.pointDifferential,
        pointsScored: row.pointsScored,
        tieBreakLot: row.tieBreakLot,
        detail: extra?.(row.entrantId, row) ?? {},
    }));
}

function applyResult(
    rows: Map<string, MutableStanding>,
    match: StrategyMatch,
    result: StrategyResult | undefined
): void {
    const ids = match.slots.flatMap((candidate) => (candidate.entrantId === undefined ? [] : [candidate.entrantId]));
    if (ids.length === 0) return;
    const effective =
        result ??
        (match.automaticOutcome === undefined
            ? undefined
            : {
                  matchKey: match.key,
                  revision: 0,
                  outcome: match.automaticOutcome,
                  winnerEntrantId: match.automaticWinnerEntrantId ?? null,
                  scores: [],
              });
    if (effective === undefined) return;
    if (ids.length === 1 && effective.outcome === 'BYE') {
        const entrantId = ids[0];
        tournamentInvariant(entrantId !== undefined, 'INVALID_RESULT', 'Bye entrant missing');
        const row = rows.get(entrantId);
        if (row !== undefined) {
            row.matchPoints += 3;
            row.wins += 1;
        }
        return;
    }
    const sideSize = ids.length === 4 ? 2 : 1;
    const sideOne = ids.slice(0, sideSize);
    const sideTwo = ids.slice(sideSize);
    for (const id of sideOne) rows.get(id)?.opponents.push(...sideTwo);
    for (const id of sideTwo) rows.get(id)?.opponents.push(...sideOne);
    if (effective.outcome === 'DOUBLE_WALKOVER' || effective.winnerEntrantId === null) return;
    const winningSide = sideOne.includes(effective.winnerEntrantId) ? sideOne : sideTwo;
    for (const id of winningSide) {
        const row = rows.get(id);
        if (row !== undefined) {
            row.matchPoints += 3;
            row.wins += 1;
        }
    }
    for (const score of effective.scores) {
        const oneGame = score.sideOne > score.sideTwo ? 1 : -1;
        const point = score.sideOne - score.sideTwo;
        for (const id of sideOne) {
            const row = rows.get(id);
            if (row !== undefined) {
                row.gameDifferential += oneGame;
                row.pointDifferential += point;
                row.pointsScored += score.sideOne;
            }
        }
        for (const id of sideTwo) {
            const row = rows.get(id);
            if (row !== undefined) {
                row.gameDifferential -= oneGame;
                row.pointDifferential -= point;
                row.pointsScored += score.sideTwo;
            }
        }
    }
}

function compareStanding(left: MutableStanding, right: MutableStanding): number {
    return (
        right.matchPoints - left.matchPoints ||
        right.wins - left.wins ||
        right.gameDifferential - left.gameDifferential ||
        right.pointDifferential - left.pointDifferential ||
        right.pointsScored - left.pointsScored ||
        (left.tieBreakLot < right.tieBreakLot
            ? -1
            : left.tieBreakLot > right.tieBreakLot
              ? 1
              : left.entrantId.localeCompare(right.entrantId))
    );
}

export function finalize(
    input: TournamentFormatStrategyInput,
    stages: readonly StrategyStage[],
    standings: readonly StrategyStanding[],
    championEntrantId: string | null,
    requiredTerminalMatchKeys?: readonly string[]
): TournamentFormatStrategyOutput {
    const matches = stages.flatMap(({ rounds }) => rounds.flatMap((round) => round.matches));
    tournamentInvariant(
        new Set(matches.map(({ key }) => key)).size === matches.length,
        'INVALID_PRESET',
        'Strategy match keys must be unique'
    );
    for (const round of stages.flatMap(({ rounds }) => rounds)) {
        const direct = round.matches.flatMap((match) => match.slots.flatMap((candidate) => candidate.entrantId ?? []));
        tournamentInvariant(
            new Set(direct).size === direct.length,
            'INVALID_PRESET',
            `Entrant duplicated in ${round.key}`
        );
    }
    validateResults(matches, input.results);
    const required =
        requiredTerminalMatchKeys ??
        matches.filter((match) => match.automaticOutcome === undefined).map(({ key }) => key);
    const body = {
        formatCode: input.preset.formatCode,
        strategyVersion: input.strategyVersion,
        stages,
        standings,
        requiredTerminalMatchKeys: required,
        championEntrantId,
    } as const;
    return { ...body, projectionChecksum: projectionChecksum(body) };
}

function validateResults(matches: readonly StrategyMatch[], results: readonly StrategyResult[]): void {
    const byKey = new Map(matches.map((match) => [match.key, match]));
    const latest = latestResults(results);
    for (const result of results) {
        tournamentInvariant(byKey.has(result.matchKey), 'INVALID_RESULT', `Unknown result match ${result.matchKey}`);
        tournamentInvariant(result.revision > 0, 'INVALID_RESULT', 'Result revision must be positive');
    }
    const resolving = new Set<string>();
    const participants = (key: string): string[] => {
        tournamentInvariant(!resolving.has(key), 'INVALID_PRESET', 'Tournament dependency graph contains a cycle');
        resolving.add(key);
        const match = byKey.get(key);
        tournamentInvariant(match !== undefined, 'INVALID_PRESET', `Unknown source match ${key}`);
        const ids = match.slots.flatMap((candidate) => {
            if (candidate.entrantId !== undefined) return [candidate.entrantId];
            if (candidate.sourceMatchKey === undefined) return [];
            const sourceParticipants = participants(candidate.sourceMatchKey);
            const source = byKey.get(candidate.sourceMatchKey);
            const sourceWinner =
                latest.get(candidate.sourceMatchKey)?.winnerEntrantId ?? source?.automaticWinnerEntrantId;
            if (candidate.sourceOutcome === 'LOSER')
                return sourceParticipants.filter((id) => id !== sourceWinner).slice(0, 1);
            return sourceWinner === undefined ? [] : [sourceWinner];
        });
        resolving.delete(key);
        return ids;
    };
    for (const [key, result] of latest) {
        const possible = participants(key);
        if (result.winnerEntrantId !== null)
            tournamentInvariant(
                possible.includes(result.winnerEntrantId),
                'INVALID_RESULT',
                `Winner does not occupy ${key}`
            );
    }
}
