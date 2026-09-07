import { uuidV7 } from '../../src/common/identifiers/uuid-v7';

describe('uuidV7', () => {
    it('encodes the timestamp and RFC 9562 version and variant bits', () => {
        const first = uuidV7(1_788_514_400_000);
        const later = uuidV7(1_788_514_400_001);

        expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
        expect(first.slice(0, 13) < later.slice(0, 13)).toBe(true);
    });
});
