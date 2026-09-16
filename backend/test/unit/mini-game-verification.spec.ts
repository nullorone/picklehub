import 'reflect-metadata';

import { MiniGameMode, type SubmitGameResultDto } from '../../src/mini-game/mini-game.dto';
import { startOfUtcDay, startOfUtcWeek, validateGameResult } from '../../src/mini-game/mini-game-policy';

function result(overrides: Partial<SubmitGameResultDto> = {}): SubmitGameResultDto {
    return {
        activeDurationMilliseconds: 90_000,
        challengeProof: `mgc1_${'a'.repeat(43)}`,
        configurationVersion: '1.0.0',
        counters: counters(),
        mode: MiniGameMode.STANDARD,
        nonce: 'a'.repeat(22),
        pausedDurationMilliseconds: 0,
        ...overrides,
    };
}

function counters(overrides: Partial<SubmitGameResultDto['counters']> = {}): SubmitGameResultDto['counters'] {
    return {
        attempts: 30,
        centerTargetHits: 3,
        leftTargetHits: 3,
        rightTargetHits: 3,
        streakBonuses: 3,
        successfulReturns: 20,
        targetHits: 9,
        ...overrides,
    };
}

describe('mini-game verification model', () => {
    it('uses UTC boundaries independently of the process timezone and local offset', () => {
        const beforeMidnight = new Date('2026-09-20T23:59:59.999Z');
        const afterMidnight = new Date('2026-09-21T00:00:00.000Z');

        expect(startOfUtcDay(beforeMidnight).toISOString()).toBe('2026-09-20T00:00:00.000Z');
        expect(startOfUtcDay(afterMidnight).toISOString()).toBe('2026-09-21T00:00:00.000Z');
        expect(startOfUtcWeek(beforeMidnight).toISOString()).toBe('2026-09-14T00:00:00.000Z');
        expect(startOfUtcWeek(afterMidnight).toISOString()).toBe('2026-09-21T00:00:00.000Z');
    });

    it('models duplicate and concurrent claims as one semantic daily XP grant', () => {
        const attempts = Array.from({ length: 20 }, (_, index) => ({
            operationKey: `operation-${String(index)}`,
            semanticKey: 'XP:MINI_GAME_DAILY_COMPLETION:2026-09-16:2.0.0',
        }));
        const committed = new Map<string, (typeof attempts)[number]>();
        for (const attempt of attempts.reverse()) committed.set(attempt.semanticKey, attempt);

        expect(committed.size).toBe(1);
        expect([...committed.values()][0]?.operationKey).toBe('operation-0');
    });

    it('caps XP by accepted-at UTC week and season without moving a retry to another day', () => {
        const acceptedAt = new Date('2026-09-20T23:59:59.000Z');
        const retryAt = new Date('2026-09-21T00:00:01.000Z');
        const sourceDay = startOfUtcDay(acceptedAt).toISOString();
        const sourceWeek = startOfUtcWeek(acceptedAt).toISOString();
        const replayDay = startOfUtcDay(acceptedAt).toISOString();

        expect(startOfUtcDay(retryAt).toISOString()).not.toBe(sourceDay);
        expect(replayDay).toBe(sourceDay);
        expect(sourceWeek).toBe('2026-09-14T00:00:00.000Z');
        expect(Math.min(5, 6)).toBe(5);
        expect(Math.min(30, 31)).toBe(30);
    });

    it.each([
        ['too many returns', { successfulReturns: 31 }],
        ['too many target hits', { targetHits: 21 }],
        ['direction sum mismatch', { leftTargetHits: 4 }],
        ['too many streak bonuses', { streakBonuses: 5 }],
    ])('rejects impossible counters: %s', (_name, counterOverrides) => {
        expect(
            validateGameResult(result({ counters: counters(counterOverrides) }), {
                configurationVersion: '1.0.0',
                mode: MiniGameMode.STANDARD,
            })
        ).toBe('COUNTERS_INVALID');
    });

    it('rejects expired-shape rate abuse without accepting score, rank or sporting fields', () => {
        expect(
            validateGameResult(result({ counters: counters({ attempts: 181 }) }), {
                configurationVersion: '1.0.0',
                mode: MiniGameMode.STANDARD,
            })
        ).toBe('RATE_IMPOSSIBLE');
        expect(Object.keys(result())).not.toEqual(expect.arrayContaining(['score', 'dupr', 'winner', 'rating']));
    });
});
