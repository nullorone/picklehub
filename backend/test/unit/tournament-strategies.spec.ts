import { AmericanoStrategy } from '../../src/tournaments/strategies/americano.strategy';
import { DoubleEliminationStrategy } from '../../src/tournaments/strategies/double-elimination.strategy';
import { bracketSeedOrder } from '../../src/tournaments/strategies/elimination-support';
import { KingOfCourtStrategy } from '../../src/tournaments/strategies/king-of-court.strategy';
import { LadderStrategy } from '../../src/tournaments/strategies/ladder.strategy';
import { PoolPlayStrategy } from '../../src/tournaments/strategies/pool-play.strategy';
import { RoundRobinStrategy } from '../../src/tournaments/strategies/round-robin.strategy';
import { SingleEliminationStrategy } from '../../src/tournaments/strategies/single-elimination.strategy';
import { SwissStrategy } from '../../src/tournaments/strategies/swiss.strategy';
import { validateTournamentScore } from '../../src/tournaments/tournament-score';
import { TournamentStrategyRegistry } from '../../src/tournaments/tournament-strategy.registry';
import type {
    StrategyEntrant,
    StrategyMatch,
    StrategyResult,
    TournamentFormatStrategy,
    TournamentFormatStrategyInput,
    TournamentPreset,
} from '../../src/tournaments/tournament.types';

const entrants = (count: number): StrategyEntrant[] =>
    Array.from({ length: count }, (_, index) => ({
        id: `entrant-${String(index + 1)}`,
        seed: index + 1,
        tieBreakLot: BigInt(10_000 + index),
    }));

function input(preset: TournamentPreset, count: number, results: StrategyResult[] = []): TournamentFormatStrategyInput {
    return { strategyVersion: '1.0.0', preset, entrants: entrants(count), results, projectionRevision: 0n };
}

function matches(output: ReturnType<TournamentFormatStrategy['generate']>): StrategyMatch[] {
    return output.stages.flatMap(({ rounds }) => rounds.flatMap((round) => round.matches));
}

function played(match: StrategyMatch, winner = match.slots[0]?.entrantId): StrategyResult {
    return {
        matchKey: match.key,
        revision: 1,
        outcome: 'PLAYED',
        winnerEntrantId: winner ?? 'entrant-1',
        scores: [{ game: 1, sideOne: 11, sideTwo: 4 }],
    };
}

function simulate(strategy: TournamentFormatStrategy, request: TournamentFormatStrategyInput) {
    const results: StrategyResult[] = [];
    for (let iteration = 0; iteration < 1_000; iteration += 1) {
        const output = strategy.generate({ ...request, results });
        if (output.championEntrantId !== null) return output;
        const allMatches = matches(output);
        const latest = new Map(results.map((value) => [value.matchKey, value]));
        const byKey = new Map(allMatches.map((match) => [match.key, match]));
        const resolve = (match: StrategyMatch): string[] =>
            match.slots.flatMap((candidate) => {
                if (candidate.entrantId !== undefined) return [candidate.entrantId];
                const source = candidate.sourceMatchKey === undefined ? undefined : byKey.get(candidate.sourceMatchKey);
                if (source === undefined) return [];
                const sourceEntrants = resolve(source);
                const winner = latest.get(source.key)?.winnerEntrantId ?? source.automaticWinnerEntrantId;
                return candidate.sourceOutcome === 'LOSER'
                    ? sourceEntrants.filter((id) => id !== winner).slice(0, 1)
                    : winner === undefined
                      ? []
                      : [winner];
            });
        const playable = allMatches.find(
            (match) => match.automaticOutcome === undefined && !latest.has(match.key) && resolve(match).length >= 2
        );
        expect(playable).toBeDefined();
        if (playable === undefined) throw new Error('Playable match missing');
        const participants = resolve(playable);
        results.push({
            matchKey: playable.key,
            revision: 1,
            outcome: 'PLAYED',
            winnerEntrantId: participants[0] ?? null,
            scores: [{ game: 1, sideOne: 11, sideTwo: 4 }],
        });
    }
    throw new Error('Simulation did not converge');
}

