export const BUILT_IN_FORMATS = [
    'AMERICANO',
    'ROUND_ROBIN',
    'SINGLE_ELIMINATION',
    'DOUBLE_ELIMINATION',
    'POOL_PLAY',
    'SWISS',
    'LADDER',
    'KING_OF_COURT',
] as const;

export type BuiltInFormatCode = (typeof BUILT_IN_FORMATS)[number];
export type TournamentOutcome = 'PLAYED' | 'BYE' | 'WALKOVER' | 'DOUBLE_WALKOVER';
export type SourceOutcome = 'WINNER' | 'LOSER';

export interface StrategyEntrant {
    readonly id: string;
    readonly seed: number;
    readonly tieBreakLot: bigint;
}

export interface StrategyScore {
    readonly game: number;
    readonly sideOne: number;
    readonly sideTwo: number;
}

export interface StrategyResult {
    readonly matchKey: string;
    readonly revision: number;
    readonly outcome: TournamentOutcome;
    readonly winnerEntrantId: string | null;
    readonly scores: readonly StrategyScore[];
}

export interface StrategySlot {
    readonly position: 1 | 2;
    readonly entrantId?: string;
    readonly sourceMatchKey?: string;
    readonly sourceOutcome?: SourceOutcome;
}

export interface StrategyMatch {
    readonly key: string;
    readonly stageKey: string;
    readonly roundKey: string;
    readonly sequence: number;
    readonly courtRank: number;
    readonly batch: number;
    readonly slots: readonly StrategySlot[];
    readonly automaticOutcome?: TournamentOutcome;
    readonly automaticWinnerEntrantId?: string;
}

export interface StrategyRound {
    readonly key: string;
    readonly stageKey: string;
    readonly sequence: number;
    readonly matches: readonly StrategyMatch[];
}

export interface StrategyStage {
    readonly key: string;
    readonly sequence: number;
    readonly kind: 'LEAGUE' | 'POOL' | 'WINNERS' | 'LOSERS' | 'PLAYOFF' | 'FINAL' | 'BRONZE' | 'LADDER' | 'COURT';
    readonly rounds: readonly StrategyRound[];
}

export interface StrategyStanding {
    readonly entrantId: string;
    readonly rank: number;
    readonly matchPoints: number;
    readonly wins: number;
    readonly gameDifferential: number;
    readonly pointDifferential: number;
    readonly pointsScored: number;
    readonly tieBreakLot: bigint;
    readonly detail: Readonly<Record<string, number | string>>;
}

export interface PresetBase {
    readonly schemaVersion: '1.0.0';
    readonly formatCode: BuiltInFormatCode;
    readonly courtCount: number;
}

export type TournamentPreset =
    | (PresetBase & { readonly formatCode: 'AMERICANO'; readonly rounds: number })
    | (PresetBase & { readonly formatCode: 'ROUND_ROBIN'; readonly legs: 1 | 2 })
    | (PresetBase & { readonly formatCode: 'SINGLE_ELIMINATION'; readonly bronzeMatch: boolean })
    | (PresetBase & { readonly formatCode: 'DOUBLE_ELIMINATION'; readonly grandFinalReset: true })
    | (PresetBase & {
          readonly formatCode: 'POOL_PLAY';
          readonly poolCount: number;
          readonly qualifiersPerPool: number;
          readonly wildcardCount: number;
          readonly playoffSize: number;
      })
    | (PresetBase & { readonly formatCode: 'SWISS'; readonly rounds: number })
    | (PresetBase & { readonly formatCode: 'LADDER'; readonly rounds: number; readonly challengeSpan: number })
    | (PresetBase & { readonly formatCode: 'KING_OF_COURT'; readonly rounds: number });

export interface TournamentFormatStrategyInput {
    readonly strategyVersion: '1.0.0';
    readonly preset: TournamentPreset;
    readonly entrants: readonly StrategyEntrant[];
    readonly results: readonly StrategyResult[];
    readonly projectionRevision: bigint;
}

export interface TournamentFormatStrategyOutput {
    readonly formatCode: BuiltInFormatCode;
    readonly strategyVersion: '1.0.0';
    readonly stages: readonly StrategyStage[];
    readonly standings: readonly StrategyStanding[];
    readonly requiredTerminalMatchKeys: readonly string[];
    readonly championEntrantId: string | null;
    readonly projectionChecksum: string;
}

export interface TournamentFormatStrategy {
    readonly formatCode: BuiltInFormatCode;
    readonly strategyVersion: '1.0.0';
    generate(input: TournamentFormatStrategyInput): TournamentFormatStrategyOutput;
}
