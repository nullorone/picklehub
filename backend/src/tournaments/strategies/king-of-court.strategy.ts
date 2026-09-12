import { tournamentInvariant } from '../tournament.errors';
import type {
    StrategyEntrant,
    StrategyMatch,
    StrategyRound,
    TournamentFormatStrategy,
    TournamentFormatStrategyInput,
} from '../tournament.types';
import { finalize, makeRound, orderedEntrants, playedResultMap, slot } from './strategy-support';

export class KingOfCourtStrategy implements TournamentFormatStrategy {
    readonly formatCode = 'KING_OF_COURT' as const;
    readonly strategyVersion = '1.0.0' as const;

    generate(input: TournamentFormatStrategyInput) {
        tournamentInvariant(input.preset.formatCode === this.formatCode, 'INVALID_PRESET', 'Wrong strategy');
        const entrants = orderedEntrants(input);
        tournamentInvariant(
            entrants.length >= 4 && entrants.length <= 64 && entrants.length % 2 === 0,
            'INVALID_ENTRANTS',
            'King of Court requires an even 4..64 entrants'
        );
        tournamentInvariant(
            input.preset.courtCount === entrants.length / 2,
            'INVALID_PRESET',
            'King of Court requires one court per pair'
        );
        const results = playedResultMap(input.results);
        let positions = [...entrants];
        const rounds: StrategyRound[] = [];
        for (let sequence = 1; sequence <= input.preset.rounds; sequence += 1) {
            const raw: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = [];
            for (let court = 0; court < positions.length / 2; court += 1) {
                raw.push({
                    key: `court:round:${String(sequence)}:match:${String(court + 1)}`,
                    courtRank: 0,
                    batch: 0,
                    slots: [slot(1, positions[court * 2]), slot(2, positions[court * 2 + 1])],
                });
            }
            const round = makeRound('court', sequence, raw, input.preset.courtCount);
            rounds.push(round);
            if (round.matches.some((match) => !results.has(match.key))) break;
            const winners: StrategyEntrant[] = [];
            const losers: StrategyEntrant[] = [];
            for (const [index, match] of round.matches.entries()) {
                const first = positions[index * 2];
                const second = positions[index * 2 + 1];
                tournamentInvariant(
                    first !== undefined && second !== undefined,
                    'INVALID_ENTRANTS',
                    'Court pair missing'
                );
                const winnerId = results.get(match.key)?.winnerEntrantId;
                if (winnerId === first.id) {
                    winners.push(first);
                    losers.push(second);
                } else if (winnerId === second.id) {
                    winners.push(second);
                    losers.push(first);
                } else {
                    winners.push(first);
                    losers.push(second);
                }
            }
            const topWinner = winners[0];
            const lowerWinner = winners[1];
            tournamentInvariant(
                topWinner !== undefined && lowerWinner !== undefined,
                'INVALID_PRESET',
                'Top courts missing'
            );
            const next: StrategyEntrant[] = [topWinner, lowerWinner];
            for (let court = 1; court < winners.length - 1; court += 1) {
                const upperLoser = losers[court - 1];
                const lowerCourtWinner = winners[court + 1];
                tournamentInvariant(
                    upperLoser !== undefined && lowerCourtWinner !== undefined,
                    'INVALID_PRESET',
                    'Court movement source missing'
                );
                next.push(upperLoser, lowerCourtWinner);
            }
            const penultimateLoser = losers.at(-2);
            const bottomLoser = losers.at(-1);
            tournamentInvariant(
                penultimateLoser !== undefined && bottomLoser !== undefined,
                'INVALID_PRESET',
                'Bottom courts missing'
            );
            next.push(penultimateLoser, bottomLoser);
            tournamentInvariant(
                new Set(next.map(({ id }) => id)).size === entrants.length,
                'INVALID_PRESET',
                'Court movement duplicated an entrant'
            );
            positions = next;
        }
        const complete =
            rounds.length === input.preset.rounds &&
            rounds.at(-1)?.matches.every((match) => results.has(match.key)) === true;
        const standings = positions.map((entrant, index) => ({
            entrantId: entrant.id,
            rank: index + 1,
            matchPoints: 0,
            wins: 0,
            gameDifferential: 0,
            pointDifferential: 0,
            pointsScored: 0,
            tieBreakLot: entrant.tieBreakLot,
            detail: { courtRank: Math.floor(index / 2) + 1, courtPosition: (index % 2) + 1 },
        }));
        return finalize(
            input,
            [{ key: 'court', sequence: 1, kind: 'COURT', rounds }],
            standings,
            complete ? (positions[0]?.id ?? null) : null
        );
    }
}
