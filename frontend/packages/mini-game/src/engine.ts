export type GameDirection = 'LEFT' | 'CENTER' | 'RIGHT';
export type GameMode = 'STANDARD' | 'CALM';

export interface GameCounters {
    readonly attempts: number;
    readonly centerTargetHits: number;
    readonly leftTargetHits: number;
    readonly rightTargetHits: number;
    readonly streakBonuses: number;
    readonly successfulReturns: number;
    readonly targetHits: number;
}

export interface EngineState {
    readonly aim: GameDirection;
    readonly bestStreak: number;
    readonly consecutiveMisses: number;
    readonly counters: GameCounters;
    readonly seed: number;
    readonly streak: number;
    readonly target: GameDirection;
}

const directions: readonly GameDirection[] = ['LEFT', 'CENTER', 'RIGHT'];

export function seedFrom(value: string): number {
    let result = 2_166_136_261;
    for (const character of value) {
        result ^= character.codePointAt(0) ?? 0;
        result = Math.imul(result, 16_777_619);
    }
    return result >>> 0;
}

function nextSeed(seed: number): number {
    let value = seed || 1;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
}

function nextTarget(seed: number): GameDirection {
    return directions[seed % directions.length] ?? 'CENTER';
}

export function initialEngine(seed: number): EngineState {
    const advanced = nextSeed(seed);
    return {
        aim: 'CENTER',
        bestStreak: 0,
        consecutiveMisses: 0,
        counters: {
            attempts: 0,
            centerTargetHits: 0,
            leftTargetHits: 0,
            rightTargetHits: 0,
            streakBonuses: 0,
            successfulReturns: 0,
            targetHits: 0,
        },
        seed: advanced,
        streak: 0,
        target: nextTarget(advanced),
    };
}

export function moveAim(state: EngineState, delta: -1 | 1): EngineState {
    const index = Math.max(0, Math.min(2, directions.indexOf(state.aim) + delta));
    return { ...state, aim: directions[index] ?? 'CENTER' };
}

export function setAim(state: EngineState, aim: GameDirection): EngineState {
    return { ...state, aim };
}

export function strike(state: EngineState, timingValid = true): EngineState {
    const advanced = nextSeed(state.seed);
    const targetHit = state.aim === state.target;
    const successful = timingValid && (targetHit || advanced % 4 !== 0);
    const streak = successful ? state.streak + 1 : 0;
    const streakBonus = successful && streak % 5 === 0;
    const directionKey: 'leftTargetHits' | 'centerTargetHits' | 'rightTargetHits' =
        state.target === 'LEFT' ? 'leftTargetHits' : state.target === 'RIGHT' ? 'rightTargetHits' : 'centerTargetHits';
    return {
        ...state,
        bestStreak: Math.max(state.bestStreak, streak),
        consecutiveMisses: successful ? 0 : state.consecutiveMisses + 1,
        counters: {
            ...state.counters,
            attempts: state.counters.attempts + 1,
            successfulReturns: state.counters.successfulReturns + Number(successful),
            targetHits: state.counters.targetHits + Number(targetHit && successful),
            streakBonuses: state.counters.streakBonuses + Number(streakBonus),
            [directionKey]: state.counters[directionKey] + Number(targetHit && successful),
        },
        seed: advanced,
        streak,
        target: nextTarget(advanced),
    };
}

export function score(counters: GameCounters): number {
    return counters.successfulReturns * 10 + counters.targetHits * 5 + counters.streakBonuses * 10;
}
