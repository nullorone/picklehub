import { performance } from 'node:perf_hooks';

import { TournamentOrchestrator, type TournamentExecutionState } from '../../src/tournaments/tournament-orchestrator';
import { materializeTieBreakLots } from '../../src/tournaments/tournament-random';
import { TournamentStrategyRegistry } from '../../src/tournaments/tournament-strategy.registry';
import type {
    BuiltInFormatCode,
    StrategyEntrant,
    StrategyMatch,
    StrategyResult,
    TournamentFormatStrategy,
    TournamentFormatStrategyInput,
    TournamentPreset,
} from '../../src/tournaments/tournament.types';

interface FormatCase {
    readonly code: BuiltInFormatCode;
    readonly count: number;
    readonly preset: TournamentPreset;
}

const registry = new TournamentStrategyRegistry();

function entrants(count: number): StrategyEntrant[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `entrant-${String(index + 1)}`,
        seed: index + 1,
        tieBreakLot: BigInt(100_000 + index),
    }));
}

function request(preset: TournamentPreset, count: number, results: readonly StrategyResult[] = []) {
    return {
        strategyVersion: '1.0.0',
        preset,
        entrants: entrants(count),
        results,
        projectionRevision: BigInt(results.length),
    } satisfies TournamentFormatStrategyInput;
}

function matches(output: ReturnType<TournamentFormatStrategy['generate']>): StrategyMatch[] {
    return output.stages.flatMap(({ rounds }) => rounds.flatMap((round) => round.matches));
}

function resolveParticipants(
    match: StrategyMatch,
    byKey: ReadonlyMap<string, StrategyMatch>,
    latest: ReadonlyMap<string, StrategyResult>
): string[] {
    return match.slots.flatMap((slot) => {
        if (slot.entrantId !== undefined) return [slot.entrantId];
        if (slot.sourceMatchKey === undefined) return [];
        const source = byKey.get(slot.sourceMatchKey);
        if (source === undefined) return [];
        const sourceParticipants = resolveParticipants(source, byKey, latest);
        const winner = latest.get(source.key)?.winnerEntrantId ?? source.automaticWinnerEntrantId;
        if (slot.sourceOutcome === 'LOSER') return sourceParticipants.filter((id) => id !== winner).slice(0, 1);
        return winner === undefined ? [] : [winner];
    });
}

function terminalResult(match: StrategyMatch, participants: readonly string[], index: number): StrategyResult {
    if (index % 17 === 0) {
        return {
            matchKey: match.key,
            revision: 1,
            outcome: 'DOUBLE_WALKOVER',
            winnerEntrantId: null,
            scores: [],
        };
    }
    const winnerEntrantId = participants[index % participants.length] ?? null;
    return {
        matchKey: match.key,
        revision: 1,
        outcome: index % 7 === 0 ? 'WALKOVER' : 'PLAYED',
        winnerEntrantId,
        scores:
            index % 7 === 0
                ? []
                : [
                      {
                          game: 1,
                          sideOne: winnerEntrantId === participants[0] ? 11 : 4,
                          sideTwo: winnerEntrantId === participants[0] ? 4 : 11,
                      },
                  ],
    };
}

function simulate(format: FormatCase) {
    const strategy = registry.get(format.code, '1.0.0');
    const results: StrategyResult[] = [];
    for (let iteration = 0; iteration < 2_000; iteration += 1) {
        const output = strategy.generate(request(format.preset, format.count, results));
        if (output.championEntrantId !== null) return output;
        const allMatches = matches(output);
        const byKey = new Map(allMatches.map((match) => [match.key, match]));
        const latest = new Map(results.map((result) => [result.matchKey, result]));
        const playable = allMatches.find((match) => {
            const participants = resolveParticipants(match, byKey, latest);
            return match.automaticOutcome === undefined && !latest.has(match.key) && participants.length >= 2;
        });
        expect(playable).toBeDefined();
        if (playable === undefined) throw new Error(`${format.code} has no resumable match`);
        const participants = resolveParticipants(playable, byKey, latest);
        // Elimination formats cannot always recover a champion from a double walkover, so their end-to-end path
        // uses played/walkover results while league formats additionally exercise the no-winner terminal outcome.
        const resultIndex = ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'POOL_PLAY'].includes(format.code)
            ? (results.length % 6) + 1
            : results.length;
        results.push(terminalResult(playable, participants, resultIndex));
    }
    throw new Error(`${format.code} did not terminate`);
}

