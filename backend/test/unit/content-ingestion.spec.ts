import { contentSourceBackoffDelay } from '../../src/content/content-ingestion.service';

describe('content ingestion retry policy', () => {
    it('backs off exponentially and caps an unavailable source at 24 hours', () => {
        expect(contentSourceBackoffDelay(60_000, 1)).toBe(120_000);
        expect(contentSourceBackoffDelay(60_000, 4)).toBe(960_000);
        expect(contentSourceBackoffDelay(60 * 60_000, 8)).toBe(24 * 60 * 60_000);
        expect(contentSourceBackoffDelay(60_000, 100)).toBe(15_360_000);
    });
});
