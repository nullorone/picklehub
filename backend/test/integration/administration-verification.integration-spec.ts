import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ModerationCaseState, PlatformRole, VenueCandidateState, VenuePublicationState } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AdministrationConfirmationService } from '../../src/administration/administration-confirmation.service';
import { AdminReasonCodeDto } from '../../src/administration/administration.dto';
import { AdministrationService } from '../../src/administration/administration.service';
import {
    AdministrationSessionService,
    type AuthenticatedAdmin,
} from '../../src/administration/administration-session.service';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';

describe('administration concurrency, audit and reversal workflows', () => {
    let application: INestApplicationContext;
    let administration: AdministrationService;
    let confirmations: AdministrationConfirmationService;
    let sessions: AdministrationSessionService;
    let crypto: IdentityCryptoService;
    let prisma: PrismaService;

    beforeAll(async () => {
        application = await Test.createTestingModule({ imports: [AppModule] }).compile();
        await application.init();
        administration = application.get(AdministrationService);
        confirmations = application.get(AdministrationConfirmationService);
        sessions = application.get(AdministrationSessionService);
        crypto = application.get(IdentityCryptoService);
        prisma = application.get(PrismaService);
    });

    afterAll(async () => application.close());

    async function user(): Promise<string> {
        const userId = uuidV7();
        await prisma.user.create({ data: { id: userId } });
        return userId;
    }

    function admin(actorId: string, role: PlatformRole = PlatformRole.MODERATOR): AuthenticatedAdmin {
        const future = new Date(Date.now() + 3_600_000);
        return {
            absoluteExpiresAt: future,
            actorId,
            idleExpiresAt: future,
            mfaVerifiedAt: new Date(),
            reauthenticatedAt: new Date(),
            role,
            roleGrantId: uuidV7(),
            sessionId: uuidV7(),
        };
    }

    async function assignedCase(moderatorId: string, subjectId: string): Promise<string> {
        const reporterId = await user();
        const caseId = uuidV7();
        const signalId = uuidV7();
        await prisma.$transaction(async (tx) => {
            await tx.moderationCase.create({
                data: {
                    assignedModeratorId: moderatorId,
                    category: 'SAFETY',
                    id: caseId,
                    retentionExpiresAt: new Date(Date.now() + 365 * 86_400_000),
                    state: ModerationCaseState.ASSIGNED,
                },
            });
            await tx.safetySignal.create({
                data: {
                    id: signalId,
                    kind: 'SAFETY',
                    policyVersion: 'safety-v1',
                    receiptExpiresAt: new Date(Date.now() + 90 * 86_400_000),
                    reporterId,
                    subjectId,
                    uniquenessKey: crypto.hash(`admin-verification:${signalId}`),
                },
            });
            await tx.report.create({
                data: {
                    reasonCode: 'THREAT',
                    signalId,
                    sourceId: subjectId,
                    sourceKind: 'PROFILE',
                    sourceRevision: 1,
                },
            });
            await tx.moderationCaseSignal.create({ data: { caseId, signalId } });
        });
        return caseId;
    }

    it('allows exactly one concurrent moderator decision and no audit or event for the stale attempt', async () => {
        const moderatorId = await user();
        const subjectId = await user();
        const caseId = await assignedCase(moderatorId, subjectId);
        const moderator = admin(moderatorId);
        const body = {
            expectedRevision: 0,
            outcome: 'NO_VIOLATION' as const,
            policyVersion: 'admin-v1',
            reasonCode: AdminReasonCodeDto.ACCESS_REVIEW,
        };

        const attempts = await Promise.allSettled([
            administration.decideCase(moderator, caseId, body, randomUUID()),
            administration.decideCase(moderator, caseId, body, randomUUID()),
        ]);
        expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        const rejection = attempts.find(({ status }) => status === 'rejected');
        expect(rejection).toMatchObject({ reason: { code: 'REVISION_CONFLICT' } });

        await expect(administration.decideCase(moderator, caseId, body, randomUUID())).rejects.toMatchObject({
            code: 'REVISION_CONFLICT',
        });
        await expect(prisma.moderationDecision.count({ where: { caseId } })).resolves.toBe(1);
        await expect(
            prisma.auditEntry.count({ where: { action: 'SAFETY_CASE_DECIDED', targetId: caseId } })
        ).resolves.toBe(1);
        const decision = await prisma.moderationDecision.findFirstOrThrow({ where: { caseId } });
        const events = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*)::bigint AS count
            FROM outbox_events
            WHERE type = 'safety.decision.recorded.v1'
              AND payload->'data'->>'decisionId' = ${decision.id}
        `;
        expect(events[0]?.count).toBe(1n);
        await expect(prisma.adminOperationReceipt.count({ where: { targetId: caseId } })).resolves.toBe(1);
    });

    it('writes a minimal denied audit and keeps administration audit immutable and narrative-free', async () => {
        const actorId = await user();
        const editor = admin(actorId, PlatformRole.EDITOR);
        await administration.auditAuthorizationDenied(editor, 'SAFETY_CASE_ROUTE');

        const denied = await prisma.auditEntry.findFirstOrThrow({
            where: { action: 'SAFETY_CASE_ROUTE_DENIED', actorId, targetId: editor.sessionId },
        });
        expect(denied).toMatchObject({
            changedFields: { names: [] },
            outcome: 'DENIED',
            reasonCode: 'ACCESS_REVIEW',
            source: 'administration',
            targetType: 'ADMIN_SESSION',
        });
        expect(denied.operationId).not.toBeNull();
        expect(JSON.stringify(denied)).not.toContain('narrative');
        await expect(
            prisma.$executeRaw`UPDATE audit_entries SET outcome = 'SUCCEEDED' WHERE id = ${denied.id}::uuid`
        ).rejects.toThrow('audit_entries are append-only');
        await expect(
            prisma.auditEntry.create({
                data: {
                    action: 'SAFETY_CASE_ROUTE_DENIED',
                    actorId,
                    actorType: 'ADMIN',
                    changedFields: { names: [], narrative: 'restricted-canary' },
                    correlationId: uuidV7(),
                    id: uuidV7(),
                    operationId: uuidV7(),
                    outcome: 'DENIED',
                    policyVersion: 'admin-v1',
                    reasonCode: 'ACCESS_REVIEW',
                    requestId: uuidV7(),
                    source: 'administration',
                    targetId: editor.sessionId,
                    targetType: 'ADMIN_SESSION',
                },
            })
        ).rejects.toThrow();
    });

    it('revokes a restriction as a new revision and preserves both audit records', async () => {
        const moderatorId = await user();
        const subjectId = await user();
        const caseId = await assignedCase(moderatorId, subjectId);
        const moderator = admin(moderatorId);
        await administration.decideCase(
            moderator,
            caseId,
            {
                expectedRevision: 0,
                outcome: 'WARNING',
                policyVersion: 'admin-v1',
                reasonCode: AdminReasonCodeDto.POLICY_VIOLATION,
            },
            randomUUID()
        );
        const decision = await prisma.moderationDecision.findFirstOrThrow({ where: { caseId } });
        const created = (await administration.createRestriction(
            moderator,
            subjectId,
            {
                decisionId: decision.id,
                expectedRevision: 0,
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                policyVersion: 'admin-v1',
                reasonCode: AdminReasonCodeDto.USER_SAFETY,
                scope: 'DIRECT_INTERACTIONS',
            },
            randomUUID()
        )) as { restrictionId: string };
        await administration.revokeRestriction(
            moderator,
            subjectId,
            created.restrictionId,
            {
                expectedRevision: 0,
                policyVersion: 'admin-v1',
                reasonCode: AdminReasonCodeDto.ACCESS_REVIEW,
            },
            randomUUID()
        );

        await expect(
            prisma.userRestriction.findUniqueOrThrow({ where: { id: created.restrictionId } })
        ).resolves.toMatchObject({
            revision: 1,
            state: 'REVOKED',
        });
        await expect(
            prisma.auditEntry.count({
                where: {
                    action: { in: ['USER_RESTRICTION_CREATED', 'USER_RESTRICTION_REVOKED'] },
                    targetId: created.restrictionId,
                },
            })
        ).resolves.toBe(2);
    });

    it('rolls a venue merge back when the mandatory audit record is rejected', async () => {
        const moderatorId = await user();
        const matchId = uuidV7();
        await prisma.match.create({ data: { id: matchId, organizerId: moderatorId } });
        const venues = await Promise.all(
            [0, 1].map((index) =>
                prisma.venue.create({
                    data: {
                        id: uuidV7(),
                        lastVerifiedAt: new Date(),
                        latitude: 55.75 + index / 100,
                        locality: 'Москва',
                        longitude: 37.61 + index / 100,
                        name: `Admin verification ${String(index)}`,
                        normalizedAddress: `Москва, ${String(index)}`,
                        publicationState: VenuePublicationState.PUBLISHED,
                        timeZone: 'Europe/Moscow',
                        verificationState: 'MODERATOR_VERIFIED',
                    },
                })
            )
        );
        const survivor = venues[0];
        const duplicate = venues[1];
        if (survivor === undefined || duplicate === undefined) throw new Error('Venue fixtures were not created');
        const candidate = await prisma.venueCandidate.create({
            data: {
                contributorId: moderatorId,
                id: uuidV7(),
                latitude: 55.76,
                locality: 'Москва',
                longitude: 37.62,
                name: 'Duplicate candidate',
                normalizedAddress: 'Москва, duplicate',
                qualifiedAt: new Date(),
                sourceMatchId: matchId,
                state: VenueCandidateState.PENDING_REVIEW,
                timeZone: 'Europe/Moscow',
            },
        });
        const moderator = admin(moderatorId);
        const confirmationToken = confirmations.issue(moderatorId, 'VENUE_MERGE', candidate.id);

        await expect(
            administration.mergeVenue(
                moderator,
                candidate.id,
                {
                    confirmationToken,
                    duplicateVenueId: duplicate.id,
                    expectedRevision: 0,
                    policyVersion: 'invalid policy with spaces',
                    reasonCode: AdminReasonCodeDto.DUPLICATE_VENUE,
                    survivorVenueId: survivor.id,
                },
                randomUUID()
            )
        ).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });

        await expect(prisma.venueCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).resolves.toMatchObject({
            canonicalVenueId: null,
            state: VenueCandidateState.PENDING_REVIEW,
        });
        await expect(prisma.venue.findUniqueOrThrow({ where: { id: duplicate.id } })).resolves.toMatchObject({
            canonicalVenueId: null,
            publicationState: VenuePublicationState.PUBLISHED,
        });
        await expect(prisma.venueMerge.count({ where: { previousVenueId: duplicate.id } })).resolves.toBe(0);
        await expect(prisma.auditEntry.count({ where: { targetId: candidate.id } })).resolves.toBe(0);
        await expect(prisma.adminOperationReceipt.count({ where: { targetId: candidate.id } })).resolves.toBe(0);
    });

    it('invalidates an admin session immediately when its role grant is revoked', async () => {
        const [superadminId, approverId, moderatorId] = await Promise.all([user(), user(), user()]);
        const validUntil = new Date(Date.now() + 3_600_000);
        const reviewAt = new Date(Date.now() + 86_400_000);
        const superadminGrant = await prisma.platformRoleGrant.create({
            data: {
                approvalReference: 'bootstrap-test',
                approvedByUserId: approverId,
                grantedByUserId: moderatorId,
                id: uuidV7(),
                policyVersion: 'admin-v1',
                reasonCode: 'APPROVED_ACCESS_REQUEST',
                reviewAt,
                role: PlatformRole.SUPERADMIN,
                subjectUserId: superadminId,
                validUntil,
            },
        });
        const moderatorGrant = await prisma.platformRoleGrant.create({
            data: {
                approvalReference: 'SEC-202',
                approvedByUserId: approverId,
                grantedByUserId: superadminId,
                id: uuidV7(),
                policyVersion: 'admin-v1',
                reasonCode: 'APPROVED_ACCESS_REQUEST',
                reviewAt,
                role: PlatformRole.MODERATOR,
                subjectUserId: moderatorId,
                validUntil,
            },
        });
        const credential = crypto.secret();
        const now = new Date();
        await prisma.adminSession.create({
            data: {
                absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
                credentialHash: crypto.hash(`ADMIN_SESSION:${credential}`),
                id: uuidV7(),
                idleExpiresAt: new Date(now.getTime() + 10 * 60_000),
                lastSeenAt: now,
                mfaMethod: 'WEBAUTHN',
                mfaVerifiedAt: now,
                reauthenticatedAt: now,
                roleGrantId: moderatorGrant.id,
                securityEpoch: 0,
                staffUserId: moderatorId,
            },
        });
        await expect(sessions.authenticate(`Bearer ${credential}`)).resolves.toMatchObject({ role: 'MODERATOR' });
        const confirmationToken = confirmations.issue(superadminId, 'ROLE_REVOKE', moderatorGrant.id);
        await administration.revokeRole(
            { ...admin(superadminId, PlatformRole.SUPERADMIN), roleGrantId: superadminGrant.id },
            moderatorGrant.id,
            {
                confirmationToken,
                expectedRevision: 0,
                policyVersion: 'admin-v1',
                reasonCode: AdminReasonCodeDto.STAFF_DUTY_CHANGE,
            },
            randomUUID()
        );

        await expect(sessions.authenticate(`Bearer ${credential}`)).rejects.toMatchObject({
            code: 'ADMIN_SESSION_INVALID',
        });
        await expect(prisma.user.findUniqueOrThrow({ where: { id: moderatorId } })).resolves.toMatchObject({
            authEpoch: 1,
        });
        await expect(
            prisma.adminSession.findFirstOrThrow({ where: { staffUserId: moderatorId } })
        ).resolves.toMatchObject({
            revokeReasonCode: 'ROLE_REVOKED',
        });
    });
});
