import type { TournamentCommand, TournamentExecutionState } from './tournament-orchestrator';

export interface TournamentTransactionPort {
    readonly isolationLevel: 'SERIALIZABLE';
    transact<T>(
        tournamentId: string,
        operationId: string,
        requestFingerprint: string,
        operation: (locked: TournamentExecutionState) => T
    ): Promise<{ readonly value: T; readonly replayed: boolean }>;
}

export class TournamentTransactionalCommands {
    constructor(
        private readonly transactions: TournamentTransactionPort,
        private readonly applyCommand: (
            state: TournamentExecutionState,
            operationId: string,
            command: TournamentCommand
        ) => TournamentExecutionState
    ) {}

    execute(
        tournamentId: string,
        operationId: string,
        requestFingerprint: string,
        command: TournamentCommand
    ): Promise<{ readonly value: TournamentExecutionState; readonly replayed: boolean }> {
        return this.transactions.transact(tournamentId, operationId, requestFingerprint, (locked) =>
            this.applyCommand(locked, operationId, command)
        );
    }
}
