import { tournamentInvariant } from '../tournament.errors';
import type {
    StrategyMatch,
    StrategyStage,
    TournamentFormatStrategy,
    TournamentFormatStrategyInput,
} from '../tournament.types';
import {
    basicStandings,
    circleRounds,
    finalize,
    makeRound,
    orderedEntrants,
    playedResultMap,
    slot,
} from './strategy-support';

export class RoundRobinStrategy implements TournamentFormatStrategy {
    readonly formatCode = 'ROUND_ROBIN' as const;
    readonly strategyVersion = '1.0.0' as const;

    generate(input: TournamentFormatStrategyInput) {
        tournamentInvariant(input.preset.formatCode === this.formatCode, 'INVALID_PRESET', 'Wrong strategy');
        const entrants = orderedEntrants(input);
        tournamentInvariant(
            entrants.length >= 3 && entrants.length <= 64,
            'INVALID_ENTRANTS',
            'Round robin supports 3..64 entrants'
        );
        const base = circleRounds(entrants);
        const rounds = Array.from({ length: input.preset.legs }, (_, leg) =>
            base.map((pairs, index) => {
                const matches: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = pairs.map(
                    ([left, right], pair) => ({
                        key: `league:leg:${String(leg + 1)}:round:${String(index + 1)}:match:${String(pair + 1)}`,
                        courtRank: 0,
                        batch: 0,
                        slots: leg === 0 ? [slot(1, left), slot(2, right)] : [slot(1, right), slot(2, left)],
                        ...(right === undefined
                            ? { automaticOutcome: 'BYE' as const, automaticWinnerEntrantId: left.id }
                            : {}),
                    })
                );
                return makeRound('league', leg * base.length + index + 1, matches, input.preset.courtCount);
            })
        ).flat();
        const stage: StrategyStage = { key: 'league', sequence: 1, kind: 'LEAGUE', rounds };
        const results = playedResultMap(input.results);
        const standings = basicStandings(
            entrants,
            rounds.flatMap(({ matches }) => matches),
            results
        );
        const completed = rounds
            .flatMap(({ matches }) => matches)
            .every((match) => match.automaticOutcome !== undefined || results.has(match.key));
        return finalize(input, [stage], standings, completed ? (standings[0]?.entrantId ?? null) : null);
    }
}
