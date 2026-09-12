import { tournamentInvariant } from '../tournament.errors';
import type {
    StrategyEntrant,
    StrategyMatch,
    StrategyRound,
    TournamentFormatStrategy,
    TournamentFormatStrategyInput,
} from '../tournament.types';
import { basicStandings, finalize, makeRound, orderedEntrants, playedResultMap, slot } from './strategy-support';

export class SwissStrategy implements TournamentFormatStrategy {
    readonly formatCode = 'SWISS' as const;
    readonly strategyVersion = '1.0.0' as const;

    generate(input: TournamentFormatStrategyInput) {
        tournamentInvariant(input.preset.formatCode === this.formatCode, 'INVALID_PRESET', 'Wrong strategy');
        const entrants = orderedEntrants(input);
        tournamentInvariant(
            entrants.length >= 4 && entrants.length <= 128,
            'INVALID_ENTRANTS',
            'Swiss supports 4..128 entrants'
        );
        tournamentInvariant(
            input.preset.rounds <= entrants.length - 1,
            'INVALID_PRESET',
            'Swiss rounds cannot exceed N-1'
        );
        const results = playedResultMap(input.results);
        const rounds: StrategyRound[] = [];
        const opponents = new Map(entrants.map(({ id }) => [id, new Set<string>()]));
        const byes = new Set<string>();
        for (let sequence = 1; sequence <= input.preset.rounds; sequence += 1) {
            const priorMatches = rounds.flatMap(({ matches }) => matches);
            const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]));
            const order =
                sequence === 1
                    ? entrants
                    : basicStandings(entrants, priorMatches, results).map((row) => {
                          const entrant = byId.get(row.entrantId);
                          tournamentInvariant(entrant !== undefined, 'INVALID_ENTRANTS', 'Standing entrant missing');
                          return entrant;
                      });
            const pool = [...order];
            let bye: StrategyEntrant | undefined;
            if (pool.length % 2 === 1) {
                const candidateIndex = this.byeIndex(pool, byes);
                bye = pool.splice(candidateIndex, 1)[0];
                if (bye !== undefined) byes.add(bye.id);
            }
            const pairs = this.pair(pool, opponents);
            const raw: Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'>[] = pairs.map(
                ([left, right], index) => ({
                    key: `swiss:round:${String(sequence)}:match:${String(index + 1)}`,
                    courtRank: 0,
                    batch: 0,
                    slots: [slot(1, left), slot(2, right)],
                })
            );
            if (bye !== undefined)
                raw.push({
                    key: `swiss:round:${String(sequence)}:bye`,
                    courtRank: 0,
                    batch: 0,
                    slots: [slot(1, bye), slot(2)],
                    automaticOutcome: 'BYE',
                    automaticWinnerEntrantId: bye.id,
                });
            const round = makeRound('swiss', sequence, raw, input.preset.courtCount);
            rounds.push(round);
            for (const [left, right] of pairs) {
                opponents.get(left.id)?.add(right.id);
                opponents.get(right.id)?.add(left.id);
            }
            if (round.matches.some((match) => match.automaticOutcome === undefined && !results.has(match.key))) break;
        }
        const matches = rounds.flatMap(({ matches }) => matches);
        const base = basicStandings(entrants, matches, results);
        const points = new Map(base.map((row) => [row.entrantId, row.matchPoints]));
        const standings = base
            .map((row) => ({
                ...row,
                detail: {
                    buchholz: [...(opponents.get(row.entrantId) ?? [])].reduce(
                        (sum, opponent) => sum + (points.get(opponent) ?? 0),
                        0
                    ),
                },
            }))
            .sort(
                (left, right) =>
                    right.matchPoints - left.matchPoints ||
                    right.detail.buchholz - left.detail.buchholz ||
                    right.wins - left.wins ||
                    right.gameDifferential - left.gameDifferential ||
                    right.pointDifferential - left.pointDifferential ||
                    (left.tieBreakLot < right.tieBreakLot ? -1 : 1)
            )
            .map((row, index) => ({ ...row, rank: index + 1 }));
        const complete =
            rounds.length === input.preset.rounds &&
            matches.every((match) => match.automaticOutcome !== undefined || results.has(match.key));
        return finalize(
            input,
            [{ key: 'swiss', sequence: 1, kind: 'LEAGUE', rounds }],
            standings,
            complete ? (standings[0]?.entrantId ?? null) : null
        );
    }

    private byeIndex(entrants: readonly StrategyEntrant[], byes: ReadonlySet<string>): number {
        for (let index = entrants.length - 1; index >= 0; index -= 1)
            if (!byes.has(entrants[index]?.id ?? '')) return index;
        return entrants.reduce(
            (selected, entrant, index) =>
                entrant.tieBreakLot < (entrants[selected]?.tieBreakLot ?? entrant.tieBreakLot) ? index : selected,
            0
        );
    }

    private pair(
        entrants: readonly StrategyEntrant[],
        opponents: ReadonlyMap<string, ReadonlySet<string>>
    ): (readonly [StrategyEntrant, StrategyEntrant])[] {
        const fresh = this.freshMatching([...entrants], opponents);
        if (fresh !== null) return fresh;
        const remaining = [...entrants];
        const pairs: (readonly [StrategyEntrant, StrategyEntrant])[] = [];
        while (remaining.length > 0) {
            const left = remaining.shift();
            tournamentInvariant(left !== undefined, 'INVALID_ENTRANTS', 'Swiss matching failed');
            const candidates = remaining
                .map((right, index) => ({
                    right,
                    index,
                    rematch: opponents.get(left.id)?.has(right.id) === true ? 1 : 0,
                }))
                .sort(
                    (a, b) =>
                        a.rematch - b.rematch ||
                        Math.abs(left.seed - a.right.seed) - Math.abs(left.seed - b.right.seed) ||
                        (a.right.tieBreakLot < b.right.tieBreakLot ? -1 : 1)
                );
            const selected = candidates[0];
            tournamentInvariant(selected !== undefined, 'INVALID_ENTRANTS', 'Swiss requires a perfect matching');
            remaining.splice(selected.index, 1);
            pairs.push([left, selected.right]);
        }
        return pairs;
    }

    private freshMatching(
        remaining: readonly StrategyEntrant[],
        opponents: ReadonlyMap<string, ReadonlySet<string>>
    ): (readonly [StrategyEntrant, StrategyEntrant])[] | null {
        if (remaining.length === 0) return [];
        const left = remaining[0];
        tournamentInvariant(left !== undefined, 'INVALID_ENTRANTS', 'Swiss matching failed');
        for (let index = 1; index < remaining.length; index += 1) {
            const right = remaining[index];
            if (right === undefined || opponents.get(left.id)?.has(right.id) === true) continue;
            const rest = remaining.filter(
                (_entrant, candidateIndex) => candidateIndex !== 0 && candidateIndex !== index
            );
            const tail = this.freshMatching(rest, opponents);
            if (tail !== null) return [[left, right], ...tail];
        }
        return null;
    }
}