const representativeCases: readonly FormatCase[] = [
    {
        code: 'AMERICANO',
        count: 8,
        preset: { schemaVersion: '1.0.0', formatCode: 'AMERICANO', courtCount: 2, rounds: 7 },
    },
    {
        code: 'ROUND_ROBIN',
        count: 5,
        preset: { schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 2, legs: 2 },
    },
    {
        code: 'SINGLE_ELIMINATION',
        count: 6,
        preset: { schemaVersion: '1.0.0', formatCode: 'SINGLE_ELIMINATION', courtCount: 3, bronzeMatch: true },
    },
    {
        code: 'DOUBLE_ELIMINATION',
        count: 8,
        preset: { schemaVersion: '1.0.0', formatCode: 'DOUBLE_ELIMINATION', courtCount: 4, grandFinalReset: true },
    },
    {
        code: 'POOL_PLAY',
        count: 8,
        preset: {
            schemaVersion: '1.0.0',
            formatCode: 'POOL_PLAY',
            courtCount: 2,
            poolCount: 2,
            qualifiersPerPool: 2,
            wildcardCount: 0,
            playoffSize: 4,
        },
    },
    {
        code: 'SWISS',
        count: 7,
        preset: { schemaVersion: '1.0.0', formatCode: 'SWISS', courtCount: 3, rounds: 6 },
    },
    {
        code: 'LADDER',
        count: 8,
        preset: { schemaVersion: '1.0.0', formatCode: 'LADDER', courtCount: 4, rounds: 6, challengeSpan: 3 },
    },
    {
        code: 'KING_OF_COURT',
        count: 8,
        preset: { schemaVersion: '1.0.0', formatCode: 'KING_OF_COURT', courtCount: 4, rounds: 6 },
    },
] as const;

const boundaryCases: readonly FormatCase[] = [
    {
        code: 'AMERICANO',
        count: 64,
        preset: { schemaVersion: '1.0.0', formatCode: 'AMERICANO', courtCount: 16, rounds: 63 },
    },
    {
        code: 'ROUND_ROBIN',
        count: 64,
        preset: { schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 32, legs: 2 },
    },
    {
        code: 'SINGLE_ELIMINATION',
        count: 128,
        preset: { schemaVersion: '1.0.0', formatCode: 'SINGLE_ELIMINATION', courtCount: 64, bronzeMatch: true },
    },
    {
        code: 'DOUBLE_ELIMINATION',
        count: 64,
        preset: { schemaVersion: '1.0.0', formatCode: 'DOUBLE_ELIMINATION', courtCount: 32, grandFinalReset: true },
    },
    {
        code: 'POOL_PLAY',
        count: 64,
        preset: {
            schemaVersion: '1.0.0',
            formatCode: 'POOL_PLAY',
            courtCount: 32,
            poolCount: 16,
            qualifiersPerPool: 1,
            wildcardCount: 16,
            playoffSize: 32,
        },
    },
    {
        code: 'SWISS',
        count: 128,
        preset: { schemaVersion: '1.0.0', formatCode: 'SWISS', courtCount: 64, rounds: 9 },
    },
    {
        code: 'LADDER',
        count: 64,
        preset: { schemaVersion: '1.0.0', formatCode: 'LADDER', courtCount: 32, rounds: 20, challengeSpan: 5 },
    },
    {
        code: 'KING_OF_COURT',
        count: 64,
        preset: { schemaVersion: '1.0.0', formatCode: 'KING_OF_COURT', courtCount: 32, rounds: 20 },
    },
] as const;