describe('built-in tournament strategies', () => {
    test('registry is a closed exact-version allowlist', () => {
        const registry = new TournamentStrategyRegistry();
        expect(registry.get('SWISS', '1.0.0')).toBeInstanceOf(SwissStrategy);
        expect(() => registry.get('CUSTOM_DSL', '1.0.0')).toThrow('CUSTOM_DSL is disabled');
        expect(() => registry.get('SWISS', '2.0.0')).toThrow('not allowlisted');
    });

    test('round robin reproduces the odd entrant golden schedule and is byte deterministic', () => {
        const request = input({ schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 2, legs: 1 }, 5);
        const strategy = new RoundRobinStrategy();
        const first = strategy.generate(request);
        const second = strategy.generate(request);
        expect(first.projectionChecksum).toBe(second.projectionChecksum);
        expect(first.stages[0]?.rounds).toHaveLength(5);
        const pairs = first.stages[0]?.rounds[0]?.matches.map((match) =>
            match.slots.flatMap((slot) => slot.entrantId?.replace('entrant-', '') ?? [])
        );
        expect(pairs).toEqual([['1'], ['2', '5'], ['3', '4']]);
    });

    test('single elimination uses the documented seed order and exactly two automatic byes for six', () => {
        expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
        const output = new SingleEliminationStrategy().generate(
            input({ schemaVersion: '1.0.0', formatCode: 'SINGLE_ELIMINATION', courtCount: 3, bronzeMatch: true }, 6)
        );
        expect(output.stages[0]?.rounds).toHaveLength(3);
        expect(matches(output).filter(({ automaticOutcome }) => automaticOutcome === 'BYE')).toHaveLength(2);
        expect(output.stages[1]?.kind).toBe('BRONZE');
    });

    test('Americano never repeats a partner during the first N-1 rounds', () => {
        const output = new AmericanoStrategy().generate(
            input({ schemaVersion: '1.0.0', formatCode: 'AMERICANO', courtCount: 2, rounds: 7 }, 8)
        );
        const seen = new Set<string>();
        for (const match of matches(output)) {
            for (const side of [match.slots.slice(0, 2), match.slots.slice(2)]) {
                const key = side
                    .map(({ entrantId }) => entrantId)
                    .sort()
                    .join(':');
                expect(seen.has(key)).toBe(false);
                seen.add(key);
            }
        }
        expect(seen.size).toBe(28);
    });

    test('double elimination has complete winner/loser graphs and conditional reset', () => {
        const output = new DoubleEliminationStrategy().generate(
            input({ schemaVersion: '1.0.0', formatCode: 'DOUBLE_ELIMINATION', courtCount: 4, grandFinalReset: true }, 8)
        );
        expect(
            output.stages.find(({ key }) => key === 'winners')?.rounds.flatMap(({ matches }) => matches)
        ).toHaveLength(7);
        expect(
            output.stages.find(({ key }) => key === 'losers')?.rounds.flatMap(({ matches }) => matches)
        ).toHaveLength(6);
        expect(output.requiredTerminalMatchKeys).not.toContain('final:round:2:match:1');
    });

    test('Swiss avoids rematches while a fresh deterministic pairing is available', () => {
        const preset = { schemaVersion: '1.0.0', formatCode: 'SWISS', courtCount: 4, rounds: 3 } as const;
        const strategy = new SwissStrategy();
        const first = strategy.generate(input(preset, 8));
        const firstResults = matches(first).map((match) => played(match));
        const second = strategy.generate(input(preset, 8, firstResults));
        const pairs = matches(second)
            .filter(({ key }) => key.includes('round:2'))
            .map((match) =>
                match.slots
                    .map(({ entrantId }) => entrantId)
                    .sort()
                    .join(':')
            );
        const prior = new Set(
            matches(first).map((match) =>
                match.slots
                    .map(({ entrantId }) => entrantId)
                    .sort()
                    .join(':')
            )
        );
        expect(pairs.every((pair) => !prior.has(pair))).toBe(true);
    });

    test('pool play creates playoff only after every pool match is terminal', () => {
        const preset = {
            schemaVersion: '1.0.0',
            formatCode: 'POOL_PLAY',
            courtCount: 2,
            poolCount: 2,
            qualifiersPerPool: 2,
            wildcardCount: 0,
            playoffSize: 4,
        } as const;
        const strategy = new PoolPlayStrategy();
        const before = strategy.generate(input(preset, 8));
        expect(before.stages.some(({ key }) => key === 'playoff')).toBe(false);
        const results = matches(before)
            .filter(({ automaticOutcome }) => automaticOutcome === undefined)
            .map((match) => played(match));
        const after = strategy.generate(input(preset, 8, results));
        expect(
            after.stages.find(({ key }) => key === 'playoff')?.rounds.flatMap(({ matches }) => matches)
        ).toHaveLength(3);
    });

    test('ladder and King of Court preserve a permutation after simultaneous movement', () => {
        const ladderPreset = {
            schemaVersion: '1.0.0',
            formatCode: 'LADDER',
            courtCount: 2,
            rounds: 3,
            challengeSpan: 2,
        } as const;
        const ladder = new LadderStrategy();
        const ladderFirst = ladder.generate(input(ladderPreset, 6));
        const ladderNext = ladder.generate(
            input(
                ladderPreset,
                6,
                matches(ladderFirst).map((match) => played(match))
            )
        );
        expect(new Set(ladderNext.standings.map(({ entrantId }) => entrantId)).size).toBe(6);

        const courtPreset = { schemaVersion: '1.0.0', formatCode: 'KING_OF_COURT', courtCount: 3, rounds: 2 } as const;
        const court = new KingOfCourtStrategy();
        const courtFirst = court.generate(input(courtPreset, 6));
        const courtNext = court.generate(
            input(
                courtPreset,
                6,
                matches(courtFirst).map((match) => played(match))
            )
        );
        expect(new Set(courtNext.standings.map(({ entrantId }) => entrantId)).size).toBe(6);
        expect(courtNext.stages[0]?.rounds).toHaveLength(2);
    });

    test('score primitive rejects draws and accepts cap-at-15', () => {
        expect(() => {
            validateTournamentScore(
                'ONE_GAME_11_WIN_BY_2_CAP_15',
                [{ game: 1, sideOne: 11, sideTwo: 11 }],
                'a',
                'a',
                'b'
            );
        }).toThrow('Draw is forbidden');
        expect(() => {
            validateTournamentScore(
                'ONE_GAME_11_WIN_BY_2_CAP_15',
                [{ game: 1, sideOne: 15, sideTwo: 14 }],
                'a',
                'a',
                'b'
            );
        }).not.toThrow();
    });

    test.each([
        [new AmericanoStrategy(), { schemaVersion: '1.0.0', formatCode: 'AMERICANO', courtCount: 2, rounds: 3 }, 8],
        [new RoundRobinStrategy(), { schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 2, legs: 1 }, 5],
        [
            new SingleEliminationStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'SINGLE_ELIMINATION', courtCount: 3, bronzeMatch: false },
            6,
        ],
        [
            new DoubleEliminationStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'DOUBLE_ELIMINATION', courtCount: 4, grandFinalReset: true },
            8,
        ],
        [
            new PoolPlayStrategy(),
            {
                schemaVersion: '1.0.0',
                formatCode: 'POOL_PLAY',
                courtCount: 2,
                poolCount: 2,
                qualifiersPerPool: 2,
                wildcardCount: 0,
                playoffSize: 4,
            },
            8,
        ],
        [new SwissStrategy(), { schemaVersion: '1.0.0', formatCode: 'SWISS', courtCount: 4, rounds: 3 }, 8],
        [
            new LadderStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'LADDER', courtCount: 3, rounds: 3, challengeSpan: 2 },
            8,
        ],
        [
            new KingOfCourtStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'KING_OF_COURT', courtCount: 4, rounds: 3 },
            8,
        ],
    ] as const)('%s simulation converges with unique final ranks', (strategy, preset, count) => {
        const output = simulate(strategy, input(preset, count));
        expect(output.championEntrantId).not.toBeNull();
        expect(new Set(output.standings.map(({ rank }) => rank)).size).toBe(count);
        expect(output.standings).toHaveLength(count);
    });

    test.each([
        [new AmericanoStrategy(), { schemaVersion: '1.0.0', formatCode: 'AMERICANO', courtCount: 1, rounds: 3 }, 4],
        [new AmericanoStrategy(), { schemaVersion: '1.0.0', formatCode: 'AMERICANO', courtCount: 16, rounds: 63 }, 64],
        [new RoundRobinStrategy(), { schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 1, legs: 1 }, 3],
        [new RoundRobinStrategy(), { schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 32, legs: 2 }, 64],
        [
            new SingleEliminationStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'SINGLE_ELIMINATION', courtCount: 1, bronzeMatch: false },
            2,
        ],
        [
            new SingleEliminationStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'SINGLE_ELIMINATION', courtCount: 64, bronzeMatch: true },
            128,
        ],
        [
            new DoubleEliminationStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'DOUBLE_ELIMINATION', courtCount: 1, grandFinalReset: true },
            4,
        ],
        [
            new DoubleEliminationStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'DOUBLE_ELIMINATION', courtCount: 32, grandFinalReset: true },
            64,
        ],
        [
            new PoolPlayStrategy(),
            {
                schemaVersion: '1.0.0',
                formatCode: 'POOL_PLAY',
                courtCount: 1,
                poolCount: 2,
                qualifiersPerPool: 1,
                wildcardCount: 0,
                playoffSize: 2,
            },
            6,
        ],
        [
            new PoolPlayStrategy(),
            {
                schemaVersion: '1.0.0',
                formatCode: 'POOL_PLAY',
                courtCount: 32,
                poolCount: 16,
                qualifiersPerPool: 1,
                wildcardCount: 16,
                playoffSize: 32,
            },
            64,
        ],
        [new SwissStrategy(), { schemaVersion: '1.0.0', formatCode: 'SWISS', courtCount: 2, rounds: 3 }, 4],
        [new SwissStrategy(), { schemaVersion: '1.0.0', formatCode: 'SWISS', courtCount: 64, rounds: 9 }, 128],
        [
            new LadderStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'LADDER', courtCount: 1, rounds: 3, challengeSpan: 1 },
            4,
        ],
        [
            new LadderStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'LADDER', courtCount: 32, rounds: 20, challengeSpan: 5 },
            64,
        ],
        [
            new KingOfCourtStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'KING_OF_COURT', courtCount: 2, rounds: 1 },
            4,
        ],
        [
            new KingOfCourtStrategy(),
            { schemaVersion: '1.0.0', formatCode: 'KING_OF_COURT', courtCount: 32, rounds: 20 },
            64,
        ],
    ] as const)('%s supports its configured boundary size', (strategy, preset, count) => {
        const output = strategy.generate(input(preset, count));
        expect(output.standings).toHaveLength(count);
        for (const stage of output.stages) {
            for (const round of stage.rounds) {
                const direct = round.matches.flatMap((match) =>
                    match.slots.flatMap((candidate) => candidate.entrantId ?? [])
                );
                expect(new Set(direct).size).toBe(direct.length);
            }
        }
    });
});
