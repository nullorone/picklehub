import { tournamentInvariant } from '../tournament.errors';
import type {
    StrategyMatch,
    StrategyStage,
    TournamentFormatStrategy,
    TournamentFormatStrategyInput,
} from '../tournament.types';
import { finalize, makeRound, orderedEntrants, playedResultMap, sourceSlot } from './strategy-support';
import { singleEliminationRounds } from './elimination-support';

export class SingleEliminationStrategy implements TournamentFormatStrategy {
    readonly formatCode = 'SINGLE_ELIMINATION' as const;
    readonly strategyVersion = '1.0.0' as const;

    generate(input: TournamentFormatStrategyInput) {
        tournamentInvariant(input.preset.formatCode === this.formatCode, 'INVALID_PRESET', 'Wrong strategy');
        const entrants = orderedEntrants(input);
        tournamentInvariant(
            entrants.length >= 2 && entrants.length <= 128,
            'INVALID_ENTRANTS',
            'Single elimination supports 2..128 entrants'
        );
        const rounds = singleEliminationRounds(entrants, 'single-elimination', input.preset.courtCount);
        const stages: StrategyStage[] = [{ key: 'single-elimination', sequence: 1, kind: 'PLAYOFF', rounds }];
        if (input.preset.bronzeMatch && rounds.length > 1) {
            const semifinals = rounds.at(-2)?.matches ?? [];
            const raw: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = [
                {
                    key: 'bronze:round:1:match:1',
                    courtRank: 0,
                    batch: 0,
                    slots: [
                        sourceSlot(1, semifinals[0]?.key ?? '', 'LOSER'),
                        sourceSlot(2, semifinals[1]?.key ?? '', 'LOSER'),
                    ],
                },
            ];
            stages.push({
                key: 'bronze',
                sequence: 2,
                kind: 'BRONZE',
                rounds: [makeRound('bronze', 1, raw, input.preset.courtCount)],
            });
        }
        const results = playedResultMap(input.results);
        const final = rounds.at(-1)?.matches[0];
        const champion =
            final === undefined
                ? null
                : (results.get(final.key)?.winnerEntrantId ?? final.automaticWinnerEntrantId ?? null);
        const eliminationOrder = entrants
            .map((entrant) => {
                let lastRound = 0;
                for (const round of rounds) {
                    for (const match of round.matches) {
                        const result = results.get(match.key);
                        if (
                            result?.winnerEntrantId !== entrant.id &&
                            match.slots.some((candidate) => candidate.entrantId === entrant.id)
                        )
                            lastRound = round.sequence;
                    }
                }
                return { entrant, lastRound };
            })
            .sort(
                (left, right) =>
                    right.lastRound - left.lastRound ||
                    left.entrant.seed - right.entrant.seed ||
                    (left.entrant.tieBreakLot < right.entrant.tieBreakLot ? -1 : 1)
            );
        const standings = eliminationOrder
            .map(({ entrant, lastRound }, index) => ({
                entrantId: entrant.id,
                rank: champion === entrant.id ? 1 : index + 1,
                matchPoints: 0,
                wins: 0,
                gameDifferential: 0,
                pointDifferential: 0,
                pointsScored: 0,
                tieBreakLot: entrant.tieBreakLot,
                detail: { eliminationRound: lastRound },
            }))
            .sort((left, right) => left.rank - right.rank)
            .map((row, index) => ({ ...row, rank: index + 1 }));
        return finalize(input, stages, standings, champion);
    }
}
