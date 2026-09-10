import { allowsMatchTransition, chooseTeam, recommendation, validateResult } from '../../src/matches/match.domain';

describe('match domain', () => {
    it.each([
        ['DRAFT', 'CANCEL', true],
        ['PUBLISHED', 'CANCEL', true],
        ['IN_PROGRESS', 'CANCEL', false],
        ['PUBLISHED', 'START', true],
        ['DRAFT', 'START', false],
        ['IN_PROGRESS', 'PROPOSE_RESULT', true],
        ['AWAITING_CONFIRMATION', 'PROPOSE_RESULT', true],
        ['COMPLETED', 'PROPOSE_RESULT', false],
        ['AWAITING_CONFIRMATION', 'RESOLVE_RESULT', true],
        ['DISPUTED', 'RESOLVE_RESULT', false],
    ] as const)('%s + %s transition allowed=%s', (state, command, expected) => {
        expect(allowsMatchTransition(state, command)).toBe(expected);
    });

    it('chooses the less occupied team and TEAM_B on a tie', () => {
        expect(chooseTeam('ANY', { TEAM_A: 0, TEAM_B: 0 }, 2)).toBe('TEAM_B');
        expect(chooseTeam('ANY', { TEAM_A: 0, TEAM_B: 1 }, 2)).toBe('TEAM_A');
        expect(chooseTeam('TEAM_A', { TEAM_A: 2, TEAM_B: 0 }, 2)).toBeNull();
    });

    it('produces a deterministic bounded recommendation with two reason codes', () => {
        const input = {
            distanceMeters: 1000,
            radiusMeters: 5000,
            startsAt: new Date('2026-09-11T10:00:00Z'),
            startsFrom: new Date('2026-09-11T09:00:00Z'),
            startsTo: new Date('2026-09-11T11:00:00Z'),
            format: 'SINGLES' as const,
            preferredFormat: 'SINGLES' as const,
            skillMin: 2,
            skillMax: 4,
            playerSkill: 3,
        };
        expect(recommendation(input)).toEqual({ score: 93, reasons: ['TIME_MATCH', 'NEARBY'] });
        expect(recommendation(input)).toEqual(recommendation(input));
        expect(
            recommendation({
                ...input,
                distanceMeters: null,
                radiusMeters: null,
                startsFrom: null,
                startsTo: null,
                preferredFormat: null,
                playerSkill: 5,
            })
        ).toEqual({ score: 50, reasons: ['DISTANCE_UNKNOWN', 'TIME_FLEXIBLE'] });
    });

    it('accepts 11, 15 and 21-point games and rejects an unfinished series', () => {
        expect(() => {
            validateResult('SCORED', 'BEST_OF_5', 'TEAM_A', [
                { gameNumber: 1, teamAPoints: 11, teamBPoints: 9 },
                { gameNumber: 2, teamAPoints: 15, teamBPoints: 13 },
                { gameNumber: 3, teamAPoints: 21, teamBPoints: 19 },
            ]);
        }).not.toThrow();
        expect(() => {
            validateResult('SCORED', 'BEST_OF_3', 'TEAM_A', [{ gameNumber: 1, teamAPoints: 11, teamBPoints: 9 }]);
        }).toThrow();
        expect(() => {
            validateResult('PLAYED_WITHOUT_SCORE', undefined, undefined, undefined);
        }).not.toThrow();
        expect(() => {
            validateResult('PLAYED_WITHOUT_SCORE', 'BEST_OF_1', 'TEAM_A', [
                { gameNumber: 1, teamAPoints: 11, teamBPoints: 0 },
            ]);
        }).toThrow();
        expect(() => {
            validateResult('SCORED', 'BEST_OF_3', 'TEAM_A', [
                { gameNumber: 1, teamAPoints: 11, teamBPoints: 0 },
                { gameNumber: 2, teamAPoints: 11, teamBPoints: 0 },
                { gameNumber: 3, teamAPoints: 11, teamBPoints: 0 },
            ]);
        }).toThrow();
    });
});
