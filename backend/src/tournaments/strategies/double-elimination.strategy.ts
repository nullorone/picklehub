import { tournamentInvariant } from '../tournament.errors';
import type {
    StrategyMatch,
    StrategyRound,
    StrategyStage,
    TournamentFormatStrategy,
    TournamentFormatStrategyInput,
} from '../tournament.types';
import { finalize, makeRound, orderedEntrants, playedResultMap, sourceSlot } from './strategy-support';
import { singleEliminationRounds } from './elimination-support';

export class DoubleEliminationStrategy implements TournamentFormatStrategy {
    readonly formatCode = 'DOUBLE_ELIMINATION' as const;
    readonly strategyVersion = '1.0.0' as const;

    generate(input: TournamentFormatStrategyInput) {
        tournamentInvariant(input.preset.formatCode === this.formatCode, 'INVALID_PRESET', 'Wrong strategy');
        const entrants = orderedEntrants(input);
        tournamentInvariant(
            entrants.length >= 4 && entrants.length <= 64 && (entrants.length & (entrants.length - 1)) === 0,
            'INVALID_ENTRANTS',
            'Double elimination requires a power of two from 4 to 64'
        );
        const winners = singleEliminationRounds(entrants, 'winners', input.preset.courtCount);
        const losers: StrategyRound[] = [];
        let sequence = 1;
        let survivors: string[] = [];
        const firstLosers = winners[0]?.matches.map(({ key }) => key) ?? [];
        survivors = this.consolidate(
            'losers',
            sequence,
            firstLosers.map((key) => ({ key, outcome: 'LOSER' as const })),
            input.preset.courtCount,
            losers
        );
        sequence += 1;
        for (let winnersRound = 1; winnersRound < winners.length; winnersRound += 1) {
            const incoming = [...(winners[winnersRound]?.matches ?? [])].reverse().map(({ key }) => key);
            const injection: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = survivors.map(
                (key, index) => ({
                    key: `losers:round:${String(sequence)}:match:${String(index + 1)}`,
                    courtRank: 0,
                    batch: 0,
                    slots: [sourceSlot(1, key), sourceSlot(2, incoming[index] ?? '', 'LOSER')],
                })
            );
            const injectionRound = makeRound('losers', sequence, injection, input.preset.courtCount);
            losers.push(injectionRound);
            survivors = injectionRound.matches.map(({ key }) => key);
            sequence += 1;
            if (winnersRound < winners.length - 1) {
                survivors = this.consolidate(
                    'losers',
                    sequence,
                    survivors.map((key) => ({ key, outcome: 'WINNER' as const })),
                    input.preset.courtCount,
                    losers
                );
                sequence += 1;
            }
        }
        const winnersFinal = winners.at(-1)?.matches[0]?.key ?? '';
        const losersFinal = survivors[0] ?? '';
        const grandFinalRaw: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = [
            {
                key: 'final:round:1:match:1',
                courtRank: 0,
                batch: 0,
                slots: [sourceSlot(1, winnersFinal), sourceSlot(2, losersFinal)],
            },
        ];
        const grandFinal = makeRound('final', 1, grandFinalRaw, input.preset.courtCount);
        const resetRaw: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = [
            {
                key: 'final:round:2:match:1',
                courtRank: 0,
                batch: 0,
                slots: [
                    sourceSlot(1, grandFinal.matches[0]?.key ?? '', 'WINNER'),
                    sourceSlot(2, grandFinal.matches[0]?.key ?? '', 'LOSER'),
                ],
            },
        ];
        const reset = makeRound('final', 2, resetRaw, input.preset.courtCount);
        const stages: StrategyStage[] = [
            { key: 'winners', sequence: 1, kind: 'WINNERS', rounds: winners },
            { key: 'losers', sequence: 2, kind: 'LOSERS', rounds: losers },
            { key: 'final', sequence: 3, kind: 'FINAL', rounds: [grandFinal, reset] },
        ];
        const results = playedResultMap(input.results);
        const grandResult = results.get(grandFinal.matches[0]?.key ?? '');
        const winnersChampion = this.resolveSourceWinner(winnersFinal, winners, results);
        const resetRequired = grandResult !== undefined && grandResult.winnerEntrantId !== winnersChampion;
        const champion = resetRequired
            ? (results.get(reset.matches[0]?.key ?? '')?.winnerEntrantId ?? null)
            : (grandResult?.winnerEntrantId ?? null);
        const required = stages
            .flatMap(({ rounds }) => rounds.flatMap(({ matches }) => matches.map(({ key }) => key)))
            .filter((key) => key !== reset.matches[0]?.key || resetRequired);
        const standings = entrants
            .map((entrant, index) => ({
                entrantId: entrant.id,
                rank: champion === entrant.id ? 1 : index + 2,
                matchPoints: 0,
                wins: 0,
                gameDifferential: 0,
                pointDifferential: 0,
                pointsScored: 0,
                tieBreakLot: entrant.tieBreakLot,
                detail: { bracket: champion === entrant.id ? 'champion' : 'eliminated' },
            }))
            .sort((left, right) => left.rank - right.rank)
            .map((row, index) => ({ ...row, rank: index + 1 }));
        return finalize(input, stages, standings, champion, required);
    }

    private consolidate(
        stageKey: string,
        sequence: number,
        sources: readonly { key: string; outcome: 'WINNER' | 'LOSER' }[],
        courtCount: number,
        rounds: StrategyRound[]
    ): string[] {
        const raw: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = [];
        for (let index = 0; index < sources.length; index += 2) {
            const left = sources[index];
            const right = sources[index + 1];
            if (left !== undefined && right !== undefined)
                raw.push({
                    key: `${stageKey}:round:${String(sequence)}:match:${String(index / 2 + 1)}`,
                    courtRank: 0,
                    batch: 0,
                    slots: [sourceSlot(1, left.key, left.outcome), sourceSlot(2, right.key, right.outcome)],
                });
        }
        const round = makeRound(stageKey, sequence, raw, courtCount);
        rounds.push(round);
        return round.matches.map(({ key }) => key);
    }

    private resolveSourceWinner(
        key: string,
        rounds: readonly StrategyRound[],
        results: ReadonlyMap<string, { winnerEntrantId: string | null }>
    ): string | null {
        const match = rounds.flatMap(({ matches }) => matches).find((candidate) => candidate.key === key);
        return results.get(key)?.winnerEntrantId ?? match?.automaticWinnerEntrantId ?? null;
    }
}
