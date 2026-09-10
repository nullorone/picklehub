import { describe, expect, it } from 'vitest';

import {
    localDateTimeToUtc,
    onboardingFormSchema,
    parseRuntimeConfig,
    readSafeMagicFragment,
    validateMatchSeries,
} from './index';

describe('parseRuntimeConfig', () => {
    it('accepts a root-relative API URL', () => {
        expect(parseRuntimeConfig({ apiBaseUrl: '/v1', environment: 'production' })).toEqual({
            apiBaseUrl: '/v1',
            environment: 'production',
        });
    });

    it('rejects unknown configuration keys', () => {
        expect(() => parseRuntimeConfig({ apiBaseUrl: '/v1', environment: 'production', token: 'secret' })).toThrow();
    });

    it('accepts only an HTTPS MapLibre style and attribution link', () => {
        expect(
            parseRuntimeConfig({
                apiBaseUrl: '/v1',
                environment: 'production',
                map: {
                    attributionText: 'Approved tile provider',
                    attributionUrl: 'https://tiles.example.test/terms',
                    styleUrl: 'https://tiles.example.test/style.json',
                },
            }).map
        ).toEqual({
            attributionText: 'Approved tile provider',
            attributionUrl: 'https://tiles.example.test/terms',
            styleUrl: 'https://tiles.example.test/style.json',
        });
        expect(() =>
            parseRuntimeConfig({
                apiBaseUrl: '/v1',
                environment: 'production',
                map: { attributionText: 'Tiles', attributionUrl: 'http://tiles.test', styleUrl: 'http://tiles.test' },
            })
        ).toThrow();
    });

    it('allows only internal post-login targets and validates the secret shape', () => {
        expect(readSafeMagicFragment(`#token=${'a'.repeat(43)}&next=https://evil.example`)).toEqual({
            attemptId: undefined,
            identityId: undefined,
            target: '/onboarding',
            token: 'a'.repeat(43),
        });
        expect(readSafeMagicFragment('#token=short&next=/account')).toEqual({
            attemptId: undefined,
            identityId: undefined,
            target: '/account',
            token: undefined,
        });
    });

    it('validates all required onboarding fields and the half-point skill scale', () => {
        expect(
            onboardingFormSchema.safeParse({
                displayName: 'Игрок',
                duprProfileUrl: '',
                gameFormats: ['SINGLES'],
                localityId: crypto.randomUUID(),
                skillSelfAssessment: 2.5,
                timeZone: 'Europe/Moscow',
            }).success
        ).toBe(true);
        expect(
            onboardingFormSchema.safeParse({
                displayName: 'И',
                duprProfileUrl: '',
                gameFormats: [],
                localityId: '',
                skillSelfAssessment: 2.3,
                timeZone: '',
            }).success
        ).toBe(false);
    });

    it('converts a venue-local match time to UTC and validates a complete series', () => {
        expect(localDateTimeToUtc('2026-09-12T18:00', 'Europe/Moscow')).toBe('2026-09-12T15:00:00.000Z');
        expect(
            validateMatchSeries('BEST_OF_3', [
                { teamAPoints: 11, teamBPoints: 7 },
                { teamAPoints: 8, teamBPoints: 11 },
                { teamAPoints: 13, teamBPoints: 11 },
            ])
        ).toBe('TEAM_A');
        expect(() => validateMatchSeries('BEST_OF_3', [{ teamAPoints: 11, teamBPoints: 7 }])).toThrow(
            /Добавьте партии/
        );
    });
});
