import { Injectable } from '@nestjs/common';

import { tournamentInvariant } from './tournament.errors';
import { materializeTieBreakLots } from './tournament-random';
import { latestResults, validateTournamentScore, type TournamentScoringProfile } from './tournament-score';
import { TournamentStrategyRegistry } from './tournament-strategy.registry';
import type {
    StrategyEntrant,
    StrategyResult,
    TournamentFormatStrategyOutput,
    TournamentPreset,
} from './tournament.types';

export type ExecutionState = 'PUBLISHED' | 'CHECK_IN' | 'SEEDED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface ExecutionEntrant extends StrategyEntrant {
    readonly revision: number;
    readonly state: 'ELIGIBLE' | 'WAITLISTED' | 'WITHDRAWN' | 'NO_SHOW';
    readonly checkedIn: boolean;
    readonly fifoSequence: bigint;
}

export interface CourtAssignmentState {
    readonly matchKey: string;
    readonly revision: number;
    readonly courtRank: number;
    readonly batch: number;
}

export interface TournamentAuditState {
    readonly operationId: string;
    readonly action: string;
    readonly fromRevision: number;
    readonly toRevision: number;
}

export interface TournamentExecutionState {
    readonly id: string;
    readonly version: number;
    readonly projectionRevision: bigint;
    readonly state: ExecutionState;
    readonly capacity: number;
    readonly strategyVersion: '1.0.0';
    readonly preset: TournamentPreset;
    readonly scoringProfile: TournamentScoringProfile;
    readonly entrants: readonly ExecutionEntrant[];
    readonly results: readonly StrategyResult[];
    readonly startedMatchKeys: readonly string[];
    readonly courtAssignments: readonly CourtAssignmentState[];
    readonly projection: TournamentFormatStrategyOutput | null;
    readonly completionChecksum: string | null;
    readonly closedReason: string | null;
    readonly audit: readonly TournamentAuditState[];
}

export type TournamentCommand =
    | { readonly kind: 'REGISTER'; readonly entrantId: string; readonly expectedVersion: number }
    | {
          readonly kind: 'CHECK_IN';
          readonly entrantId: string;
          readonly expectedVersion: number;
          readonly expectedRevision: number;
      }
    | {
          readonly kind: 'WITHDRAW';
          readonly entrantId: string;
          readonly expectedVersion: number;
          readonly expectedRevision: number;
      }
    | {
          readonly kind: 'SEED';
          readonly orderedEntrantIds: readonly string[];
          readonly initializedRandomness: string;
          readonly expectedVersion: number;
      }
    | { readonly kind: 'START'; readonly expectedVersion: number }
    | { readonly kind: 'START_ROUND'; readonly roundKey: string; readonly expectedVersion: number }
    | { readonly kind: 'COMPLETE_ROUND'; readonly roundKey: string; readonly expectedVersion: number }
    | {
          readonly kind: 'ASSIGN_COURT';
          readonly matchKey: string;
          readonly courtRank: number;
          readonly batch: number;
          readonly expectedVersion: number;
          readonly expectedRevision: number;
      }
    | { readonly kind: 'START_MATCH'; readonly matchKey: string; readonly expectedVersion: number }
    | { readonly kind: 'SCORE'; readonly result: StrategyResult; readonly expectedVersion: number }
    | { readonly kind: 'CORRECT'; readonly result: StrategyResult; readonly expectedVersion: number }
    | { readonly kind: 'RECOVER'; readonly expectedVersion: number }
    | { readonly kind: 'COMPLETE'; readonly expectedVersion: number }
    | { readonly kind: 'PAUSE' | 'RESUME' | 'CANCEL'; readonly reasonCode: string; readonly expectedVersion: number };

@Injectable()
export class TournamentOrchestrator {
    constructor(private readonly strategies: TournamentStrategyRegistry) {}

