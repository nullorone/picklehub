import { buildIdentityProofLink } from '../../src/identity/identity-attempt.service';

describe('buildIdentityProofLink', () => {
    it('keeps proof credentials and opaque operation context in the fragment', () => {
        const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const identityId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        const link = new URL(
            buildIdentityProofLink('https://app.example.test/auth/email', 's'.repeat(43), attemptId, identityId)
        );

        expect(link.search).toBe('');
        expect(link.hash).toContain(`token=${'s'.repeat(43)}`);
        expect(link.hash).toContain(`attempt=${attemptId}`);
        expect(link.hash).toContain(`identity=${identityId}`);
    });
});
