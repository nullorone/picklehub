import { PlatformRole } from '@prisma/client';

import { AdministrationMetricsService } from '../../src/administration/administration-metrics.service';
import { AdministrationPolicy } from '../../src/administration/administration.policy';

describe('AdministrationPolicy', () => {
    const policy = new AdministrationPolicy();

    it('keeps capabilities fixed and deny-by-default', () => {
        expect(policy.capabilities(PlatformRole.SUPERADMIN)).not.toContain('SAFETY_CASE_DECIDE');
        expect(policy.capabilities(PlatformRole.MODERATOR)).toContain('SAFETY_CASE_DECIDE');
        expect(policy.capabilities(PlatformRole.EDITOR)).toEqual([
            'ADMIN_SESSION_ACCESS',
            'CONTENT_SOURCE_READ',
            'CONTENT_SOURCE_PROPOSE',
            'CONTENT_SOURCE_PAUSE',
            'CONTENT_CANDIDATE_REVIEW',
            'CONTENT_EDIT',
            'CONTENT_PREVIEW',
            'CONTENT_PUBLISH',
        ]);
        expect(policy.capabilities(PlatformRole.ADS_MANAGER)).toEqual(['ADMIN_SESSION_ACCESS']);
        expect(policy.capabilities(PlatformRole.SUPERADMIN)).toContain('CONTENT_SOURCE_GOVERN');
        expect(policy.capabilities(PlatformRole.MODERATOR)).not.toContain('CONTENT_EDIT');
        expect(() => {
            policy.assert(PlatformRole.EDITOR, 'SAFETY_CASE_ROUTE');
        }).toThrow('CAPABILITY_REQUIRED');
    });

    it('does not expose a wildcard capability', () => {
        for (const role of Object.values(PlatformRole)) {
            expect(policy.capabilities(role)).not.toContain('*');
        }
    });
});

describe('AdministrationMetricsService', () => {
    it('raises bounded operational alerts without identifiers', () => {
        const metrics = new AdministrationMetricsService();
        for (let attempt = 0; attempt < 5; attempt += 1) {
            metrics.authorizationDenied('EDITOR', 'SAFETY_CASE_ROUTE');
        }
        metrics.observeOldestQueueItem(86_400_000);
        metrics.auditFailed();

        expect(metrics.activeAlerts().map(({ name }) => name)).toEqual(
            expect.arrayContaining([
                'ADMIN_REPEATED_UNAUTHORIZED_ACCESS',
                'ADMIN_QUEUE_AGE',
                'ADMIN_AUDIT_WRITE_FAILED',
            ])
        );
        expect([...metrics.snapshot().keys()].join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/iu);
    });
});