    apply(
        current: TournamentExecutionState,
        operationId: string,
        command: TournamentCommand
    ): TournamentExecutionState {
        tournamentInvariant(
            current.version === command.expectedVersion,
            'VERSION_CONFLICT',
            'Tournament version changed'
        );
        if (current.audit.some((item) => item.operationId === operationId)) return current;
        const next = this.reduce(current, command);
        return {
            ...next,
            audit: [
                ...next.audit,
                {
                    operationId,
                    action: command.kind,
                    fromRevision: current.version,
                    toRevision: next.version,
                },
            ],
        };
    }

    private reduce(state: TournamentExecutionState, command: TournamentCommand): TournamentExecutionState {
        switch (command.kind) {
            case 'REGISTER':
                return this.register(state, command.entrantId);
            case 'CHECK_IN':
                return this.entrantTransition(state, command.entrantId, command.expectedRevision, 'CHECK_IN');
            case 'WITHDRAW':
                return this.entrantTransition(state, command.entrantId, command.expectedRevision, 'WITHDRAW');
            case 'SEED':
                return this.seed(state, command.orderedEntrantIds, command.initializedRandomness);
            case 'START':
                tournamentInvariant(state.state === 'SEEDED', 'TRANSITION_NOT_ALLOWED', 'Tournament is not seeded');
                return this.bump(state, { state: 'IN_PROGRESS' });
            case 'START_ROUND':
                return this.startRound(state, command.roundKey);
            case 'COMPLETE_ROUND':
                return this.completeRound(state, command.roundKey);
            case 'ASSIGN_COURT':
                return this.assignCourt(state, command);
            case 'START_MATCH':
                return this.startMatch(state, command.matchKey);
            case 'SCORE':
                return this.recordResult(state, command.result, false);
            case 'CORRECT':
                return this.recordResult(state, command.result, true);
            case 'RECOVER':
                return this.bump(this.rebuild(state, true));
            case 'COMPLETE':
                return this.complete(state);
            case 'PAUSE':
                tournamentInvariant(
                    state.state === 'IN_PROGRESS',
                    'TRANSITION_NOT_ALLOWED',
                    'Only an active tournament can pause'
                );
                return this.bump(state, { state: 'PAUSED', closedReason: command.reasonCode });
            case 'RESUME': {
                tournamentInvariant(state.state === 'PAUSED', 'TRANSITION_NOT_ALLOWED', 'Tournament is not paused');
                const rebuilt = this.rebuild(state, true);
                return this.bump(rebuilt, { state: 'IN_PROGRESS', closedReason: null });
            }
            case 'CANCEL':
                tournamentInvariant(
                    state.state !== 'COMPLETED' && state.state !== 'CANCELLED',
                    'TRANSITION_NOT_ALLOWED',
                    'Tournament is terminal'
                );
                return this.bump(state, { state: 'CANCELLED', closedReason: command.reasonCode });
        }
    }

    private register(state: TournamentExecutionState, entrantId: string): TournamentExecutionState {
        tournamentInvariant(
            state.state === 'PUBLISHED' || state.state === 'CHECK_IN',
            'TRANSITION_NOT_ALLOWED',
            'Registration is closed'
        );
        tournamentInvariant(
            !state.entrants.some(({ id, state: entrantState }) => id === entrantId && entrantState !== 'WITHDRAWN'),
            'INVALID_ENTRANTS',
            'Entrant already registered'
        );
        const active = state.entrants.filter(({ state: entrantState }) => entrantState === 'ELIGIBLE').length;
        const fifoSequence =
            state.entrants.reduce(
                (maximum, entrant) => (entrant.fifoSequence > maximum ? entrant.fifoSequence : maximum),
                0n
            ) + 1n;
        return this.bump(state, {
            entrants: [
                ...state.entrants,
                {
                    id: entrantId,
                    seed: 0,
                    tieBreakLot: 0n,
                    revision: 0,
                    state: active < state.capacity ? 'ELIGIBLE' : 'WAITLISTED',
                    checkedIn: false,
                    fifoSequence,
                },
            ],
        });
    }

