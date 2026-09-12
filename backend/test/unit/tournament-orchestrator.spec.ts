import { createHash } from 'node:crypto';

import {
    TournamentOrchestrator,
    type TournamentCommand,
    type TournamentExecutionState,
} from '../../src/tournaments/tournament-orchestrator';
import {
    TournamentTransactionalCommands,
    type TournamentTransactionPort,
} from '../../src/tournaments/tournament-transaction.port';
import { TournamentStrategyRegistry } from '../../src/tournaments/tournament-strategy.registry';
import type { StrategyMatch, StrategyResult, TournamentPreset } from '../../src/tournaments/tournament.types';

function state(preset: TournamentPreset, capacity: number): TournamentExecutionState {
    return {
        id: 'tournament-1',
        version: 0,
        projectionRevision: 0n,
        state: 'PUBLISHED',
        capacity,
        strategyVersion: '1.0.0',
        preset,
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
}

class MemoryTransactions implements TournamentTransactionPort {
    readonly isolationLevel = 'SERIALIZABLE' as const;
    private readonly receipts = new Map<string, { fingerprint: string; value: unknown }>();

    constructor(readonly states: Map<string, TournamentExecutionState>) {}

    transact<T>(
        tournamentId: string,
        operationId: string,
        requestFingerprint: string,
        operation: (locked: TournamentExecutionState) => T
    ): Promise<{ value: T; replayed: boolean }> {
        return Promise.resolve().then(() => {
            const receipt = this.receipts.get(operationId);
            if (receipt !== undefined) {
                if (receipt.fingerprint !== requestFingerprint) throw new Error('IDEMPOTENCY_KEY_REUSED');
                return { value: structuredClone(receipt.value) as T, replayed: true };
            }
            const current = this.states.get(tournamentId);
            if (current === undefined) throw new Error('TOURNAMENT_NOT_FOUND');
            const value = operation(structuredClone(current));
            this.states.set(tournamentId, structuredClone(value as TournamentExecutionState));
            this.receipts.set(operationId, { fingerprint: requestFingerprint, value: structuredClone(value) });
            return { value, replayed: false };
        });
    }
}

function fingerprint(command: TournamentCommand): string {
    return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

function result(match: StrategyMatch, revision = 1, winner = match.slots[0]?.entrantId): StrategyResult {
    const sideOneWon = winner === match.slots[0]?.entrantId;
    return {
        matchKey: match.key,
        revision,
        outcome: 'PLAYED',
        winnerEntrantId: winner ?? null,
        scores: [{ game: 1, sideOne: sideOneWon ? 11 : 4, sideTwo: sideOneWon ? 4 : 11 }],
    };
}

describe('tournament transactional orchestration', () => {
    test('registration is FIFO, replay-safe and a failed command rolls back', async () => {
        const initial = state({ schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 2, legs: 1 }, 3);
        const states = new Map([[initial.id, initial]]);
        const transactions = new MemoryTransactions(states);
        const orchestrator = new TournamentOrchestrator(new TournamentStrategyRegistry());
        const commands = new TournamentTransactionalCommands(transactions, orchestrator.apply.bind(orchestrator));
        for (let index = 0; index < 4; index += 1) {
            const command: TournamentCommand = {
                kind: 'REGISTER',
                entrantId: `entrant-${String(index + 1)}`,
                expectedVersion: index,
            };
            await commands.execute(initial.id, `register-${String(index + 1)}`, fingerprint(command), command);
        }
        expect(states.get(initial.id)?.entrants.map(({ state }) => state)).toEqual([
            'ELIGIBLE',
            'ELIGIBLE',
            'ELIGIBLE',
            'WAITLISTED',
        ]);
        const replayCommand: TournamentCommand = { kind: 'REGISTER', entrantId: 'entrant-4', expectedVersion: 3 };
        const replay = await commands.execute(initial.id, 'register-4', fingerprint(replayCommand), replayCommand);
        expect(replay.replayed).toBe(true);
        expect(states.get(initial.id)?.entrants).toHaveLength(4);

        const bad: TournamentCommand = {
            kind: 'CHECK_IN',
            entrantId: 'entrant-1',
            expectedVersion: 4,
            expectedRevision: 99,
        };
        await expect(commands.execute(initial.id, 'bad-check-in', fingerprint(bad), bad)).rejects.toThrow(
            'Entrant revision changed'
        );
        expect(states.get(initial.id)?.version).toBe(4);
        expect(transactions.isolationLevel).toBe('SERIALIZABLE');
    });

    test('seeding materializes stable unique lots and recovery converges to the same checksum', () => {
        const orchestrator = new TournamentOrchestrator(new TournamentStrategyRegistry());
        let current = state({ schemaVersion: '1.0.0', formatCode: 'ROUND_ROBIN', courtCount: 2, legs: 1 }, 4);
        for (let index = 0; index < 4; index += 1) {
            current = orchestrator.apply(current, `register-${String(index)}`, {
                kind: 'REGISTER',
                entrantId: `entrant-${String(index + 1)}`,
                expectedVersion: current.version,
            });
        }
        current = orchestrator.apply(current, 'seed', {
            kind: 'SEED',
            orderedEntrantIds: current.entrants.map(({ id }) => id),
            initializedRandomness: 'persisted-random-seed',
            expectedVersion: current.version,
        });
        const checksum = current.projection?.projectionChecksum;
        expect(new Set(current.entrants.map(({ tieBreakLot }) => tieBreakLot)).size).toBe(4);
        current = orchestrator.apply(current, 'recover', { kind: 'RECOVER', expectedVersion: current.version });
        expect(current.projection?.projectionChecksum).toBe(checksum);
    });

    test('winner-changing correction after a dependent start pauses without replacing the result', () => {
        const orchestrator = new TournamentOrchestrator(new TournamentStrategyRegistry());
        let current = state(
            { schemaVersion: '1.0.0', formatCode: 'SINGLE_ELIMINATION', courtCount: 2, bronzeMatch: false },
            4
        );
        for (let index = 0; index < 4; index += 1)
            current = orchestrator.apply(current, `r-${String(index)}`, {
                kind: 'REGISTER',
                entrantId: `entrant-${String(index + 1)}`,
                expectedVersion: current.version,
            });
        current = orchestrator.apply(current, 'seed', {
            kind: 'SEED',
            orderedEntrantIds: current.entrants.map(({ id }) => id),
            initializedRandomness: 'seed',
            expectedVersion: current.version,
        });
        current = orchestrator.apply(current, 'start', { kind: 'START', expectedVersion: current.version });
        const firstRound = current.projection?.stages[0]?.rounds[0];
        for (const match of firstRound?.matches ?? [])
            current = orchestrator.apply(current, `score-${match.key}`, {
                kind: 'SCORE',
                result: result(match),
                expectedVersion: current.version,
            });
        const final = current.projection?.stages[0]?.rounds[1]?.matches[0];
        expect(final).toBeDefined();
        current = orchestrator.apply(current, 'start-final', {
            kind: 'START_MATCH',
            matchKey: final?.key ?? '',
            expectedVersion: current.version,
        });
        const first = firstRound?.matches[0];
        const old = current.results.find(({ matchKey }) => matchKey === first?.key);
        const replacementWinner = first?.slots[1]?.entrantId;
        if (first === undefined) throw new Error('First-round match missing');
        current = orchestrator.apply(current, 'late-correction', {
            kind: 'CORRECT',
            result: result(first, 2, replacementWinner),
            expectedVersion: current.version,
        });
        expect(current.state).toBe('PAUSED');
        expect(current.closedReason).toBe('WINNER_CHANGE_AFTER_DEPENDENCY_START');
        expect(current.results.filter(({ matchKey }) => matchKey === first.key)).toEqual([old]);
    });
});
