import { domainToASCII } from 'node:url';

import { Inject, Injectable } from '@nestjs/common';
import { IdentityProvider, Prisma, type ConsentPurpose } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { OutboxService } from '../outbox/outbox.service';
import { Clock } from './clock';
import { CursorService } from './cursor.service';
import type { ClientPlatform, CompleteOnboardingDto, ConsentChangeDto, UpdateDraftDto } from './identity.dto';
import { identityError } from './identity.errors';
import { IdentityCryptoService } from './identity-crypto.service';
import { EmailProvider } from './email-provider';
import type { VerifiedTelegramProof } from './telegram-verifier.service';

const ACCESS_MS = 5 * 60 * 1000;
const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const MAGIC_MS = 10 * 60 * 1000;

const sessionInclude = {
    user: {
        include: {
            identities: true,
            draft: true,
            consents: {
                include: { document: true },
                orderBy: [{ occurredAt: 'desc' as const }, { id: 'desc' as const }],
            },
        },
    },
} satisfies Prisma.SessionInclude;

type SessionWithUser = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;
type Transaction = Prisma.TransactionClient;

export interface AuthenticatedIdentity {
    session: SessionWithUser;
    accessToken?: string;
    refreshToken?: string;
    accessExpiresAt?: Date;
}

function plus(date: Date, milliseconds: number): Date {
    return new Date(date.getTime() + milliseconds);
}

