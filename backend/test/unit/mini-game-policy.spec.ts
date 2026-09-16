import 'reflect-metadata';

import { MiniGameMode, type SubmitGameResultDto } from '../../src/mini-game/mini-game.dto';
import { validateGameResult } from '../../src/mini-game/mini-game-policy';

function result(overrides: Partial<SubmitGameResultDto> = {}): SubmitGameResultDto {
    return {
        challengeProof: `mgc1_${'a'.repeat(43)}`,
        nonce: 'a'.repeat(22),
        configurationVersion: '1.0.0',
        mode: MiniGameMode.STANDARD,
        activeDurationMilliseconds: 90_000,
        pausedDurationMilliseconds: 0,
        counters: {
            attempts: 20,
            successfulReturns: 15,
            targetHits: 6,
            streakBonuses: 2,
            leftTargetHits: 2,
            centerTargetHits: 2,
            rightTargetHits: 2,
        },
        ...overrides,
    };
}

function counters(overrides: Partial<SubmitGameResultDto['counters']> = {}): SubmitGameResultDto['counters'] {
    return {
        attempts: 20,
        successfulReturns: 15,
        targetHits: 6,
        streakBonuses: 2,
        leftTargetHits: 2,
        centerTargetHits: 2,
        rightTargetHits: 2,
        ...overrides,
    };
}

describe('mini-game bounded result policy', () => {
    it('accepts the fixed standard duration and bounded aggregate counters', () => {
        expect(validateGameResult(result(), { mode: MiniGameMode.STANDARD, configurationVersion: '1.0.0' })).toBeNull();
    });

    it('rejects impossible counter arithmetic without deriving a client score', () => {
        expect(
            validateGameResult(result({ counters: counters({ targetHits: 7 }) }), {
                mode: MiniGameMode.STANDARD,
                configurationVersion: '1.0.0',
            })
        ).toBe('COUNTERS_INVALID');
    });

    it('requires exactly twenty attempts in calm mode without a reaction-time minimum', () => {
        expect(
            validateGameResult(
                result({
                    mode: MiniGameMode.CALM,
                    activeDurationMilliseconds: 1,
                    counters: counters({ attempts: 20 }),
                }),
                { mode: MiniGameMode.CALM, configurationVersion: '1.0.0' }
            )
        ).toBeNull();
        expect(
            validateGameResult(result({ mode: MiniGameMode.CALM, counters: counters({ attempts: 19 }) }), {
                mode: MiniGameMode.CALM,
                configurationVersion: '1.0.0',
            })
        ).toBe('DURATION_INVALID');
    });

    it('rejects a mode or immutable configuration mismatch', () => {
        expect(validateGameResult(result(), { mode: MiniGameMode.CALM, configurationVersion: '1.0.0' })).toBe(
            'MODE_MISMATCH'
        );
        expect(validateGameResult(result(), { mode: MiniGameMode.STANDARD, configurationVersion: '2.0.0' })).toBe(
            'CONFIGURATION_MISMATCH'
        );
    });
});
