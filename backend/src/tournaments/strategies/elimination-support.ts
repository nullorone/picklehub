import type { StrategyEntrant, StrategyMatch, StrategyRound, StrategySlot } from '../tournament.types';
import { makeRound, slot, sourceSlot } from './strategy-support';

export function bracketSeedOrder(size: number): number[] {
    let order = [1];
    for (let current = 2; current <= size; current *= 2) order = order.flatMap((seed) => [seed, current + 1 - seed]);
    return order;
}

export function singleEliminationRounds(
    entrants: readonly StrategyEntrant[],
    stageKey: string,
    courtCount: number
): StrategyRound[] {
    const bracketSize = 2 ** Math.ceil(Math.log2(entrants.length));
    const bySeed = new Map(entrants.map((entrant) => [entrant.seed, entrant]));
    let previousKeys: string[] = [];
    const rounds: StrategyRound[] = [];
    for (let round = 1, matchCount = bracketSize / 2; matchCount >= 1; round += 1, matchCount /= 2) {
        const raw: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = [];
        for (let index = 0; index < matchCount; index += 1) {
            const key = `${stageKey}:round:${String(round)}:match:${String(index + 1)}`;
            let slots: StrategySlot[];
            let automatic: Pick<StrategyMatch, 'automaticOutcome' | 'automaticWinnerEntrantId'> = {};
            if (round === 1) {
                const order = bracketSeedOrder(bracketSize);
                const left = bySeed.get(order[index * 2] ?? -1);
                const right = bySeed.get(order[index * 2 + 1] ?? -1);
                slots = [slot(1, left), slot(2, right)];
                if (left === undefined || right === undefined) {
                    const winner = left ?? right;
                    automatic =
                        winner === undefined
                            ? { automaticOutcome: 'DOUBLE_WALKOVER' }
                            : { automaticOutcome: 'BYE', automaticWinnerEntrantId: winner.id };
                }
            } else {
                slots = [
                    sourceSlot(1, previousKeys[index * 2] ?? ''),
                    sourceSlot(2, previousKeys[index * 2 + 1] ?? ''),
                ];
            }
            raw.push({ key, courtRank: 0, batch: 0, slots, ...automatic });
        }
        const built = makeRound(stageKey, round, raw, courtCount);
        rounds.push(built);
        previousKeys = built.matches.map(({ key }) => key);
    }
    return rounds;
}
