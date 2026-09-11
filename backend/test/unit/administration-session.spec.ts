import { PlatformRole } from '@prisma/client';

import { AdministrationMetricsService } from '../../src/administration/administration-metrics.service';
import { AdministrationPolicy } from '../../src/administration/administration.policy';
import { AdministrationSessionService } from '../../src/administration/administration-session.service';
import type { PrismaService } from '../../src/common/database/prisma.service';
import type { Clock } from '../../src/identity/clock';
import type { IdentityCryptoService } from '../../src/identity/identity-crypto.service';

describe('AdministrationSessionService', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    const token = 'admin_session_token_1234567890';
    const hash = 'a'.repeat(64);
    const baseSession = {
        id: '01993d0d-b000-7000-8000-000000000001',
        staffUserId: '01993d0d-b000-7000-8000-000000000002',
        roleGrantId: '01993d0d-b000-7000-8000-000000000003',
        audience: 'picklehub-admin',
        revokedAt: null,
        idleExpiresAt: new Date(now.getTime() + 60_000),
        absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
        mfaVerifiedAt: new Date(now.getTime() - 60_000),
        reauthenticatedAt: now,
        securityEpoch: 4,
        roleGrant: {
            role: PlatformRole.MODERATOR,
            revokedAt: null,
            validFrom: new Date(now.getTime() - 60_000),
            validUntil: null,
        },
    };

    function service(authEpoch: number, grantRevoked = false): AdministrationSessionService {
        const prisma = {
            adminSession: {
                findUnique: jest.fn().mockResolvedValue({
                    ...baseSession,
                    roleGrant: { ...baseSession.roleGrant, revokedAt: grantRevoked ? now : null },
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', authEpoch }) },
        } as unknown as PrismaService;
        const crypto = { hash: jest.fn().mockReturnValue(hash) } as unknown as IdentityCryptoService;
        const clock = { now: () => now } as Clock;
        return new AdministrationSessionService(
            prisma,
            crypto,
            clock,
            new AdministrationPolicy(),
            new AdministrationMetricsService()
        );
    }

    it('accepts only a current admin audience session and refreshes bounded idle expiry', async () => {
        const context = await service(4).authenticate(`Bearer ${token}`);

        expect(context.role).toBe(PlatformRole.MODERATOR);
        expect(context.idleExpiresAt).toEqual(new Date(now.getTime() + 15 * 60_000));
    });

    it('immediately rejects a revoked role or changed security epoch', async () => {
        await expect(service(4, true).authenticate(`Bearer ${token}`)).rejects.toMatchObject({
            code: 'ADMIN_SESSION_INVALID',
        });
        await expect(service(5).authenticate(`Bearer ${token}`)).rejects.toMatchObject({
            code: 'ADMIN_SESSION_INVALID',
        });
    });
});