    private entrantTransition(
        state: TournamentExecutionState,
        entrantId: string,
        expectedRevision: number,
        action: 'CHECK_IN' | 'WITHDRAW'
    ): TournamentExecutionState {
        tournamentInvariant(
            state.state === 'PUBLISHED' || state.state === 'CHECK_IN',
            'TRANSITION_NOT_ALLOWED',
            'Roster is frozen'
        );
        const entrant = state.entrants.find(({ id }) => id === entrantId);
        tournamentInvariant(entrant !== undefined, 'INVALID_ENTRANTS', 'Entrant not found');
        tournamentInvariant(
            entrant.revision === expectedRevision,
            'RESOURCE_REVISION_CONFLICT',
            'Entrant revision changed'
        );
        const updated = state.entrants.map(
            (candidate): ExecutionEntrant =>
                candidate.id === entrantId
                    ? {
                          ...candidate,
                          revision: candidate.revision + 1,
                          checkedIn: action === 'CHECK_IN',
                          state: action === 'WITHDRAW' ? 'WITHDRAWN' : candidate.state,
                      }
                    : candidate
        );
        if (action === 'WITHDRAW' && entrant.state === 'ELIGIBLE') {
            const promoted = updated
                .filter(({ state: entrantState }) => entrantState === 'WAITLISTED')
                .sort((left, right) => (left.fifoSequence < right.fifoSequence ? -1 : 1))[0];
            if (promoted !== undefined) {
                const index = updated.findIndex(({ id }) => id === promoted.id);
                updated[index] = { ...promoted, state: 'ELIGIBLE', revision: promoted.revision + 1 };
            }
        }
        return this.bump(state, { entrants: updated });
    }

    private seed(
        state: TournamentExecutionState,
        orderedIds: readonly string[],
        randomness: string
    ): TournamentExecutionState {
        tournamentInvariant(
            state.state === 'PUBLISHED' || state.state === 'CHECK_IN',
            'TRANSITION_NOT_ALLOWED',
            'Cannot seed now'
        );
        const eligible = state.entrants.filter(({ state: entrantState }) => entrantState === 'ELIGIBLE');
        tournamentInvariant(
            orderedIds.length === eligible.length && new Set(orderedIds).size === eligible.length,
            'INVALID_ENTRANTS',
            'Seed list must contain every eligible entrant'
        );
        tournamentInvariant(
            orderedIds.every((id) => eligible.some((entrant) => entrant.id === id)),
            'INVALID_ENTRANTS',
            'Unknown seed entrant'
        );
        const lots = materializeTieBreakLots(orderedIds, randomness);
        const entrants = state.entrants.map((entrant): ExecutionEntrant => {
            const index = orderedIds.indexOf(entrant.id);
            return index < 0
                ? entrant
                : {
                      ...entrant,
                      seed: index + 1,
                      tieBreakLot: lots.get(entrant.id) ?? 0n,
                      revision: entrant.revision + 1,
                  };
        });
        return this.rebuild(this.bump(state, { entrants, state: 'SEEDED' }), false);
    }

    private startRound(state: TournamentExecutionState, roundKey: string): TournamentExecutionState {
        tournamentInvariant(state.state === 'IN_PROGRESS', 'TRANSITION_NOT_ALLOWED', 'Tournament is not active');
        const round = state.projection?.stages.flatMap(({ rounds }) => rounds).find(({ key }) => key === roundKey);
        tournamentInvariant(round !== undefined, 'INVALID_RESULT', 'Round not found');
        for (const match of round.matches) {
            for (const candidate of match.slots) {
                if (candidate.sourceMatchKey !== undefined)
                    tournamentInvariant(
                        this.terminal(state, candidate.sourceMatchKey),
                        'TRANSITION_NOT_ALLOWED',
                        'Round dependency is not terminal'
                    );
            }
        }
        return this.bump(state);
    }

    private completeRound(state: TournamentExecutionState, roundKey: string): TournamentExecutionState {
        const round = state.projection?.stages.flatMap(({ rounds }) => rounds).find(({ key }) => key === roundKey);
        tournamentInvariant(round !== undefined, 'INVALID_RESULT', 'Round not found');
        tournamentInvariant(
            round.matches.every(
                ({ key, automaticOutcome }) => automaticOutcome !== undefined || this.terminal(state, key)
            ),
            'TRANSITION_NOT_ALLOWED',
            'Round is not terminal'
        );
        return this.bump(this.rebuild(state, false));
    }

