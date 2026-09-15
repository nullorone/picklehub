import { canonicalContentRequest } from '../../src/content/content-idempotency.service';

describe('content idempotency fingerprint', () => {
    it('is independent of JSON object key order while preserving array order', () => {
        expect(canonicalContentRequest({ revision: { title: 'x', tags: ['a', 'b'] }, expectedVersion: 2 })).toBe(
            canonicalContentRequest({ expectedVersion: 2, revision: { tags: ['a', 'b'], title: 'x' } })
        );
        expect(canonicalContentRequest({ tags: ['a', 'b'] })).not.toBe(canonicalContentRequest({ tags: ['b', 'a'] }));
    });
});