@Injectable()
export class IdentityService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock,
        private readonly emailProvider: EmailProvider,
        private readonly outbox: OutboxService,
        private readonly audit: AuditService,
        private readonly requestContext: RequestContextService,
        private readonly cursors: CursorService,
        @Inject(ENVIRONMENT) private readonly environment: Environment
    ) {}

    normalizeEmail(input: string): string {
        const separator = input.lastIndexOf('@');
        const local = input.slice(0, separator).toLowerCase();
        const domain = domainToASCII(input.slice(separator + 1).toLowerCase());
        const result = `${local}@${domain}`;
        if (
            separator <= 0 ||
            local.length > 64 ||
            domain.length === 0 ||
            result.length > 254 ||
            /[\s"()<>{},;:]/u.test(local)
        ) {
            throw identityError('VALIDATION_FAILED', 400);
        }
        return result;
    }

    async authenticate(header: string | undefined): Promise<AuthenticatedIdentity> {
        const match = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(header ?? '');
        if (match === null) {
            throw identityError('SESSION_INVALID', 401);
        }
        const now = this.clock.now();
        const credential = await this.prisma.accessCredential.findUnique({
            where: { tokenHash: this.crypto.hash(match[1] ?? '') },
            include: { session: { include: sessionInclude } },
        });
        const session = credential?.session;
        if (
            credential === null ||
            session === undefined ||
            credential.expiresAt <= now ||
            session.revokedAt !== null ||
            session.idleExpiresAt <= now ||
            session.absoluteExpiresAt <= now ||
            session.user.status !== 'ACTIVE' ||
            session.authEpoch !== session.user.authEpoch
        ) {
            throw identityError('SESSION_INVALID', 401);
        }
        return { session };
    }

    async loginTelegram(proof: VerifiedTelegramProof, platform: ClientPlatform): Promise<AuthenticatedIdentity> {
        const now = this.clock.now();
        try {
            return await this.prisma.$transaction(
                async (transaction) => {
                    await transaction.telegramProofReplay.create({
                        data: { fingerprint: proof.fingerprint, expiresAt: proof.expiresAt },
                    });
                    let identity = await transaction.identity.findUnique({
                        where: {
                            provider_subjectKey: { provider: IdentityProvider.TELEGRAM, subjectKey: proof.subjectKey },
                        },
                        include: { user: true },
                    });
                    if (identity === null) {
                        const userId = uuidV7(now.getTime());
                        await transaction.user.create({
                            data: {
                                id: userId,
                                createdAt: now,
                                lastLoginAt: now,
                                identities: {
                                    create: {
                                        id: uuidV7(),
                                        provider: IdentityProvider.TELEGRAM,
                                        subjectKey: proof.subjectKey,
                                        subjectCiphertext: proof.subjectCiphertext,
                                        encryptionKeyVersion: 1,
                                        linkedAt: now,
                                    },
                                },
                                draft: { create: { updatedAt: now } },
                            },
                        });
                        identity = await transaction.identity.findUniqueOrThrow({
                            where: {
                                provider_subjectKey: {
                                    provider: IdentityProvider.TELEGRAM,
                                    subjectKey: proof.subjectKey,
                                },
                            },
                            include: { user: true },
                        });
                    }
                    await transaction.$queryRaw`SELECT id FROM identity_users WHERE id = ${identity.userId}::uuid FOR UPDATE`;
                    const lockedUser = await transaction.user.findUniqueOrThrow({ where: { id: identity.userId } });
                    if (lockedUser.status !== 'ACTIVE') {
                        throw identityError('REQUEST_NOT_ALLOWED', 403);
                    }
                    await transaction.user.update({ where: { id: identity.userId }, data: { lastLoginAt: now } });
                    return this.issueSession(transaction, identity.userId, platform, now);
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            );
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw identityError('TELEGRAM_AUTH_INVALID', 401);
            }
            throw error;
        }
    }

    async requestLoginEmail(addressInput: string, platform: ClientPlatform, deliver = true): Promise<void> {
        const address = this.normalizeEmail(addressInput);
        const now = this.clock.now();
        const secret = this.crypto.secret();
        const subjectKey = this.crypto.hash(`EMAIL:${address}`);
        const scopeKey = this.crypto.hash(`MAGIC:LOGIN:${subjectKey}`);
        await this.prisma.$transaction(async (transaction) => {
            const identity = await transaction.identity.findUnique({
                where: { provider_subjectKey: { provider: IdentityProvider.EMAIL, subjectKey } },
                include: { user: true },
            });
            await transaction.magicLink.updateMany({
                where: { scopeKey, consumedAt: null, revokedAt: null },
                data: { revokedAt: now },
            });
            await transaction.magicLink.create({
                data: {
                    id: uuidV7(),
                    userId: identity?.user.status === 'ACTIVE' ? identity.userId : null,
                    purpose: 'LOGIN',
                    scopeKey,
                    subjectKey,
                    subjectCiphertext: this.crypto.encrypt(address),
                    encryptionKeyVersion: 1,
                    tokenHash: this.crypto.hash(secret),
                    createdAt: now,
                    expiresAt: plus(now, MAGIC_MS),
                },
            });
        });
        if (!deliver) return;
        try {
            await this.emailProvider.sendMagicLink({
                address,
                link: `${this.environment.MAGIC_LINK_BASE_URL}#token=${secret}`,
                purpose: 'LOGIN',
            });
        } catch {
            // The public response remains neutral. The raw secret is not queued or logged.
        }
        void platform;
    }

    async consumeLoginEmail(token: string, platform: ClientPlatform): Promise<AuthenticatedIdentity> {
        const now = this.clock.now();
        const result = await this.prisma.$transaction(
            async (transaction) => {
                const link = await transaction.magicLink.findUnique({ where: { tokenHash: this.crypto.hash(token) } });
                if (
                    link === null ||
                    link.purpose !== 'LOGIN' ||
                    link.expiresAt <= now ||
                    link.consumedAt !== null ||
                    link.revokedAt !== null
                ) {
                    return null;
                }
                const consumed = await transaction.magicLink.updateMany({
                    where: { id: link.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
                    data: { consumedAt: now },
                });
                if (consumed.count !== 1) {
                    return null;
                }
                let identity = await transaction.identity.findUnique({
                    where: { provider_subjectKey: { provider: IdentityProvider.EMAIL, subjectKey: link.subjectKey } },
                    include: { user: true },
                });
                if (identity === null) {
                    const userId = uuidV7(now.getTime());
                    await transaction.user.create({
                        data: {
                            id: userId,
                            createdAt: now,
                            lastLoginAt: now,
                            identities: {
                                create: {
                                    id: uuidV7(),
                                    provider: IdentityProvider.EMAIL,
                                    subjectKey: link.subjectKey,
                                    subjectCiphertext: link.subjectCiphertext,
                                    encryptionKeyVersion: link.encryptionKeyVersion,
                                    linkedAt: now,
                                },
                            },
                            draft: { create: { updatedAt: now } },
                        },
                    });
                    identity = await transaction.identity.findUniqueOrThrow({
                        where: {
                            provider_subjectKey: { provider: IdentityProvider.EMAIL, subjectKey: link.subjectKey },
                        },
                        include: { user: true },
                    });
                }
                await transaction.$queryRaw`SELECT id FROM identity_users WHERE id = ${identity.userId}::uuid FOR UPDATE`;
                const lockedUser = await transaction.user.findUniqueOrThrow({ where: { id: identity.userId } });
                if (lockedUser.status !== 'ACTIVE') {
                    return null;
                }
                await transaction.user.update({ where: { id: identity.userId }, data: { lastLoginAt: now } });
                return this.issueSession(transaction, identity.userId, platform, now);
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        if (result === null) {
            throw identityError('MAGIC_LINK_INVALID', 401);
        }
        return result;
    }

    async refresh(rawToken: string | undefined): Promise<AuthenticatedIdentity> {
        if (rawToken === undefined || rawToken.length !== 43) {
            throw identityError('SESSION_INVALID', 401);
        }
        const now = this.clock.now();
        const result = await this.prisma.$transaction(async (transaction) => {
            const credential = await transaction.refreshCredential.findUnique({
                where: { tokenHash: this.crypto.hash(rawToken) },
                include: { session: { include: sessionInclude } },
            });
            if (credential === null) {
                return { kind: 'invalid' as const };
            }
            const session = credential.session;
            if (credential.rotatedAt !== null) {
                if (await this.revokeSession(transaction, session.id, now)) {
                    await this.sessionRevokedEvent(transaction, session.userId, 'CURRENT', 'REPLAY', now);
                }
                return { kind: 'invalid' as const };
            }
            if (
                session.revokedAt !== null ||
                session.idleExpiresAt <= now ||
                session.absoluteExpiresAt <= now ||
                session.authEpoch !== session.user.authEpoch ||
                session.user.status !== 'ACTIVE'
            ) {
                await this.revokeSession(transaction, session.id, now);
                return { kind: 'invalid' as const };
            }
            const rotated = await transaction.refreshCredential.updateMany({
                where: { id: credential.id, rotatedAt: null },
                data: { rotatedAt: now },
            });
            if (rotated.count !== 1) {
                if (await this.revokeSession(transaction, session.id, now)) {
                    await this.sessionRevokedEvent(transaction, session.userId, 'CURRENT', 'REPLAY', now);
                }
                return { kind: 'invalid' as const };
            }
            const refreshToken = this.crypto.secret();
            const accessToken = this.crypto.secret();
            const accessExpiresAt = plus(now, ACCESS_MS);
            const idleExpiresAt = new Date(Math.min(plus(now, IDLE_MS).getTime(), session.absoluteExpiresAt.getTime()));
            await transaction.session.update({ where: { id: session.id }, data: { idleExpiresAt } });
            await transaction.refreshCredential.create({
                data: {
                    id: uuidV7(),
                    sessionId: session.id,
                    tokenHash: this.crypto.hash(refreshToken),
                    createdAt: now,
                },
            });
            await transaction.accessCredential.deleteMany({ where: { sessionId: session.id } });
            await transaction.accessCredential.create({
                data: {
                    tokenHash: this.crypto.hash(accessToken),
                    sessionId: session.id,
                    createdAt: now,
                    expiresAt: accessExpiresAt,
                },
            });
            const updated = await transaction.session.findUniqueOrThrow({
                where: { id: session.id },
                include: sessionInclude,
            });
            return { kind: 'ok' as const, session: updated, refreshToken, accessToken, accessExpiresAt };
        });
        if (result.kind === 'invalid') {
            throw identityError('SESSION_INVALID', 401);
        }
        return result;
    }

    async logout(rawToken: string | undefined): Promise<void> {
        if (rawToken === undefined) {
            return;
        }
        const now = this.clock.now();
        await this.prisma.$transaction(async (transaction) => {
            const credential = await transaction.refreshCredential.findUnique({
                where: { tokenHash: this.crypto.hash(rawToken) },
            });
            if (credential !== null) {
                const session = await transaction.session.findUnique({ where: { id: credential.sessionId } });
                if (session !== null && (await this.revokeSession(transaction, credential.sessionId, now))) {
                    await this.sessionRevokedEvent(transaction, session.userId, 'CURRENT', 'LOGOUT', now);
                }
            }
        });
    }

    async logoutAll(auth: AuthenticatedIdentity): Promise<void> {
        const now = this.clock.now();
        await this.prisma.$transaction(async (transaction) => {
            const userId = auth.session.userId;
            await transaction.$queryRaw`SELECT id FROM identity_users WHERE id = ${userId}::uuid FOR UPDATE`;
            await transaction.user.update({ where: { id: userId }, data: { authEpoch: { increment: 1 } } });
            await transaction.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
            await transaction.identityAttempt.updateMany({
                where: { userId, consumedAt: null, revokedAt: null },
                data: { revokedAt: now },
            });
            await transaction.magicLink.updateMany({
                where: { userId, consumedAt: null, revokedAt: null },
                data: { revokedAt: now },
            });
            await this.outbox.enqueue(transaction, {
                type: 'identity.sessions.revoked.v1',
                schemaVersion: 1,
                payload: { userId, scope: 'ALL', reason: 'LOGOUT' },
                correlationId: this.context().correlationId,
                occurredAt: now,
            });
            await this.safeAudit(transaction, 'identity.sessions.revoked_all', 'user', userId, ['authEpoch']);
        });
    }

    getMe(auth: AuthenticatedIdentity): object {
        return {
            user: this.userProjectionSync(auth.session.user),
            session: this.sessionProjection(auth.session),
            identities: auth.session.user.identities.map((identity) => this.identityProjection(identity)),
        };
    }

    async getOnboarding(auth: AuthenticatedIdentity): Promise<object> {
        const draft = await this.prisma.playerProfileDraft.findUniqueOrThrow({
            where: { userId: auth.session.userId },
        });
        return this.onboardingProjection(auth.session.userId, draft);
    }

    async updateDraft(
        auth: AuthenticatedIdentity,
        body: UpdateDraftDto,
        transaction: Transaction | PrismaService = this.prisma
    ): Promise<object> {
        const mutableKeys = Object.keys(body).filter((key) => key !== 'expectedVersion');
        if (mutableKeys.length === 0 || body.expectedVersion < 0) {
            throw identityError('VALIDATION_FAILED', 400);
        }
        if (body.displayName !== undefined && body.displayName !== null) {
            body.displayName = body.displayName.normalize('NFC').trim();
            if (
                Array.from(body.displayName).length < 2 ||
                Array.from(body.displayName).length > 50 ||
                /\p{Cc}/u.test(body.displayName)
            ) {
                throw identityError('VALIDATION_FAILED', 400);
            }
        }
        if (body.timeZone !== undefined && body.timeZone !== null) {
            try {
                new Intl.DateTimeFormat('ru-RU', { timeZone: body.timeZone }).format();
            } catch {
                throw identityError('VALIDATION_FAILED', 400);
            }
        }
        if (body.duprProfileUrl !== undefined && body.duprProfileUrl !== null) {
            throw identityError('REQUEST_NOT_ALLOWED', 403);
        }
        if (body.localityId !== undefined && body.localityId !== null) {
            const exists = await transaction.onboardingLocality.count({ where: { id: body.localityId } });
            if (exists !== 1) {
                throw identityError('VALIDATION_FAILED', 400);
            }
        }
        const { expectedVersion, ...changes } = body;
        const updated = await transaction.playerProfileDraft.updateMany({
            where: { userId: auth.session.userId, version: expectedVersion, completedAt: null },
            data: { ...changes, version: { increment: 1 }, updatedAt: this.clock.now() },
        });
        if (updated.count !== 1) {
            throw identityError('DRAFT_VERSION_CONFLICT', 409);
        }
        const draft = await transaction.playerProfileDraft.findUniqueOrThrow({
            where: { userId: auth.session.userId },
        });
        return this.onboardingProjection(auth.session.userId, draft, transaction);
    }

    async completeOnboarding(
        auth: AuthenticatedIdentity,
        body: CompleteOnboardingDto,
        owningTransaction?: Transaction
    ): Promise<object> {
        const now = this.clock.now();
        const operation = async (transaction: Transaction): Promise<object> => {
            const draft = await transaction.playerProfileDraft.findUniqueOrThrow({
                where: { userId: auth.session.userId },
            });
            if (draft.completedAt !== null) {
                return this.onboardingProjection(auth.session.userId, draft, transaction);
            }
            if (
                draft.version !== body.expectedVersion ||
                draft.displayName === null ||
                draft.timeZone === null ||
                draft.localityId === null ||
                draft.gameFormats.length === 0 ||
                draft.skillSelfAssessment === null
            ) {
                throw identityError('DRAFT_VERSION_CONFLICT', 409);
            }
            const documents = await transaction.consentDocument.findMany({
                where: { purpose: { in: ['TERMS', 'PERSONAL_DATA'] }, isCurrent: true, effectiveAt: { lte: now } },
            });
            const versions = new Map(documents.map((document) => [document.purpose, document.version]));
            if (
                versions.get('TERMS') !== body.termsVersion ||
                versions.get('PERSONAL_DATA') !== body.personalDataVersion
            ) {
                throw identityError('CONSENT_VERSION_CHANGED', 409);
            }
            const accepted = await this.acceptedConsentVersions(transaction, auth.session.userId);
            if (
                accepted.get('TERMS') !== body.termsVersion ||
                accepted.get('PERSONAL_DATA') !== body.personalDataVersion
            ) {
                throw identityError('CONSENT_REQUIRED', 403);
            }
            const completed = await transaction.playerProfileDraft.updateMany({
                where: { userId: auth.session.userId, version: body.expectedVersion, completedAt: null },
                data: { completedAt: now, updatedAt: now },
            });
            if (completed.count !== 1) {
                throw identityError('DRAFT_VERSION_CONFLICT', 409);
            }
            await transaction.user.update({ where: { id: auth.session.userId }, data: { completedAt: now } });
            await this.outbox.enqueue(transaction, {
                type: 'identity.onboarding.completed.v1',
                schemaVersion: 1,
                payload: { userId: auth.session.userId },
                correlationId: this.context().correlationId,
                occurredAt: now,
            });
            const result = await transaction.playerProfileDraft.findUniqueOrThrow({
                where: { userId: auth.session.userId },
            });
            return this.onboardingProjection(auth.session.userId, result, transaction);
        };
        return owningTransaction === undefined ? this.prisma.$transaction(operation) : operation(owningTransaction);
    }

    async changeConsent(
        auth: AuthenticatedIdentity,
        body: ConsentChangeDto,
        operationId: string,
        owningTransaction?: Transaction
    ): Promise<object> {
        const now = this.clock.now();
        const operation = async (transaction: Transaction): Promise<object> => {
            const document = await transaction.consentDocument.findUnique({
                where: { purpose_version: { purpose: body.purpose, version: body.version } },
            });
            if (
                document === null ||
                document.effectiveAt > now ||
                (body.action === 'ACCEPTED' && !document.isCurrent)
            ) {
                throw identityError('CONSENT_VERSION_CHANGED', 409);
            }
            const accepted = await this.acceptedConsentVersions(transaction, auth.session.userId);
            const current = accepted.get(body.purpose);
            if (body.action === 'ACCEPTED' && current === body.version) {
                const latest = await transaction.consent.findFirstOrThrow({
                    where: { userId: auth.session.userId, purpose: body.purpose },
                    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
                    include: { document: true },
                });
                return this.consentProjection(latest);
            }
            if (body.action === 'WITHDRAWN' && current !== body.version) {
                throw identityError('CONSENT_VERSION_CHANGED', 409);
            }
            const consent = await transaction.consent.create({
                data: {
                    id: uuidV7(),
                    userId: auth.session.userId,
                    purpose: body.purpose,
                    version: body.version,
                    action: body.action,
                    platform: body.platform,
                    operationId,
                    occurredAt: now,
                },
                include: { document: true },
            });
            await this.outbox.enqueue(transaction, {
                type: 'identity.consent.changed.v1',
                schemaVersion: 1,
                payload: { userId: auth.session.userId, purpose: body.purpose, action: body.action },
                correlationId: this.context().correlationId,
                occurredAt: now,
            });
            return this.consentProjection(consent);
        };
        return owningTransaction === undefined ? this.prisma.$transaction(operation) : operation(owningTransaction);
    }

    async listConsents(auth: AuthenticatedIdentity, limit: number, cursor?: string): Promise<object> {
        const pageSize = Math.min(Math.max(limit, 1), 100);
        const position =
            cursor === undefined
                ? { snapshot: this.clock.now().toISOString() }
                : this.cursors.decode<{
                      type: 'consents';
                      userId: string;
                      snapshot: string;
                      occurredAt: string;
                      id: string;
                  }>(cursor, 'consents');
        if ('type' in position && position.userId !== auth.session.userId) {
            throw identityError('INVALID_CURSOR', 400);
        }
        const items = await this.prisma.consent.findMany({
            where: {
                userId: auth.session.userId,
                occurredAt: { lte: new Date(position.snapshot) },
                ...('occurredAt' in position
                    ? {
                          OR: [
                              { occurredAt: { lt: new Date(position.occurredAt) } },
                              { occurredAt: new Date(position.occurredAt), id: { lt: position.id } },
                          ],
                      }
                    : {}),
            },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
            take: pageSize + 1,
            include: { document: true },
        });
        const hasMore = items.length > pageSize;
        const page = items.slice(0, pageSize);
        const last = page.at(-1);
        return {
            items: page.map((item) => this.consentProjection(item)),
            pageInfo: {
                nextCursor:
                    hasMore && last !== undefined
                        ? this.cursors.encode({
                              type: 'consents',
                              userId: auth.session.userId,
                              snapshot: position.snapshot,
                              occurredAt: last.occurredAt.toISOString(),
                              id: last.id,
                          })
                        : null,
                hasMore,
            },
        };
    }

    async listDocuments(): Promise<object> {
        const now = this.clock.now();
        const items = await this.prisma.consentDocument.findMany({
            where: { isCurrent: true, effectiveAt: { lte: now } },
            orderBy: { purpose: 'asc' },
        });
        return { items: items.map((document) => this.documentProjection(document)) };
    }

    async getDocument(purpose: ConsentPurpose, version: string): Promise<object> {
        const document = await this.prisma.consentDocument.findUnique({
            where: { purpose_version: { purpose, version } },
        });
        if (document === null || document.effectiveAt > this.clock.now()) {
            throw identityError('DOCUMENT_NOT_FOUND', 404);
        }
        return this.documentProjection(document);
    }

    onboardingOptions(): object {
        const supportedTimeZones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
        return {
            catalogueVersion: 1,
            duprLinksEnabled: false,
            duprAllowedPatterns: [],
            supportedTimeZones,
        };
    }

    async localities(userId: string, query: string | undefined, limit: number, cursor?: string): Promise<object> {
        const normalizedQuery = query?.trim() ?? '';
        const catalogueVersion =
            (await this.prisma.onboardingLocality.aggregate({ _max: { catalogueVersion: true } }))._max
                .catalogueVersion ?? 1;
        const position =
            cursor === undefined
                ? undefined
                : this.cursors.decode<{
                      type: 'localities';
                      userId: string;
                      query: string;
                      catalogueVersion: number;
                      name: string;
                      id: string;
                  }>(cursor, 'localities');
        if (
            position !== undefined &&
            (position.userId !== userId ||
                position.query !== normalizedQuery ||
                position.catalogueVersion !== catalogueVersion)
        ) {
            throw identityError('INVALID_CURSOR', 400);
        }
        const pageSize = Math.min(Math.max(limit, 1), 100);
        const items = await this.prisma.onboardingLocality.findMany({
            where: {
                ...(normalizedQuery === ''
                    ? {}
                    : { name: { contains: normalizedQuery, mode: 'insensitive' as const } }),
                ...(position === undefined
                    ? {}
                    : { OR: [{ name: { gt: position.name } }, { name: position.name, id: { gt: position.id } }] }),
                catalogueVersion,
            },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: pageSize + 1,
        });
        const hasMore = items.length > pageSize;
        const page = items.slice(0, pageSize);
        const last = page.at(-1);
        return {
            items: page.map((item) => ({
                id: item.id,
                name: item.name,
                countryCode: item.countryCode,
                region: item.region,
            })),
            pageInfo: {
                nextCursor:
                    hasMore && last !== undefined
                        ? this.cursors.encode({
                              type: 'localities',
                              userId,
                              query: normalizedQuery,
                              catalogueVersion,
                              name: last.name,
                              id: last.id,
                          })
                        : null,
                hasMore,
            },
        };
    }

    response(auth: AuthenticatedIdentity): object {
        if (auth.accessToken === undefined || auth.accessExpiresAt === undefined) {
            throw new Error('A credential response requires a newly issued access token');
        }
        return {
            tokenType: 'Bearer',
            accessToken: auth.accessToken,
            accessExpiresAt: auth.accessExpiresAt.toISOString(),
            csrfToken: '',
            session: this.sessionProjection(auth.session),
            user: this.userProjectionSync(auth.session.user),
        };
    }

    async replaceAllSessions(
        transaction: Transaction,
        userId: string,
        platform: ClientPlatform,
        now: Date
    ): Promise<AuthenticatedIdentity> {
        await transaction.user.update({ where: { id: userId }, data: { authEpoch: { increment: 1 } } });
        await transaction.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
        await transaction.accessCredential.deleteMany({ where: { session: { userId } } });
        await this.sessionRevokedEvent(transaction, userId, 'ALL', 'IDENTITY_CHANGED', now);
        return this.issueSession(transaction, userId, platform, now);
    }

    async issueSession(
        transaction: Transaction,
        userId: string,
        platform: ClientPlatform,
        now: Date
    ): Promise<AuthenticatedIdentity> {
        const user = await transaction.user.findUniqueOrThrow({ where: { id: userId } });
        const accessToken = this.crypto.secret();
        const refreshToken = this.crypto.secret();
        const accessExpiresAt = plus(now, ACCESS_MS);
        const absoluteExpiresAt = plus(now, ABSOLUTE_MS);
        const session = await transaction.session.create({
            data: {
                id: uuidV7(),
                userId,
                authEpoch: user.authEpoch,
                platform,
                createdAt: now,
                idleExpiresAt: plus(now, IDLE_MS),
                absoluteExpiresAt,
                refreshCredentials: {
                    create: { id: uuidV7(), tokenHash: this.crypto.hash(refreshToken), createdAt: now },
                },
                accessCredentials: {
                    create: { tokenHash: this.crypto.hash(accessToken), createdAt: now, expiresAt: accessExpiresAt },
                },
            },
            include: sessionInclude,
        });
        return { session, accessToken, refreshToken, accessExpiresAt };
    }

    private async revokeSession(transaction: Transaction, sessionId: string, now: Date): Promise<boolean> {
        const revoked = await transaction.session.updateMany({
            where: { id: sessionId, revokedAt: null },
            data: { revokedAt: now },
        });
        await transaction.accessCredential.deleteMany({ where: { sessionId } });
        return revoked.count === 1;
    }

    private async sessionRevokedEvent(
        transaction: Transaction,
        userId: string,
        scope: 'CURRENT' | 'ALL',
        reason: 'LOGOUT' | 'REPLAY' | 'IDENTITY_CHANGED' | 'DELETION',
        now: Date
    ): Promise<void> {
        await this.outbox.enqueue(transaction, {
            type: 'identity.sessions.revoked.v1',
            schemaVersion: 1,
            payload: { userId, scope, reason },
            correlationId: this.context().correlationId,
            occurredAt: now,
        });
    }

    private userProjectionSync(user: SessionWithUser['user']): object {
        const latest = new Map<ConsentPurpose, SessionWithUser['user']['consents'][number]>();
        for (const consent of user.consents) {
            if (!latest.has(consent.purpose)) latest.set(consent.purpose, consent);
        }
        const requiredConsentsSatisfied = (['TERMS', 'PERSONAL_DATA'] as ConsentPurpose[]).every((purpose) => {
            const consent = latest.get(purpose);
            return consent?.action === 'ACCEPTED' && consent.document.isCurrent;
        });
        return {
            id: user.id,
            status: 'ACTIVE',
            onboardingStatus: user.completedAt === null ? 'DRAFT' : 'COMPLETED',
            completedAt: user.completedAt?.toISOString() ?? null,
            requiredConsentsSatisfied,
            createdAt: user.createdAt.toISOString(),
        };
    }

    private sessionProjection(session: SessionWithUser): object {
        return {
            id: session.id,
            status: 'ACTIVE',
            createdAt: session.createdAt.toISOString(),
            idleExpiresAt: session.idleExpiresAt.toISOString(),
            absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
        };
    }

    private identityProjection(identity: SessionWithUser['user']['identities'][number]): object {
        return { id: identity.id, provider: identity.provider, linkedAt: identity.linkedAt.toISOString() };
    }

    private async onboardingProjection(
        userId: string,
        draft: Prisma.PlayerProfileDraftGetPayload<object>,
        transaction: Transaction | PrismaService = this.prisma
    ): Promise<object> {
        const accepted = await this.acceptedConsentVersions(transaction, userId);
        return {
            draft: {
                userId,
                status: draft.completedAt === null ? 'DRAFT' : 'COMPLETED',
                version: draft.version,
                displayName: draft.displayName,
                timeZone: draft.timeZone,
                localityId: draft.localityId,
                gameFormats: draft.gameFormats,
                skillSelfAssessment: draft.skillSelfAssessment === null ? null : Number(draft.skillSelfAssessment),
                duprProfileUrl: draft.duprProfileUrl,
                completedAt: draft.completedAt?.toISOString() ?? null,
                updatedAt: draft.updatedAt.toISOString(),
            },
            consents: (['TERMS', 'PERSONAL_DATA', 'ANALYTICS', 'MARKETING'] as ConsentPurpose[]).map((purpose) => ({
                purpose,
                acceptedVersion: accepted.get(purpose) ?? null,
            })),
            requiredConsentsSatisfied: accepted.get('TERMS') !== null && accepted.get('PERSONAL_DATA') !== null,
        };
    }

    private async acceptedConsentVersions(
        transaction: Transaction | PrismaService,
        userId: string
    ): Promise<Map<ConsentPurpose, string | null>> {
        const entries = await transaction.consent.findMany({
            where: { userId },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        const result = new Map<ConsentPurpose, string | null>();
        for (const entry of entries) {
            if (!result.has(entry.purpose)) {
                result.set(entry.purpose, entry.action === 'ACCEPTED' ? entry.version : null);
            }
        }
        return result;
    }

    private documentProjection(document: Prisma.ConsentDocumentGetPayload<object>): object {
        return {
            purpose: document.purpose,
            version: document.version,
            checksum: document.checksum,
            title: document.title,
            text: document.text,
            required: document.purpose === 'TERMS' || document.purpose === 'PERSONAL_DATA',
            effectiveAt: document.effectiveAt.toISOString(),
        };
    }

    private consentProjection(consent: Prisma.ConsentGetPayload<{ include: { document: true } }>): object {
        return {
            id: consent.id,
            purpose: consent.purpose,
            version: consent.version,
            checksum: consent.document.checksum,
            action: consent.action,
            occurredAt: consent.occurredAt.toISOString(),
            platform: consent.platform,
        };
    }

    private context(): { requestId: string; correlationId: string } {
        return this.requestContext.get() ?? { requestId: uuidV7(), correlationId: uuidV7() };
    }

    private async safeAudit(
        transaction: Transaction,
        action: string,
        targetType: string,
        targetId: string,
        changedFields: string[]
    ): Promise<void> {
        const context = this.context();
        await this.audit.append(transaction, {
            actorType: 'USER',
            actorId: targetId,
            action,
            targetType,
            targetId,
            outcome: 'SUCCEEDED',
            changedFields: { fields: changedFields },
            requestId: context.requestId,
            correlationId: context.correlationId,
            source: 'identity-api',
        });
    }
}
