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
});
