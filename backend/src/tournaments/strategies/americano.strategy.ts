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

export class AmericanoStrategy implements TournamentFormatStrategy {
    readonly formatCode = 'AMERICANO' as const;
    readonly strategyVersion = '1.0.0' as const;

    generate(input: TournamentFormatStrategyInput) {
        tournamentInvariant(input.preset.formatCode === this.formatCode, 'INVALID_PRESET', 'Wrong strategy');
        const entrants = orderedEntrants(input);
        tournamentInvariant(
            entrants.length >= 4 && entrants.length <= 64 && entrants.length % 4 === 0,
            'INVALID_ENTRANTS',
            'Americano requires 4..64 entrants divisible by four'
        );
        tournamentInvariant(input.preset.rounds <= entrants.length - 1, 'INVALID_PRESET', 'Too many Americano rounds');
        const partnerRounds = circleRounds(entrants).slice(0, input.preset.rounds);
        const rounds = partnerRounds.map((partners, roundIndex) => {
            const sortedPartners = [...partners]
                .filter(
                    (pair): pair is readonly [(typeof entrants)[number], (typeof entrants)[number]] =>
                        pair[1] !== undefined
                )
                .sort((left, right) => Math.min(left[0].seed, left[1].seed) - Math.min(right[0].seed, right[1].seed));
            const matches: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = [];
            for (let index = 0; index < sortedPartners.length; index += 2) {
                const first = sortedPartners[index];
                const second = sortedPartners[index + 1];
                tournamentInvariant(
                    first !== undefined && second !== undefined,
                    'INVALID_PRESET',
                    'Partner pairs must form matches'
                );
                matches.push({
                    key: `americano:round:${String(roundIndex + 1)}:match:${String(index / 2 + 1)}`,
                    courtRank: 0,
                    batch: 0,
                    slots: [slot(1, first[0]), slot(2, first[1]), slot(3, second[0]), slot(4, second[1])],
                });
            }
            return makeRound('americano', roundIndex + 1, matches, input.preset.courtCount);
        });
        const stage: StrategyStage = { key: 'americano', sequence: 1, kind: 'LEAGUE', rounds };
        const results = playedResultMap(input.results);
        const matches = rounds.flatMap(({ matches: values }) => values);
        const preliminary = basicStandings(entrants, matches, results);
        const points = new Map(preliminary.map((standing) => [standing.entrantId, standing.matchPoints]));
        const standings = basicStandings(entrants, matches, results, (_entrantId, row) => ({
            strengthOfSchedule: row.opponents.reduce((sum, opponent) => sum + (points.get(opponent) ?? 0), 0),
        }))
            .sort((left, right) => {
                const base = right.matchPoints - left.matchPoints || right.wins - left.wins;
                if (base !== 0) return base;
                return (
                    Number(right.detail.strengthOfSchedule) - Number(left.detail.strengthOfSchedule) ||
                    left.rank - right.rank
                );
            })
            .map((standing, index) => ({ ...standing, rank: index + 1 }));
        const completed = matches.every((match) => results.has(match.key));
        return finalize(input, [stage], standings, completed ? (standings[0]?.entrantId ?? null) : null);
    }
}
