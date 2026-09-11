import { Injectable } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { AdministrationMetricsService } from './administration-metrics.service';
import { type AdminCapability, AdministrationPolicy } from './administration.policy';
import { administrationError } from './administration.errors';

export interface AuthenticatedAdmin {
    sessionId: string;
    actorId: string;
    role: PlatformRole;
    roleGrantId: string;
    mfaVerifiedAt: Date;
    reauthenticatedAt: Date | null;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
}

@Injectable()
export class AdministrationSessionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock,
        private readonly policy: AdministrationPolicy,
        private readonly metrics: AdministrationMetricsService
    ) {}

    async authenticate(authorization: string | undefined): Promise<AuthenticatedAdmin> {
        const match = /^Bearer ([A-Za-z0-9_-]{20,})$/u.exec(authorization ?? '');
        if (match === null) throw administrationError('ADMIN_SESSION_INVALID', 401);
        const credential = match[1];
        if (credential === undefined) throw administrationError('ADMIN_SESSION_INVALID', 401);
        const now = this.clock.now();
        const session = await this.prisma.adminSession.findUnique({
            where: { credentialHash: this.crypto.hash(`ADMIN_SESSION:${credential}`) },
            include: { roleGrant: true },
        });
        if (
            session === null ||
            session.audience !== 'picklehub-admin' ||
            session.revokedAt !== null ||
            session.idleExpiresAt <= now ||
            session.absoluteExpiresAt <= now ||
            session.roleGrant.revokedAt !== null ||
            session.roleGrant.validFrom > now ||
            (session.roleGrant.validUntil !== null && session.roleGrant.validUntil <= now)
        ) {
            throw administrationError('ADMIN_SESSION_INVALID', 401);
        }
        const user = await this.prisma.user.findUnique({
            where: { id: session.staffUserId },
            select: { status: true, authEpoch: true },
        });
        if (user?.status !== 'ACTIVE' || user.authEpoch !== session.securityEpoch) {
            throw administrationError('ADMIN_SESSION_INVALID', 401);
        }
        const idleExpiresAt = new Date(Math.min(now.getTime() + 15 * 60_000, session.absoluteExpiresAt.getTime()));
        await this.prisma.adminSession.updateMany({
            where: { id: session.id, revokedAt: null, securityEpoch: user.authEpoch },
            data: { lastSeenAt: now, idleExpiresAt },
        });
        return {
            sessionId: session.id,
            actorId: session.staffUserId,
            role: session.roleGrant.role,
            roleGrantId: session.roleGrantId,
            mfaVerifiedAt: session.mfaVerifiedAt,
            reauthenticatedAt: session.reauthenticatedAt,
            idleExpiresAt,
            absoluteExpiresAt: session.absoluteExpiresAt,
        };
    }

    assertCapability(admin: AuthenticatedAdmin, capability: AdminCapability): void {
        try {
            this.policy.assert(admin.role, capability);
        } catch (error) {
            this.metrics.authorizationDenied(admin.role, capability);
            throw error;
        }
    }

    assertFreshReauthentication(admin: AuthenticatedAdmin): void {
        if (
            admin.reauthenticatedAt === null ||
            this.clock.now().getTime() - admin.reauthenticatedAt.getTime() > 5 * 60_000
        ) {
            this.metrics.authorizationDenied(admin.role, 'REAUTH');
            throw administrationError('REAUTH_REQUIRED', 403);
        }
    }

    context(admin: AuthenticatedAdmin): object {
        return {
            sessionId: admin.sessionId,
            activeRole: admin.role,
            capabilities: this.policy.capabilities(admin.role),
            mfaVerifiedAt: admin.mfaVerifiedAt.toISOString(),
            reauthenticatedAt: admin.reauthenticatedAt?.toISOString() ?? null,
            idleExpiresAt: admin.idleExpiresAt.toISOString(),
            absoluteExpiresAt: admin.absoluteExpiresAt.toISOString(),
        };
    }
}