describe('tournament verification matrix', () => {
    test.each(representativeCases)('$code completes a resumable strategy simulation', (format) => {
        const output = simulate(format);
        expect(output.championEntrantId).not.toBeNull();
        expect(output.standings).toHaveLength(format.count);
        expect(new Set(output.standings.map(({ entrantId }) => entrantId)).size).toBe(format.count);
        expect(new Set(output.standings.map(({ rank }) => rank)).size).toBe(format.count);
    });

    test.each(representativeCases)('$code completes registration-to-finalization command flow', (format) => {
        const orchestrator = new TournamentOrchestrator(registry);
        let current: TournamentExecutionState = {
            id: `tournament-${format.code}`,
            version: 0,
            projectionRevision: 0n,
            state: 'PUBLISHED',
            capacity: format.count,
            strategyVersion: '1.0.0',
            preset: format.preset,
            scoringProfile: 'ONE_GAME_11_WIN_BY_2_CAP_15',
            entrants: [],
            results: [],
            startedMatchKeys: [],
            courtAssignments: [],
            projection: null,
            completionChecksum: null,
            closedReason: null,
            audit: [],
        };
        for (let index = 0; index < format.count; index += 1) {
            current = orchestrator.apply(current, `register-${String(index)}`, {
                kind: 'REGISTER',
                entrantId: `entrant-${String(index + 1)}`,
                expectedVersion: current.version,
            });
        }
        current = orchestrator.apply(current, 'seed', {
            kind: 'SEED',
            orderedEntrantIds: current.entrants.map(({ id }) => id),
            initializedRandomness: 'command-flow-seed',
            expectedVersion: current.version,
        });
        current = orchestrator.apply(current, 'start', { kind: 'START', expectedVersion: current.version });

        for (let iteration = 0; iteration < 2_000; iteration += 1) {
            const projection = current.projection;
            if (projection === null) throw new Error(`${format.code} projection is missing`);
            const required = projection.requiredTerminalMatchKeys;
            const terminal = new Set(current.results.map(({ matchKey }) => matchKey));
            for (const match of matches(projection)) if (match.automaticOutcome !== undefined) terminal.add(match.key);
            if (projection.championEntrantId !== null && required.every((matchKey) => terminal.has(matchKey))) break;
            const allMatches = matches(projection);
            const byKey = new Map(allMatches.map((match) => [match.key, match]));
            const latest = new Map(current.results.map((result) => [result.matchKey, result]));
            const playable = allMatches.find((match) => {
                const participants = resolveParticipants(match, byKey, latest);
                return match.automaticOutcome === undefined && !latest.has(match.key) && participants.length >= 2;
            });
            if (playable === undefined) throw new Error(`${format.code} command flow cannot resume`);
            const participants = resolveParticipants(playable, byKey, latest);
            const winnerEntrantId = participants[0] ?? null;
            current = orchestrator.apply(current, `score-${playable.key}`, {
                kind: 'SCORE',
                expectedVersion: current.version,
                result: {
                    matchKey: playable.key,
                    revision: 1,
                    outcome: 'PLAYED',
                    winnerEntrantId,
                    scores: [{ game: 1, sideOne: 11, sideTwo: 4 }],
                },
            });
        }

        current = orchestrator.apply(current, 'complete', { kind: 'COMPLETE', expectedVersion: current.version });
        expect(current.state).toBe('COMPLETED');
        expect(current.completionChecksum).toBe(current.projection?.projectionChecksum);
        expect(current.audit.filter(({ action }) => action === 'REGISTER')).toHaveLength(format.count);
    });

    test.each([3, 5, 7, 9, 11, 13, 15])('round robin with %i entrants gives exactly one bye per leg', (count) => {
        const output = registry
            .get('ROUND_ROBIN', '1.0.0')
            .generate(request({ schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 4, legs: 2 }, count));
        const byes = matches(output).filter(({ automaticOutcome }) => automaticOutcome === 'BYE');
        expect(byes).toHaveLength(count * 2);
        for (const entrant of entrants(count)) {
            expect(byes.filter(({ automaticWinnerEntrantId }) => automaticWinnerEntrantId === entrant.id)).toHaveLength(
                2
            );
        }
    });

    test('walkover and double walkover are terminal, draw-free and standings-consistent', () => {
        const preset = { schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 2, legs: 1 } as const;
        const strategy = registry.get('ROUND_ROBIN', '1.0.0');
        const initial = strategy.generate(request(preset, 4));
        const firstRound = initial.stages[0]?.rounds[0]?.matches ?? [];
        const first = firstRound[0];
        const second = firstRound[1];
        if (first === undefined || second === undefined) throw new Error('Expected two first-round matches');
        const winner = first.slots[0]?.entrantId ?? null;
        const output = strategy.generate(
            request(preset, 4, [
                { matchKey: first.key, revision: 1, outcome: 'WALKOVER', winnerEntrantId: winner, scores: [] },
                { matchKey: second.key, revision: 1, outcome: 'DOUBLE_WALKOVER', winnerEntrantId: null, scores: [] },
            ])
        );
        expect(output.standings.find(({ entrantId }) => entrantId === winner)?.matchPoints).toBe(3);
        for (const id of second.slots.flatMap(({ entrantId }) => entrantId ?? [])) {
            expect(output.standings.find(({ entrantId }) => entrantId === id)?.matchPoints).toBe(0);
        }
    });

    test('initialized randomness is repeatable and does not duplicate or lose entrants', () => {
        for (let count = 2; count <= 128; count += 7) {
            const ids = entrants(count).map(({ id }) => id);
            const first = materializeTieBreakLots(ids, 'verification-seed');
            const replay = materializeTieBreakLots(ids, 'verification-seed');
            expect([...first]).toEqual([...replay]);
            expect(first.size).toBe(count);
            expect(new Set(first.values()).size).toBe(count);
        }
    });

    test.each(boundaryCases)('$code maximum plan is bounded and preserves every entrant', (format) => {
        const strategy = registry.get(format.code, '1.0.0');
        const startedAt = performance.now();
        const output = strategy.generate(request(format.preset, format.count));
        const elapsedMilliseconds = performance.now() - startedAt;
        expect(output.standings).toHaveLength(format.count);
        expect(new Set(output.standings.map(({ entrantId }) => entrantId)).size).toBe(format.count);
        for (const round of output.stages.flatMap(({ rounds }) => rounds)) {
            const direct = round.matches.flatMap((match) => match.slots.flatMap(({ entrantId }) => entrantId ?? []));
            expect(new Set(direct).size).toBe(direct.length);
        }
        expect(elapsedMilliseconds).toBeLessThan(2_000);
    });
});
