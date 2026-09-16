import { describe, expect, it } from 'vitest';

import { initialEngine, moveAim, score, seedFrom, setAim, strike } from './engine';

describe('mini-game deterministic engine', () => {
    it('replays the same target and aggregate counters from the same seed', () => {
        const play = () => {
            let state = initialEngine(seedFrom('task-1'));
            for (let turn = 0; turn < 20; turn += 1) state = strike(setAim(state, state.target));
            return state;
        };
        expect(play()).toEqual(play());
        expect(play().counters).toMatchObject({ attempts: 20, successfulReturns: 20, targetHits: 20 });
        expect(score(play().counters)).toBe(340);
    });

    it('bounds directional input to three lanes', () => {
        const state = initialEngine(1);
        expect(moveAim(moveAim(state, -1), -1).aim).toBe('LEFT');
        expect(moveAim(moveAim(state, 1), 1).aim).toBe('RIGHT');
    });

    it('keeps score a pure function of published aggregate counters', () => {
        const counters = {
            attempts: 12,
            centerTargetHits: 2,
            leftTargetHits: 1,
            rightTargetHits: 1,
            streakBonuses: 2,
            successfulReturns: 9,
            targetHits: 4,
        };
        expect(score(counters)).toBe(130);
        expect(score({ ...counters, attempts: 180 })).toBe(130);
    });

    it('replays misses and streak resets deterministically', () => {
        const replay = () => {
            let state = initialEngine(seedFrom('verification-seed'));
            for (let turn = 0; turn < 30; turn += 1) {
                state = strike(setAim(state, turn % 2 === 0 ? 'LEFT' : 'RIGHT'), turn % 7 !== 0);
            }
            return state;
        };
        expect(replay()).toEqual(replay());
        expect(replay().counters.attempts).toBe(30);
        expect(replay().counters.targetHits).toBeLessThanOrEqual(replay().counters.successfulReturns);
    });
});
