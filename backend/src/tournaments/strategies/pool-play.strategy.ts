import { tournamentInvariant } from '../tournament.errors';
import type {
    StrategyEntrant,
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
import { singleEliminationRounds } from './elimination-support';

export class PoolPlayStrategy implements TournamentFormatStrategy {
    readonly formatCode = 'POOL_PLAY' as const;
    readonly strategyVersion = '1.0.0' as const;

    generate(input: TournamentFormatStrategyInput) {
        tournamentInvariant(input.preset.formatCode === this.formatCode, 'INVALID_PRESET', 'Wrong strategy');
        const entrants = orderedEntrants(input);
        const preset = input.preset;
        tournamentInvariant(
            entrants.length >= 6 && entrants.length <= 64,
            'INVALID_ENTRANTS',
            'Pool play supports 6..64 entrants'
        );
        tournamentInvariant(
            (preset.playoffSize & (preset.playoffSize - 1)) === 0,
            'INVALID_PRESET',
            'Playoff size must be a power of two'
        );
        tournamentInvariant(
            preset.qualifiersPerPool * preset.poolCount + preset.wildcardCount === preset.playoffSize,
            'INVALID_PRESET',
            'Qualifiers and wildcards must fill playoff'
        );
        const pools = Array.from({ length: preset.poolCount }, () => [] as StrategyEntrant[]);
        entrants.forEach((entrant, index) => {
            const row = Math.floor(index / preset.poolCount);
            const column = index % preset.poolCount;
            pools[row % 2 === 0 ? column : preset.poolCount - 1 - column]?.push(entrant);
        });
        tournamentInvariant(
            Math.min(...pools.map(({ length }) => length)) >= preset.qualifiersPerPool,
            'INVALID_PRESET',
            'Not enough entrants per pool'
        );
        const stages: StrategyStage[] = pools.map((pool, poolIndex) => {
            const stageKey = `pool:${String(poolIndex + 1)}`;
            const rounds = circleRounds(pool).map((pairs, roundIndex) =>
                makeRound(
                    stageKey,
                    roundIndex + 1,
                    pairs.map(
                        ([left, right], matchIndex): Omit<StrategyMatch, 'stageKey' | 'roundKey' | 'sequence'> => ({
                            key: `${stageKey}:round:${String(roundIndex + 1)}:match:${String(matchIndex + 1)}`,
                            courtRank: 0,
                            batch: 0,
                            slots: [slot(1, left), slot(2, right)],
                            ...(right === undefined
                                ? { automaticOutcome: 'BYE' as const, automaticWinnerEntrantId: left.id }
                                : {}),
                        })
                    ),
                    preset.courtCount
                )
            );
            return { key: stageKey, sequence: poolIndex + 1, kind: 'POOL' as const, rounds };
        });
        const results = playedResultMap(input.results);
        const poolMatches = stages.flatMap(({ rounds }) => rounds.flatMap(({ matches }) => matches));
        const poolComplete = poolMatches.every(
            (match) => match.automaticOutcome !== undefined || results.has(match.key)
        );
        const poolStandings = pools.map((pool, index) =>
            basicStandings(pool, stages[index]?.rounds.flatMap(({ matches }) => matches) ?? [], results, () => ({
                pool: index + 1,
            }))
        );
        let champion: string | null = null;
        if (poolComplete) {
            const direct = poolStandings.flatMap((rows) => rows.slice(0, preset.qualifiersPerPool));
            const wildcards = poolStandings
                .flatMap((rows) => rows.slice(preset.qualifiersPerPool))
                .sort(
                    (left, right) =>
                        right.matchPoints - left.matchPoints ||
                        right.wins - left.wins ||
                        right.gameDifferential - left.gameDifferential ||
                        right.pointDifferential - left.pointDifferential ||
                        (left.tieBreakLot < right.tieBreakLot ? -1 : 1)
                )
                .slice(0, preset.wildcardCount);
            const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]));
            const qualified = [...direct, ...wildcards].map((row, index) => {
                const entrant = byId.get(row.entrantId);
                tournamentInvariant(entrant !== undefined, 'INVALID_ENTRANTS', 'Qualified entrant missing');
                return { ...entrant, seed: index + 1 };
            });
            const playoffRounds = singleEliminationRounds(qualified, 'playoff', preset.courtCount);
            stages.push({ key: 'playoff', sequence: stages.length + 1, kind: 'PLAYOFF', rounds: playoffRounds });
            const final = playoffRounds.at(-1)?.matches[0];
            champion =
                final === undefined
                    ? null
                    : (results.get(final.key)?.winnerEntrantId ?? final.automaticWinnerEntrantId ?? null);
        }
        const standings = poolStandings
            .flat()
            .sort(
                (left, right) =>
                    (champion === right.entrantId ? 1 : 0) - (champion === left.entrantId ? 1 : 0) ||
                    right.matchPoints - left.matchPoints ||
                    (left.tieBreakLot < right.tieBreakLot ? -1 : 1)
            )
            .map((row, index) => ({ ...row, rank: index + 1 }));
        return finalize(input, stages, standings, champion);
    }
}