    private assignCourt(
        state: TournamentExecutionState,
        command: Extract<TournamentCommand, { kind: 'ASSIGN_COURT' }>
    ): TournamentExecutionState {
        const previous = state.courtAssignments.find(({ matchKey }) => matchKey === command.matchKey);
        tournamentInvariant(
            (previous?.revision ?? 0) === command.expectedRevision,
            'RESOURCE_REVISION_CONFLICT',
            'Court assignment revision changed'
        );
        tournamentInvariant(
            !state.startedMatchKeys.includes(command.matchKey),
            'TRANSITION_NOT_ALLOWED',
            'Started match cannot move courts'
        );
        const assignments = state.courtAssignments.filter(({ matchKey }) => matchKey !== command.matchKey);
        assignments.push({
            matchKey: command.matchKey,
            revision: (previous?.revision ?? 0) + 1,
            courtRank: command.courtRank,
            batch: command.batch,
        });
        return this.bump(state, { courtAssignments: assignments });
    }

    private startMatch(state: TournamentExecutionState, matchKey: string): TournamentExecutionState {
        tournamentInvariant(state.state === 'IN_PROGRESS', 'TRANSITION_NOT_ALLOWED', 'Tournament is not active');
        tournamentInvariant(
            state.projection?.stages.some(({ rounds }) =>
                rounds.some(({ matches }) => matches.some(({ key }) => key === matchKey))
            ) === true,
            'INVALID_RESULT',
            'Match not found'
        );
        return this.bump(state, { startedMatchKeys: [...new Set([...state.startedMatchKeys, matchKey])] });
    }

    private recordResult(
        state: TournamentExecutionState,
        result: StrategyResult,
        correction: boolean
    ): TournamentExecutionState {
        tournamentInvariant(
            state.state === 'IN_PROGRESS' || state.state === 'PAUSED',
            'TRANSITION_NOT_ALLOWED',
            'Results are closed'
        );
        const match = state.projection?.stages
            .flatMap(({ rounds }) => rounds.flatMap(({ matches }) => matches))
            .find(({ key }) => key === result.matchKey);
        tournamentInvariant(match !== undefined, 'INVALID_RESULT', 'Match not found');
        const current = latestResults(state.results).get(result.matchKey);
        tournamentInvariant(
            result.revision === (current?.revision ?? 0) + 1,
            'RESOURCE_REVISION_CONFLICT',
            'Result revision must be consecutive'
        );
        if (!correction)
            tournamentInvariant(current === undefined, 'INVALID_RESULT', 'Use correction for a completed match');
        if (result.outcome === 'PLAYED') {
            const ids = match.slots.flatMap((candidate) => this.resolveSlot(state, candidate) ?? []);
            tournamentInvariant(
                ids.length >= 2 && result.winnerEntrantId !== null,
                'INVALID_RESULT',
                'Played match requires two sides and winner'
            );
            validateTournamentScore(
                state.scoringProfile,
                result.scores,
                result.winnerEntrantId,
                ids[0] ?? '',
                ids.at(-1) ?? ''
            );
        }
        if (
            correction &&
            current?.winnerEntrantId !== result.winnerEntrantId &&
            this.startedDependency(state, result.matchKey)
        ) {
            return this.bump(state, { state: 'PAUSED', closedReason: 'WINNER_CHANGE_AFTER_DEPENDENCY_START' });
        }
        return this.rebuild(this.bump(state, { results: [...state.results, result] }), false);
    }

