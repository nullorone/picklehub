import { Inject, Injectable } from '@nestjs/common';
import { IdentityProvider, Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { OutboxService } from '../outbox/outbox.service';
import { Clock } from './clock';
import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { ProofSide, type ClientPlatform, type StartAttemptDto } from './identity.dto';
import { identityError } from './identity.errors';
import { IdentityCryptoService } from './identity-crypto.service';
import { EmailProvider } from './email-provider';
import type { AuthenticatedIdentity } from './identity.service';
import { IdentityService } from './identity.service';
import type { VerifiedTelegramProof } from './telegram-verifier.service';

type Transaction = Prisma.TransactionClient;

export function buildIdentityProofLink(
    baseUrl: string,
    secret: string,
    attemptId: string,
    targetIdentityId: string | null
): string {
    const fragment = new URLSearchParams({ attempt: attemptId, token: secret });
    if (targetIdentityId) fragment.set('identity', targetIdentityId);
    return `${baseUrl}#${fragment.toString()}`;
}

@Injectable()
export class IdentityAttemptService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly identity: IdentityService,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock,
        private readonly email: EmailProvider,
        private readonly audit: AuditService,
        private readonly outbox: OutboxService,
        private readonly requestContext: RequestContextService,
        @Inject(ENVIRONMENT) private readonly environment: Environment
    ) {}

    async start(
        auth: AuthenticatedIdentity,
        body: StartAttemptDto,
        transaction: Transaction | PrismaService = this.prisma
    ): Promise<object> {
        if (
            (body.action === 'LINK' && (body.targetProvider === undefined || body.identityId !== undefined)) ||
            (body.action === 'UNLINK' && (body.identityId === undefined || body.targetProvider !== undefined)) ||
            (body.action === 'DELETE_ACCOUNT' && (body.identityId !== undefined || body.targetProvider !== undefined))
        ) {
            throw identityError('VALIDATION_FAILED', 400);
        }
        const requestedProvider = body.targetProvider === undefined ? undefined : IdentityProvider[body.targetProvider];
        if (
            body.action === 'LINK' &&
            requestedProvider !== undefined &&
            auth.session.user.identities.some((item) => item.provider === requestedProvider)
        ) {
            throw identityError('IDENTITY_LINK_FAILED', 409);
        }
        if (body.action === 'UNLINK') {
            const target = auth.session.user.identities.find((item) => item.id === body.identityId);
            if (target === undefined) {
                throw identityError('IDENTITY_LINK_FAILED', 409);
            }
            if (auth.session.user.identities.length < 2) {
                throw identityError('LAST_IDENTITY_REQUIRED', 409);
            }
        }
        const now = this.clock.now();
        const attempt = await transaction.identityAttempt.create({
            data: {
                id: uuidV7(),
                userId: auth.session.userId,
                sessionId: auth.session.id,
                action: body.action,
                targetProvider: body.targetProvider ?? null,
                targetIdentityId: body.identityId ?? null,
                createdAt: now,
                expiresAt: new Date(now.getTime() + 600_000),
            },
        });
        return this.projection(attempt);
    }

    async get(auth: AuthenticatedIdentity, attemptId: string): Promise<object> {
        const attempt = await this.owned(auth, attemptId);
        return this.projection(attempt);
    }

    async proveTelegram(
        auth: AuthenticatedIdentity,
        attemptId: string,
        side: ProofSide,
        proof: VerifiedTelegramProof
    ): Promise<object> {
        const result = await this.prisma.$transaction(async (transaction) => {
            const attempt = await this.owned(auth, attemptId, transaction);
            this.assertSide(attempt.action, attempt.targetProvider, side, IdentityProvider.TELEGRAM);
            await transaction.telegramProofReplay.create({
                data: { fingerprint: proof.fingerprint, expiresAt: proof.expiresAt },
            });
            if (side === ProofSide.CURRENT) {
                const belongs = await transaction.identity.count({
                    where: {
                        userId: auth.session.userId,
                        provider: IdentityProvider.TELEGRAM,
                        subjectKey: proof.subjectKey,
                    },
                });
                if (
                    belongs !== 1 ||
                    (attempt.action === 'UNLINK' &&
                        attempt.targetIdentityId !== null &&
                        auth.session.user.identities.find((item) => item.id === attempt.targetIdentityId)?.provider ===
                            IdentityProvider.TELEGRAM)
                ) {
                    throw identityError('IDENTITY_LINK_FAILED', 409);
                }
                return transaction.identityAttempt.update({
                    where: { id: attempt.id },
                    data: {
                        currentSubjectKey: proof.subjectKey,
                        currentProvider: IdentityProvider.TELEGRAM,
                        currentProofExpiresAt: new Date(
                            Math.min(proof.expiresAt.getTime(), attempt.expiresAt.getTime())
                        ),
                    },
                });
            }
            return transaction.identityAttempt.update({
                where: { id: attempt.id },
                data: {
                    targetSubjectKey: proof.subjectKey,
                    targetSubjectCiphertext: proof.subjectCiphertext,
                    targetEncryptionKeyVersion: 1,
                    targetProofExpiresAt: new Date(Math.min(proof.expiresAt.getTime(), attempt.expiresAt.getTime())),
                },
            });
        });
        return this.projection(result);
    }

    async requestEmailProof(
        auth: AuthenticatedIdentity,
        attemptId: string,
        side: ProofSide,
        input: string,
        deliver = true
    ): Promise<void> {
        const attempt = await this.owned(auth, attemptId);
        this.assertSide(attempt.action, attempt.targetProvider, side, IdentityProvider.EMAIL);
        const address = this.identity.normalizeEmail(input);
        const now = this.clock.now();
        const secret = this.crypto.secret();
        const subjectKey = this.crypto.hash(`EMAIL:${address}`);
        const scopeKey = this.crypto.hash(`MAGIC:PROOF:${attempt.id}:${side}:${subjectKey}`);
        await this.prisma.$transaction(async (transaction) => {
            await transaction.magicLink.updateMany({
                where: { scopeKey, consumedAt: null, revokedAt: null },
                data: { revokedAt: now },
            });
            await transaction.magicLink.create({
                data: {
                    id: uuidV7(),
                    userId: auth.session.userId,
                    attemptId: attempt.id,
                    purpose: 'PROOF',
                    side,
                    scopeKey,
                    subjectKey,
                    subjectCiphertext: this.crypto.encrypt(address),
                    encryptionKeyVersion: 1,
                    tokenHash: this.crypto.hash(secret),
                    createdAt: now,
                    expiresAt: new Date(Math.min(now.getTime() + 600_000, attempt.expiresAt.getTime())),
                },
            });
        });
        if (!deliver) return;
        try {
            await this.email.sendMagicLink({
                address,
                link: buildIdentityProofLink(
                    this.environment.MAGIC_LINK_BASE_URL,
                    secret,
                    attempt.id,
                    attempt.targetIdentityId
                ),
                purpose: 'PROOF',
            });
        } catch {
            // Neutral response by design; callers can request a new proof.
        }
    }

    async consumeEmailProof(auth: AuthenticatedIdentity, attemptId: string, token: string): Promise<object> {
        const now = this.clock.now();
        const result = await this.prisma.$transaction(async (transaction) => {
            const attempt = await this.owned(auth, attemptId, transaction);
            const link = await transaction.magicLink.findUnique({ where: { tokenHash: this.crypto.hash(token) } });
            if (
                link === null ||
                link.purpose !== 'PROOF' ||
                link.attemptId !== attempt.id ||
                link.userId !== auth.session.userId ||
                link.consumedAt !== null ||
                link.revokedAt !== null ||
                link.expiresAt <= now
            ) {
                throw identityError('MAGIC_LINK_INVALID', 401);
            }
            const consumed = await transaction.magicLink.updateMany({
                where: { id: link.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
                data: { consumedAt: now },
            });
            if (consumed.count !== 1) {
                throw identityError('MAGIC_LINK_INVALID', 401);
            }
            if (link.side === 'CURRENT') {
                const belongs = await transaction.identity.count({
                    where: {
                        userId: auth.session.userId,
                        provider: IdentityProvider.EMAIL,
                        subjectKey: link.subjectKey,
                    },
                });
                if (belongs !== 1) {
                    throw identityError('IDENTITY_LINK_FAILED', 409);
                }
                if (attempt.action === 'UNLINK' && attempt.targetIdentityId !== null) {
                    const target = await transaction.identity.findUnique({ where: { id: attempt.targetIdentityId } });
                    if (target?.provider === IdentityProvider.EMAIL) {
                        throw identityError('IDENTITY_LINK_FAILED', 409);
                    }
                }
                return transaction.identityAttempt.update({
                    where: { id: attempt.id },
                    data: {
                        currentSubjectKey: link.subjectKey,
                        currentProvider: IdentityProvider.EMAIL,
                        currentProofExpiresAt: new Date(Math.min(now.getTime() + 300_000, attempt.expiresAt.getTime())),
                    },
                });
            }
            return transaction.identityAttempt.update({
                where: { id: attempt.id },
                data: {
                    targetSubjectKey: link.subjectKey,
                    targetSubjectCiphertext: link.subjectCiphertext,
                    targetEncryptionKeyVersion: link.encryptionKeyVersion,
                    targetProofExpiresAt: new Date(Math.min(now.getTime() + 300_000, attempt.expiresAt.getTime())),
                },
            });
        });
        return this.projection(result);
    }

    async link(auth: AuthenticatedIdentity, attemptId: string): Promise<AuthenticatedIdentity> {
        const now = this.clock.now();
        try {
            return await this.prisma.$transaction(async (transaction) => {
                await transaction.$queryRaw`SELECT id FROM identity_users WHERE id = ${auth.session.userId}::uuid FOR UPDATE`;
                const attempt = await this.ready(auth, attemptId, 'LINK', transaction);
                if (
                    attempt.targetProvider === null ||
                    attempt.targetSubjectKey === null ||
                    attempt.targetSubjectCiphertext === null ||
                    attempt.targetEncryptionKeyVersion === null
                ) {
                    throw identityError('REAUTHENTICATION_REQUIRED', 403);
                }
                const linkedIdentityId = uuidV7();
                await transaction.identity.create({
                    data: {
                        id: linkedIdentityId,
                        userId: auth.session.userId,
                        provider: attempt.targetProvider,
                        subjectKey: attempt.targetSubjectKey,
                        subjectCiphertext: attempt.targetSubjectCiphertext,
                        encryptionKeyVersion: attempt.targetEncryptionKeyVersion,
                        linkedAt: now,
                    },
                });
                await transaction.identityAttempt.update({ where: { id: attempt.id }, data: { consumedAt: now } });
                await this.record(transaction, 'identity.linked.v1', 'identity.linked', auth.session.userId, {
                    userId: auth.session.userId,
                    identityId: linkedIdentityId,
                    provider: attempt.targetProvider,
                });
                return this.identity.replaceAllSessions(
                    transaction,
                    auth.session.userId,
                    auth.session.platform as ClientPlatform,
                    now
                );
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw identityError('IDENTITY_LINK_FAILED', 409);
            }
            throw error;
        }
    }

    async unlink(auth: AuthenticatedIdentity, identityId: string, attemptId: string): Promise<AuthenticatedIdentity> {
        const now = this.clock.now();
        return this.prisma.$transaction(async (transaction) => {
            await transaction.$queryRaw`SELECT id FROM identity_users WHERE id = ${auth.session.userId}::uuid FOR UPDATE`;
            const attempt = await this.ready(auth, attemptId, 'UNLINK', transaction);
            if (attempt.targetIdentityId !== identityId) {
                throw identityError('IDENTITY_LINK_FAILED', 409);
            }
            const count = await transaction.identity.count({ where: { userId: auth.session.userId } });
            if (count < 2) {
                throw identityError('LAST_IDENTITY_REQUIRED', 409);
            }
            const target = await transaction.identity.findFirst({
                where: { id: identityId, userId: auth.session.userId },
            });
            if (target === null) {
                throw identityError('IDENTITY_LINK_FAILED', 409);
            }
            const removed = await transaction.identity.deleteMany({
                where: { id: identityId, userId: auth.session.userId },
            });
            if (removed.count !== 1) {
                throw identityError('IDENTITY_LINK_FAILED', 409);
            }
            await transaction.identityAttempt.update({ where: { id: attempt.id }, data: { consumedAt: now } });
            await this.record(transaction, 'identity.unlinked.v1', 'identity.unlinked', auth.session.userId, {
                userId: auth.session.userId,
                identityId,
                provider: target.provider,
            });
            return this.identity.replaceAllSessions(
                transaction,
                auth.session.userId,
                auth.session.platform as ClientPlatform,
                now
            );
        });
    }

    async deleteAccount(auth: AuthenticatedIdentity, attemptId: string): Promise<Date> {
        const now = this.clock.now();
        await this.prisma.$transaction(async (transaction) => {
            await transaction.$queryRaw`SELECT id FROM identity_users WHERE id = ${auth.session.userId}::uuid FOR UPDATE`;
            const attempt = await this.ready(auth, attemptId, 'DELETE_ACCOUNT', transaction);
            await transaction.identityAttempt.update({ where: { id: attempt.id }, data: { consumedAt: now } });
            await transaction.user.update({
                where: { id: auth.session.userId },
                data: { status: 'DELETION_PENDING', deletionRequestedAt: now, authEpoch: { increment: 1 } },
            });
            await transaction.session.updateMany({
                where: { userId: auth.session.userId, revokedAt: null },
                data: { revokedAt: now },
            });
            await transaction.accessCredential.deleteMany({ where: { session: { userId: auth.session.userId } } });
            await transaction.magicLink.updateMany({
                where: { userId: auth.session.userId, consumedAt: null, revokedAt: null },
                data: { revokedAt: now },
            });
            await transaction.identityAttempt.updateMany({
                where: { userId: auth.session.userId, consumedAt: null, revokedAt: null },
                data: { revokedAt: now },
            });
            await this.record(
                transaction,
                'identity.account.deletion.requested.v1',
                'identity.deletion_requested',
                auth.session.userId,
                { userId: auth.session.userId }
            );
        });
        return now;
    }

    private async owned(
        auth: AuthenticatedIdentity,
        id: string,
        transaction: Transaction | PrismaService = this.prisma
    ) {
        const attempt = await transaction.identityAttempt.findFirst({
            where: { id, userId: auth.session.userId, sessionId: auth.session.id },
        });
        if (
            attempt === null ||
            attempt.expiresAt <= this.clock.now() ||
            attempt.consumedAt !== null ||
            attempt.revokedAt !== null
        ) {
            throw identityError('IDENTITY_LINK_FAILED', 409);
        }
        return attempt;
    }

    private async ready(auth: AuthenticatedIdentity, id: string, action: string, transaction: Transaction) {
        const attempt = await this.owned(auth, id, transaction);
        const now = this.clock.now();
        const currentReady = attempt.currentProofExpiresAt !== null && attempt.currentProofExpiresAt > now;
        const targetReady = attempt.targetProofExpiresAt !== null && attempt.targetProofExpiresAt > now;
        if (attempt.action !== action || !currentReady || (action === 'LINK' && !targetReady)) {
            throw identityError('REAUTHENTICATION_REQUIRED', 403);
        }
        return attempt;
    }

    private assertSide(
        action: string,
        provider: IdentityProvider | null,
        side: ProofSide,
        proofProvider: IdentityProvider
    ): void {
        if (
            (side === ProofSide.TARGET && (action !== 'LINK' || provider !== proofProvider)) ||
            (side === ProofSide.CURRENT && action === 'LINK' && provider === proofProvider)
        ) {
            throw identityError('IDENTITY_LINK_FAILED', 409);
        }
    }

    private projection(attempt: Prisma.IdentityAttemptGetPayload<object>): object {
        const now = this.clock.now();
        const current = attempt.currentProofExpiresAt !== null && attempt.currentProofExpiresAt > now;
        const target = attempt.targetProofExpiresAt !== null && attempt.targetProofExpiresAt > now;
        let status = 'PENDING';
        if (attempt.consumedAt !== null) status = 'CONSUMED';
        else if (attempt.revokedAt !== null) status = 'REVOKED';
        else if (attempt.expiresAt <= now) status = 'EXPIRED';
        else if (current && (attempt.action !== 'LINK' || target)) status = 'READY';
        return {
            id: attempt.id,
            action: attempt.action,
            status,
            expiresAt: attempt.expiresAt.toISOString(),
            currentProofExpiresAt: attempt.currentProofExpiresAt?.toISOString() ?? null,
            targetProofExpiresAt: attempt.targetProofExpiresAt?.toISOString() ?? null,
        };
    }

    private async record(
        transaction: Transaction,
        eventType: string,
        auditAction: string,
        userId: string,
        payload: Prisma.InputJsonObject
    ): Promise<void> {
        const context = this.requestContext.get() ?? { requestId: uuidV7(), correlationId: uuidV7(), locale: 'ru-RU' };
        await this.outbox.enqueue(transaction, {
            type: eventType,
            schemaVersion: 1,
            payload,
            correlationId: context.correlationId,
            occurredAt: this.clock.now(),
        });
        await this.audit.append(transaction, {
            actorType: 'USER',
            actorId: userId,
            action: auditAction,
            targetType: 'user',
            targetId: userId,
            outcome: 'SUCCEEDED',
            changedFields: { fields: Object.keys(payload) },
            requestId: context.requestId,
            correlationId: context.correlationId,
            source: 'identity-api',
        });
    }
}
