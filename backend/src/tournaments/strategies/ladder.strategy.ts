import { tournamentInvariant } from '../tournament.errors';
import type {
    StrategyMatch,
    StrategyRound,
    TournamentFormatStrategy,
    TournamentFormatStrategyInput,
} from '../tournament.types';
import { finalize, makeRound, orderedEntrants, playedResultMap, slot } from './strategy-support';

export class LadderStrategy implements TournamentFormatStrategy {
    readonly formatCode = 'LADDER' as const;
    readonly strategyVersion = '1.0.0' as const;

    generate(input: TournamentFormatStrategyInput) {
        tournamentInvariant(input.preset.formatCode === this.formatCode, 'INVALID_PRESET', 'Wrong strategy');
        const entrants = orderedEntrants(input);
        tournamentInvariant(
            entrants.length >= 4 && entrants.length <= 64,
            'INVALID_ENTRANTS',
            'Ladder supports 4..64 entrants'
        );
        const results = playedResultMap(input.results);
        const positions = [...entrants];
        const rounds: StrategyRound[] = [];
        for (let sequence = 1; sequence <= input.preset.rounds; sequence += 1) {
            const raw: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = [];
            for (let base = 0; base < positions.length; base += input.preset.challengeSpan * 2) {
                const blockSize = Math.min(input.preset.challengeSpan * 2, positions.length - base);
                const half = Math.ceil(blockSize / 2);
                for (let offset = 0; offset < blockSize - half; offset += 1) {
                    const target = positions[base + offset];
                    const challenger = positions[base + half + offset];
                    if (challenger !== undefined && target !== undefined)
                        raw.push({
                            key: `ladder:round:${String(sequence)}:match:${String(raw.length + 1)}`,
                            courtRank: 0,
                            batch: 0,
                            slots: [slot(1, challenger), slot(2, target)],
                        });
                }
            }
            const round = makeRound('ladder', sequence, raw, input.preset.courtCount);
            rounds.push(round);
            if (round.matches.some((match) => !results.has(match.key))) break;
            const next = [...positions];
            for (const match of round.matches) {
                const result = results.get(match.key);
                if (result?.winnerEntrantId === match.slots[0]?.entrantId) {
                    const challengerIndex = next.findIndex(({ id }) => id === match.slots[0]?.entrantId);
                    const defenderIndex = next.findIndex(({ id }) => id === match.slots[1]?.entrantId);
                    const challenger = next[challengerIndex];
                    const defender = next[defenderIndex];
                    tournamentInvariant(
                        challenger !== undefined && defender !== undefined,
                        'INVALID_ENTRANTS',
                        'Ladder position missing'
                    );
                    [next[challengerIndex], next[defenderIndex]] = [defender, challenger];
                }
            }
            positions.splice(0, positions.length, ...next);
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
            detail: { ladderPosition: index + 1 },
        }));
        return finalize(
            input,
            [{ key: 'ladder', sequence: 1, kind: 'LADDER', rounds }],
            standings,
            complete ? (positions[0]?.id ?? null) : null
        );
    }
}
