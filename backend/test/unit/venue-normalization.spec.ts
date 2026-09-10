import {
    coordinateHasAllowedPrecision,
    normalizeDedupeKey,
    normalizeVenueAddress,
    normalizeVenueText,
} from '../../src/venues/venue-normalization';

describe('venue normalization', () => {
    it('normalizes Unicode, whitespace and address separators deterministically', () => {
        expect(normalizeVenueText('  Корт\u00a0 № 1  ')).toBe('Корт No 1');
        expect(normalizeVenueAddress(' Москва ,  ул. Тестовая, 1.; ')).toBe('Москва, ул. Тестовая, 1');
        expect(normalizeDedupeKey('КОРТ', 'Москва,  дом 1')).toBe(normalizeDedupeKey('корт', 'Москва , дом 1'));
    });

    it('rejects coordinate precision beyond the storage contract', () => {
        expect(coordinateHasAllowedPrecision(37.6173)).toBe(true);
        expect(coordinateHasAllowedPrecision(37.6173001)).toBe(false);
    });
});