    private rebuild(state: TournamentExecutionState, verifyChecksum: boolean): TournamentExecutionState {
        const strategy = this.strategies.get(state.preset.formatCode, state.strategyVersion);
        const projection = strategy.generate({
            strategyVersion: state.strategyVersion,
            preset: state.preset,
            entrants: state.entrants.filter(({ state: entrantState }) => entrantState === 'ELIGIBLE'),
            results: state.results,
            projectionRevision: state.projectionRevision + 1n,
        });
        if (verifyChecksum && state.projection !== null)
            tournamentInvariant(
                projection.projectionChecksum === state.projection.projectionChecksum,
                'PROJECTION_MISMATCH',
                'Recovered projection checksum differs'
            );
        return {
            ...state,
            projection,
            projectionRevision: state.projectionRevision + 1n,
        };
    }

    private complete(state: TournamentExecutionState): TournamentExecutionState {
        tournamentInvariant(state.state === 'IN_PROGRESS', 'TRANSITION_NOT_ALLOWED', 'Tournament is not active');
        const rebuilt = this.rebuild(state, false);
        const projection = rebuilt.projection;
        const champion = projection?.championEntrantId;
        tournamentInvariant(
            projection !== null && champion !== null && champion !== undefined,
            'TRANSITION_NOT_ALLOWED',
            'Champion is unresolved'
        );
        tournamentInvariant(
            projection.requiredTerminalMatchKeys.every((key) => this.terminal(rebuilt, key)),
            'TRANSITION_NOT_ALLOWED',
            'Required matches are not terminal'
        );
        tournamentInvariant(
            new Set(projection.standings.map(({ rank }) => rank)).size === projection.standings.length,
            'PROJECTION_MISMATCH',
            'Standing ranks are not unique'
        );
        tournamentInvariant(
            rebuilt.completionChecksum === null,
            'TRANSITION_NOT_ALLOWED',
            'Completion marker already exists'
        );
        return this.bump(rebuilt, { state: 'COMPLETED', completionChecksum: projection.projectionChecksum });
    }

    private terminal(state: TournamentExecutionState, matchKey: string): boolean {
        if (latestResults(state.results).has(matchKey)) return true;
        return (
            state.projection?.stages
                .flatMap(({ rounds }) => rounds.flatMap(({ matches }) => matches))
                .some(({ key, automaticOutcome }) => key === matchKey && automaticOutcome !== undefined) === true
        );
    }

    private startedDependency(state: TournamentExecutionState, sourceKey: string): boolean {
        const dependent = new Set([sourceKey]);
        let changed = true;
        const matches =
            state.projection?.stages.flatMap(({ rounds }) => rounds.flatMap(({ matches }) => matches)) ?? [];
        while (changed) {
            changed = false;
            for (const match of matches)
                if (
                    !dependent.has(match.key) &&
                    match.slots.some(
                        ({ sourceMatchKey }) => sourceMatchKey !== undefined && dependent.has(sourceMatchKey)
                    )
                ) {
                    dependent.add(match.key);
                    changed = true;
                }
        }
        return state.startedMatchKeys.some((key) => key !== sourceKey && dependent.has(key));
    }

    private resolveSlot(
        state: TournamentExecutionState,
        slot: {
            readonly entrantId?: string;
            readonly sourceMatchKey?: string;
            readonly sourceOutcome?: 'WINNER' | 'LOSER';
        }
    ): string | undefined {
        if (slot.entrantId !== undefined) return slot.entrantId;
        if (slot.sourceMatchKey === undefined) return undefined;
        const result = latestResults(state.results).get(slot.sourceMatchKey);
        if (result === undefined) return undefined;
        if (slot.sourceOutcome !== 'LOSER') return result.winnerEntrantId ?? undefined;
        const source = state.projection?.stages
            .flatMap(({ rounds }) => rounds.flatMap(({ matches }) => matches))
            .find(({ key }) => key === slot.sourceMatchKey);
        const entrants = source?.slots.flatMap((candidate) => this.resolveSlot(state, candidate) ?? []) ?? [];
        return entrants.find((id) => id !== result.winnerEntrantId);
    }

    private bump(
        state: TournamentExecutionState,
        patch: Partial<TournamentExecutionState> = {},
        increment = true
    ): TournamentExecutionState {
        return { ...state, ...patch, version: increment ? state.version + 1 : state.version };
    }
}
