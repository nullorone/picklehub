import { Injectable } from '@nestjs/common';
import {
    ChatMessageKind,
    ChatReportReason,
    ChatRevisionKind,
    ConversationState,
    IdentityProvider,
    NotificationCategory,
    NotificationChannel,
    Prisma,
} from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { Clock } from '../identity/clock';
import { OutboxService } from '../outbox/outbox.service';
import {
    NotificationChannelDto,
    type BindNotificationDeviceDto,
    type ChatReportReasonDto,
    type RegisterPushTokenDto,
    type UpdateNotificationPreferenceDto,
} from './communication.dto';
import { CommunicationCursorService, type ChatCursor, type NotificationCursor } from './communication-cursor.service';
import { CommunicationCryptoService } from './communication-crypto.service';
import { communicationError } from './communication.errors';
import { CommunicationMetricsService } from './communication-metrics.service';

const CHAT_EDIT_WINDOW_MS = 15 * 60_000;
const CATEGORIES = Object.values(NotificationCategory);
const CHANNELS = Object.values(NotificationChannel);
const messageInclude = { revisions: { orderBy: { revision: 'desc' as const }, take: 1 } };

type Transaction = Prisma.TransactionClient;
type MessageWithRevision = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;

interface MembershipAccess {
    id: string;
    conversationId: string;
    matchId: string;
    state: ConversationState;
    version: number;
    latestSequence: bigint;
    lastReadSequence: bigint;
    accessThroughSequence: bigint;
    accessExpiresAt: Date | null;
    active: boolean;
}

@Injectable()
export class CommunicationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly clock: Clock,
        private readonly crypto: CommunicationCryptoService,
        private readonly cursors: CommunicationCursorService,
        private readonly outbox: OutboxService,
        private readonly context: RequestContextService,
        private readonly metrics: CommunicationMetricsService,
        private readonly audit: AuditService
    ) {}

    async snapshot(userId: string, matchId: string): Promise<object> {
        const access = await this.access(userId, matchId, false);
        const messages = await this.prisma.chatMessage.findMany({
            where: { conversationId: access.conversationId, sequence: { lte: access.accessThroughSequence } },
            include: messageInclude,
            orderBy: { sequence: 'desc' },
            take: 51,
        });
        const visible = await this.projectMessages(userId, messages.slice(0, 50).reverse());
        const first = messages[Math.min(messages.length, 50) - 1];
        const last = messages[0];
        return {
            conversation: this.projectConversation(access, await this.unreadCount(userId, access)),
            messages: visible,
            backwardCursor:
                messages.length > 50 && first !== undefined
                    ? this.chatCursor(access, userId, 'backward', first.sequence)
                    : null,
            catchUpCursor: this.chatCursor(access, userId, 'forward', last?.sequence ?? 0n),
        };
    }

    async history(userId: string, matchId: string, cursor: string, limit: number): Promise<object> {
        const access = await this.access(userId, matchId, false);
        const decoded = this.cursors.decode<ChatCursor>(cursor, 'chat');
        if (
            decoded.userId !== userId ||
            decoded.conversationId !== access.conversationId ||
            decoded.accessThroughSequence !== (access.active ? 'active' : access.accessThroughSequence.toString())
        ) {
            throw communicationError('RESYNC_REQUIRED', 400);
        }
        const sequence = this.bigint(decoded.sequence);
        const backward = decoded.direction === 'backward';
        const rows = await this.prisma.chatMessage.findMany({
            where: {
                conversationId: access.conversationId,
                sequence: backward ? { lt: sequence } : { gt: sequence, lte: access.accessThroughSequence },
            },
            include: messageInclude,
            orderBy: { sequence: backward ? 'desc' : 'asc' },
            take: limit + 1,
        });
        const pageRows = rows.slice(0, limit);
        const outputRows = backward ? pageRows.reverse() : pageRows;
        const boundary = pageRows.at(-1)?.sequence ?? sequence;
        const newest = backward ? sequence : (pageRows.at(-1)?.sequence ?? sequence);
        return {
            items: await this.projectMessages(userId, outputRows),
            pageInfo: {
                hasNext: rows.length > limit,
                nextCursor: rows.length > limit ? this.chatCursor(access, userId, decoded.direction, boundary) : null,
            },
            catchUpCursor: this.chatCursor(access, userId, 'forward', newest),
        };
    }

    async send(userId: string, matchId: string, text: string, tx: Transaction): Promise<object> {
        this.assertText(text);
        const access = await this.access(userId, matchId, true, tx);
        const now = this.clock.now();
        const message = await tx.chatMessage.create({
            data: {
                id: uuidV7(),
                conversationId: access.conversationId,
                sequence: 1n,
                kind: ChatMessageKind.USER,
                authorId: userId,
                createdAt: now,
                revisions: {
                    create: { revision: 1, kind: ChatRevisionKind.CREATED, text, createdBy: userId, createdAt: now },
                },
            },
            include: messageInclude,
        });
        await this.chatChanged(tx, message, 'CREATED', now);
        this.metrics.increment('chat_message_total', { action: 'created' });
        return this.projectMessage(message, false);
    }

    async edit(
        userId: string,
        matchId: string,
        messageId: string,
        expectedRevision: number,
        text: string,
        tx: Transaction
    ): Promise<object> {
        this.assertText(text);
        await this.access(userId, matchId, true, tx);
        return this.mutateMessage(userId, matchId, messageId, expectedRevision, text, 'EDITED', tx);
    }

    async remove(
        userId: string,
        matchId: string,
        messageId: string,
        expectedRevision: number,
        tx: Transaction
    ): Promise<object> {
        await this.access(userId, matchId, true, tx);
        return this.mutateMessage(userId, matchId, messageId, expectedRevision, null, 'DELETED', tx);
    }

    async markRead(userId: string, matchId: string, throughSequence: number, tx: Transaction): Promise<object> {
        const access = await this.access(userId, matchId, false, tx);
        if (!access.active || access.state !== ConversationState.WRITABLE)
            throw communicationError('CONVERSATION_ACCESS_DENIED', 403);
        const through = BigInt(throughSequence);
        if (through > access.accessThroughSequence) throw communicationError('VALIDATION_FAILED', 400);
        const membership = await tx.conversationMembership.update({
            where: { id: access.id },
            data: { lastReadSequence: access.lastReadSequence > through ? access.lastReadSequence : through },
        });
        return {
            conversationId: access.conversationId,
            lastReadSequence: Number(membership.lastReadSequence),
            unreadCount: await this.unreadCount(
                userId,
                { ...access, lastReadSequence: membership.lastReadSequence },
                tx
            ),
        };
    }

    async report(
        userId: string,
        matchId: string,
        messageId: string,
        revision: number,
        reason: ChatReportReasonDto,
        operationId: string,
        tx: Transaction
    ): Promise<object> {
        const access = await this.access(userId, matchId, false, tx);
        const message = await tx.chatMessage.findFirst({
            where: {
                id: messageId,
                conversationId: access.conversationId,
                sequence: { lte: access.accessThroughSequence },
            },
        });
        const evidence = await tx.chatMessageRevision.findUnique({
            where: { messageId_revision: { messageId, revision } },
        });
        if (message === null || evidence === null) throw communicationError('MESSAGE_NOT_FOUND', 404);
        const existing = await tx.chatMessageReport.findUnique({
            where: {
                reporterId_messageId_messageRevision: { reporterId: userId, messageId, messageRevision: revision },
            },
        });
        if (existing !== null)
            return { reportId: existing.id, status: 'RECEIVED', createdAt: existing.createdAt.toISOString() };
        const created = await tx.chatMessageReport.create({
            data: {
                id: uuidV7(),
                messageId,
                messageRevision: revision,
                reporterId: userId,
                reason: reason as ChatReportReason,
                operationId,
                evidenceCiphertext: this.crypto.encrypt(
                    JSON.stringify({
                        kind: evidence.kind,
                        text: evidence.text,
                        createdAt: evidence.createdAt.toISOString(),
                    })
                ),
                encryptionKeyVersion: 1,
                createdAt: this.clock.now(),
            },
        });
        this.metrics.increment('chat_report_total', { reason });
        return { reportId: created.id, status: 'RECEIVED', createdAt: created.createdAt.toISOString() };
    }

    async block(userId: string, blockedUserId: string, tx: Transaction): Promise<object> {
        if (userId === blockedUserId) throw communicationError('VALIDATION_FAILED', 400);
        const user = await tx.user.findUnique({ where: { id: blockedUserId }, select: { id: true } });
        if (user === null) throw communicationError('VALIDATION_FAILED', 400);
        const row = await tx.communicationBlock.upsert({
            where: { blockerId_blockedUserId: { blockerId: userId, blockedUserId } },
            create: { blockerId: userId, blockedUserId },
            update: {},
        });
        const now = this.clock.now();
        await tx.joinRequest.updateMany({
            where: {
                state: 'PENDING',
                OR: [
                    { requesterId: userId, match: { organizerId: blockedUserId } },
                    { requesterId: blockedUserId, match: { organizerId: userId } },
                ],
            },
            data: { state: 'EXPIRED', decidedAt: now },
        });
        await tx.waitlistEntry.updateMany({
            where: {
                state: { in: ['WAITING', 'OFFERED'] },
                OR: [
                    { playerId: userId, match: { organizerId: blockedUserId } },
                    { playerId: blockedUserId, match: { organizerId: userId } },
                ],
            },
            data: { state: 'SKIPPED', resolvedAt: now, offeredTeam: null, offeredAt: null, offerExpiresAt: null },
        });
        await this.blockAudit(tx, userId, 'communication.block.created', blockedUserId);
        return { blockedUserId, createdAt: row.createdAt.toISOString() };
    }

    async unblock(userId: string, blockedUserId: string, tx: Transaction): Promise<void> {
        const removed = await tx.communicationBlock.deleteMany({ where: { blockerId: userId, blockedUserId } });
        if (removed.count > 0) await this.blockAudit(tx, userId, 'communication.block.revoked', blockedUserId);
    }

    private async blockAudit(tx: Transaction, actorId: string, action: string, targetId: string): Promise<void> {
        const context = this.context.get();
        const requestId = context?.requestId ?? uuidV7();
        await this.audit.append(tx, {
            actorType: 'USER',
            actorId,
            action,
            targetType: 'COMMUNICATION_BLOCK',
            targetId,
            outcome: 'SUCCEEDED',
            changedFields: { fields: ['state'] },
            requestId,
            correlationId: context?.correlationId ?? requestId,
            source: 'API',
        });
    }

    async listNotifications(userId: string, cursor: string | undefined, limit: number): Promise<object> {
        const decoded =
            cursor === undefined ? undefined : this.cursors.decode<NotificationCursor>(cursor, 'notification');
        if (decoded !== undefined && decoded.userId !== userId) throw communicationError('INVALID_CURSOR', 400);
        const rows = await this.prisma.notification.findMany({
            where: {
                recipientId: userId,
                expiresAt: { gt: this.clock.now() },
                ...(decoded === undefined
                    ? {}
                    : {
                          OR: [
                              { createdAt: { lt: new Date(decoded.createdAt) } },
                              { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
                          ],
                      }),
            },
            include: { deliveries: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
        });
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return {
            items: items.map((item) => this.projectNotification(item)),
            pageInfo: {
                hasNext: rows.length > limit,
                nextCursor:
                    rows.length > limit && last !== undefined
                        ? this.cursors.encode({
                              type: 'notification',
                              userId,
                              createdAt: last.createdAt.toISOString(),
                              id: last.id,
                          })
                        : null,
            },
        };
    }

    async readNotification(userId: string, notificationId: string, tx: Transaction): Promise<object> {
        const notification = await tx.notification.findFirst({ where: { id: notificationId, recipientId: userId } });
        if (notification === null) throw communicationError('NOTIFICATION_NOT_FOUND', 404);
        const readAt = notification.readAt ?? this.clock.now();
        if (notification.readAt === null)
            await tx.notification.update({ where: { id: notificationId }, data: { readAt } });
        return { notificationId, readAt: readAt.toISOString() };
    }

    async preferences(userId: string): Promise<object> {
        const preference = await this.ensurePreferences(userId, this.prisma);
        return this.projectPreference(preference);
    }

    async updatePreferences(userId: string, body: UpdateNotificationPreferenceDto, tx: Transaction): Promise<object> {
        this.assertLocaleAndTimeZone(body.locale, body.timeZone);
        const preference = await this.ensurePreferences(userId, tx);
        if (preference.version !== body.expectedVersion) throw communicationError('PREFERENCE_VERSION_CONFLICT', 409);
        const unique = new Map(body.channels.map((item) => [`${item.category}:${item.channel}`, item]));
        if (unique.size !== body.channels.length) throw communicationError('VALIDATION_FAILED', 400);
        const enabledProviders = new Set(body.channels.filter((item) => item.enabled).map((item) => item.channel));
        for (const item of body.channels) {
            if (item.channel === NotificationChannelDto.IN_APP && !item.enabled)
                throw communicationError('VALIDATION_FAILED', 400);
        }
        const identities = await tx.identity.findMany({ where: { userId }, select: { provider: true } });
        if (
            enabledProviders.has(NotificationChannelDto.EMAIL) &&
            !identities.some((item) => item.provider === IdentityProvider.EMAIL)
        )
            throw communicationError('VALIDATION_FAILED', 400);
        if (
            enabledProviders.has(NotificationChannelDto.TELEGRAM) &&
            !identities.some((item) => item.provider === IdentityProvider.TELEGRAM)
        )
            throw communicationError('VALIDATION_FAILED', 400);
        const now = this.clock.now();
        await tx.notificationPreference.update({
            where: { userId },
            data: {
                version: { increment: 1 },
                locale: body.locale,
                timeZone: body.timeZone,
                tzdataVersion: process.versions.tz ?? 'system',
                quietHoursEnabled: body.quietHours.enabled,
                quietHoursStart: this.time(body.quietHours.startLocal),
                quietHoursEnd: this.time(body.quietHours.endLocal),
                updatedAt: now,
            },
        });
        for (const category of CATEGORIES) {
            for (const channel of CHANNELS) {
                const supplied = unique.get(`${category}:${channel}`);
                const enabled = channel === NotificationChannel.IN_APP ? true : supplied?.enabled === true;
                await tx.notificationPreferenceChannel.upsert({
                    where: { userId_category_channel: { userId, category, channel } },
                    create: { userId, category, channel, enabled, updatedAt: now },
                    update: { enabled, updatedAt: now },
                });
            }
        }
        return this.projectPreference(await this.ensurePreferences(userId, tx));
    }

    async bindDevice(userId: string, body: BindNotificationDeviceDto, tx: Transaction): Promise<object> {
        const existing = await tx.notificationDevice.findUnique({ where: { installationId: body.installationId } });
        if (existing !== null && existing.userId !== userId) throw communicationError('VALIDATION_FAILED', 400);
        if (existing?.revokedAt) throw communicationError('VALIDATION_FAILED', 400);
        const row = await tx.notificationDevice.upsert({
            where: { installationId: body.installationId },
            create: { installationId: body.installationId, userId, platform: body.platform },
            update: { platform: body.platform, lastSeenAt: this.clock.now() },
            include: {
                pushRegistrations: {
                    where: { revokedAt: null, expiresAt: { gt: this.clock.now() } },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });
        return this.projectDevice(row, row.pushRegistrations[0] ?? null);
    }

    async unbindDevice(userId: string, installationId: string, tx: Transaction): Promise<void> {
        const revoked = await tx.notificationDevice.updateMany({
            where: { installationId, userId, revokedAt: null },
            data: { revokedAt: this.clock.now() },
        });
        if (revoked.count !== 1) throw communicationError('NOTIFICATION_DEVICE_NOT_FOUND', 404);
    }

    async listDevices(userId: string): Promise<object> {
        const rows = await this.prisma.notificationDevice.findMany({
            where: { userId },
            include: {
                pushRegistrations: {
                    where: { revokedAt: null, expiresAt: { gt: this.clock.now() } },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: [{ createdAt: 'desc' }, { installationId: 'desc' }],
        });
        return {
            items: rows.map((row) => this.projectDevice(row, row.pushRegistrations[0] ?? null)),
        };
    }

    async registerPushToken(
        userId: string,
        installationId: string,
        body: RegisterPushTokenDto,
        tx: Transaction
    ): Promise<object> {
        const now = this.clock.now();
        const device = await tx.notificationDevice.findFirst({
            where: { installationId, userId, platform: 'MOBILE', revokedAt: null },
        });
        if (device === null) throw communicationError('NOTIFICATION_DEVICE_NOT_FOUND', 404);
        const tokenKey = this.crypto.tokenKey(body.environment, body.token);
        const active = await tx.pushRegistration.findFirst({
            where: { installationId, environment: body.environment, revokedAt: null },
        });
        const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60_000);
        if (active?.tokenKey === tokenKey) {
            const updated = await tx.pushRegistration.update({
                where: { id: active.id },
                data: { appVersion: body.appVersion, lastSeenAt: now, expiresAt },
            });
            await tx.notificationDevice.update({ where: { installationId }, data: { lastSeenAt: now } });
            return this.projectPushRegistration(updated);
        }
        if (active !== null) {
            await tx.pushRegistration.update({
                where: { id: active.id },
                data: {
                    revokedAt: now,
                    revokeReasonCode: 'TOKEN_ROTATED',
                    tokenKey: null,
                    tokenCiphertext: null,
                },
            });
        }
        try {
            const created = await tx.pushRegistration.create({
                data: {
                    id: uuidV7(),
                    installationId,
                    operatingSystem: body.operatingSystem,
                    environment: body.environment,
                    appVersion: body.appVersion,
                    tokenKey,
                    tokenCiphertext: this.crypto.encrypt(body.token),
                    encryptionKeyVersion: 1,
                    createdAt: now,
                    lastSeenAt: now,
                    expiresAt,
                },
            });
            await tx.notificationDevice.update({ where: { installationId }, data: { lastSeenAt: now } });
            return this.projectPushRegistration(created);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw communicationError('VALIDATION_FAILED', 400);
            }
            throw error;
        }
    }

    async revokePushRegistration(
        userId: string,
        installationId: string,
        registrationId: string,
        tx: Transaction,
        reason = 'USER_REVOKED'
    ): Promise<void> {
        const registration = await tx.pushRegistration.findFirst({
            where: { id: registrationId, installationId, device: { userId } },
        });
        if (registration === null) throw communicationError('PUSH_REGISTRATION_NOT_FOUND', 404);
        if (registration.revokedAt !== null) return;
        await tx.pushRegistration.update({
            where: { id: registrationId },
            data: {
                revokedAt: this.clock.now(),
                revokeReasonCode: reason,
                tokenKey: null,
                tokenCiphertext: null,
            },
        });
    }

    async authorizeConversationId(userId: string, conversationId: string, write: boolean): Promise<MembershipAccess> {
        const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
        if (conversation === null) throw communicationError('CONVERSATION_NOT_FOUND', 404);
        return this.access(userId, conversation.matchId, write);
    }

    async realtimeMessage(userId: string, conversationId: string, sequence: bigint): Promise<object | null> {
        const access = await this.authorizeConversationId(userId, conversationId, false);
        if (sequence > access.accessThroughSequence) return null;
        const message = await this.prisma.chatMessage.findUnique({
            where: { conversationId_sequence: { conversationId, sequence } },
            include: messageInclude,
        });
        if (message === null) return null;
        const projected = (await this.projectMessages(userId, [message]))[0] as
            | { kind?: unknown; text?: unknown; deletedAt?: unknown }
            | undefined;
        if (projected?.kind === ChatMessageKind.USER && projected.text === null && projected.deletedAt === null)
            return null;
        return projected ?? null;
    }

    async realtimeNotification(userId: string, notificationId: string): Promise<object | null> {
        const notification = await this.prisma.notification.findFirst({
            where: { id: notificationId, recipientId: userId },
            include: { deliveries: true },
        });
        return notification === null ? null : this.projectNotification(notification);
    }

    private async mutateMessage(
        userId: string,
        matchId: string,
        messageId: string,
        expectedRevision: number,
        text: string | null,
        kind: 'EDITED' | 'DELETED',
        tx: Transaction
    ): Promise<object> {
        const now = this.clock.now();
        const linked = await tx.chatMessage.findFirst({
            where: { id: messageId, conversation: { matchId } },
            include: messageInclude,
        });
        if (linked === null) throw communicationError('MESSAGE_NOT_FOUND', 404);
        if (
            linked.kind !== ChatMessageKind.USER ||
            linked.authorId !== userId ||
            linked.deletedAt !== null ||
            now.getTime() - linked.createdAt.getTime() > CHAT_EDIT_WINDOW_MS
        )
            throw communicationError('MESSAGE_MUTATION_FORBIDDEN', 403);
        if (linked.currentRevision !== expectedRevision) throw communicationError('MESSAGE_REVISION_CONFLICT', 409);
        const revision = expectedRevision + 1;
        await tx.chatMessageRevision.create({
            data: {
                messageId,
                revision,
                kind: kind as ChatRevisionKind,
                text,
                createdBy: userId,
                createdAt: now,
            },
        });
        const updated = await tx.chatMessage.update({
            where: { id: messageId },
            data: {
                currentRevision: revision,
                editedAt: kind === 'EDITED' ? now : linked.editedAt,
                deletedAt: kind === 'DELETED' ? now : null,
            },
            include: messageInclude,
        });
        await this.chatChanged(tx, updated, kind === 'EDITED' ? 'UPDATED' : 'DELETED', now);
        this.metrics.increment('chat_message_total', { action: kind.toLowerCase() });
        return this.projectMessage(updated, false);
    }

    private async access(
        userId: string,
        matchId: string,
        write: boolean,
        client: PrismaService | Transaction = this.prisma
    ): Promise<MembershipAccess> {
        const conversation = await client.conversation.findUnique({ where: { matchId } });
        if (conversation === null) throw communicationError('CONVERSATION_NOT_FOUND', 404);
        const membership = await client.conversationMembership.findFirst({
            where: { conversationId: conversation.id, userId },
            orderBy: { accessGrantedAt: 'desc' },
        });
        if (membership === null) throw communicationError('CONVERSATION_ACCESS_DENIED', 403);
        const active = membership.accessRevokedAt === null;
        if (!active && (membership.readAccessExpiresAt === null || membership.readAccessExpiresAt <= this.clock.now()))
            throw communicationError('CONVERSATION_ACCESS_DENIED', 403);
        if (
            write &&
            (!active ||
                conversation.state !== ConversationState.WRITABLE ||
                (conversation.writeClosesAt !== null && conversation.writeClosesAt <= this.clock.now()))
        )
            throw communicationError('CONVERSATION_ACCESS_DENIED', 403);
        const accessThroughSequence = membership.accessThroughSequence ?? conversation.latestSequence;
        return {
            id: membership.id,
            conversationId: conversation.id,
            matchId,
            state: conversation.state,
            version: conversation.version,
            latestSequence: conversation.latestSequence,
            lastReadSequence: membership.lastReadSequence,
            accessThroughSequence,
            accessExpiresAt: membership.readAccessExpiresAt,
            active,
        };
    }

    private async projectMessages(userId: string, messages: MessageWithRevision[]): Promise<object[]> {
        const blocked = new Set(
            (
                await this.prisma.communicationBlock.findMany({
                    where: { blockerId: userId },
                    select: { blockedUserId: true },
                })
            ).map((item) => item.blockedUserId)
        );
        return messages.map((message) =>
            this.projectMessage(message, message.authorId !== null && blocked.has(message.authorId))
        );
    }

    private projectMessage(message: MessageWithRevision, blocked: boolean): object {
        const revision = message.revisions[0];
        return {
            id: message.id,
            conversationId: message.conversationId,
            sequence: Number(message.sequence),
            kind: message.kind,
            authorId: message.authorId,
            text:
                message.kind === ChatMessageKind.SYSTEM || blocked || revision?.kind === ChatRevisionKind.DELETED
                    ? null
                    : (revision?.text ?? null),
            systemType: message.systemType,
            revision: message.currentRevision,
            editedAt: message.editedAt?.toISOString() ?? null,
            deletedAt: message.deletedAt?.toISOString() ?? null,
            createdAt: message.createdAt.toISOString(),
        };
    }

    private projectConversation(access: MembershipAccess, unreadCount: number): object {
        return {
            id: access.conversationId,
            matchId: access.matchId,
            state: access.state,
            version: access.version,
            latestSequence: Number(access.latestSequence),
            lastReadSequence: Number(access.lastReadSequence),
            unreadCount,
            accessExpiresAt: access.accessExpiresAt?.toISOString() ?? null,
            accessThroughSequence: access.active ? null : Number(access.accessThroughSequence),
        };
    }

    private chatCursor(
        access: MembershipAccess,
        userId: string,
        direction: 'backward' | 'forward',
        sequence: bigint
    ): string {
        return this.cursors.encode({
            type: 'chat',
            userId,
            conversationId: access.conversationId,
            direction,
            sequence: sequence.toString(),
            accessThroughSequence: access.active ? 'active' : access.accessThroughSequence.toString(),
        });
    }

    private async unreadCount(
        userId: string,
        access: MembershipAccess,
        client: PrismaService | Transaction = this.prisma
    ): Promise<number> {
        const blocked = (
            await client.communicationBlock.findMany({
                where: { blockerId: userId },
                select: { blockedUserId: true },
            })
        ).map((item) => item.blockedUserId);
        return client.chatMessage.count({
            where: {
                conversationId: access.conversationId,
                sequence: { gt: access.lastReadSequence, lte: access.accessThroughSequence },
                OR: [
                    { kind: ChatMessageKind.SYSTEM },
                    {
                        kind: ChatMessageKind.USER,
                        authorId: { not: userId, ...(blocked.length === 0 ? {} : { notIn: blocked }) },
                    },
                ],
            },
        });
    }

    private async chatChanged(
        tx: Transaction,
        message: MessageWithRevision,
        change: 'CREATED' | 'UPDATED' | 'DELETED',
        occurredAt: Date
    ): Promise<void> {
        const request = this.context.get();
        await this.outbox.enqueue(tx, {
            type: 'communication.chat.stream.changed.v1',
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type: 'communication.chat.stream.changed.v1',
                occurredAt: occurredAt.toISOString(),
                correlationId: request?.correlationId ?? uuidV7(),
                data: { conversationId: message.conversationId, chatMessageId: message.id, change },
            },
            correlationId: request?.correlationId ?? uuidV7(),
            occurredAt,
        });
    }

    private async ensurePreferences(userId: string, client: PrismaService | Transaction) {
        let preference = await client.notificationPreference.findUnique({
            where: { userId },
            include: { channels: { orderBy: [{ category: 'asc' }, { channel: 'asc' }] } },
        });
        preference ??= await client.notificationPreference.create({
            data: {
                userId,
                tzdataVersion: process.versions.tz ?? 'system',
                channels: {
                    create: CATEGORIES.flatMap((category) =>
                        CHANNELS.map((channel) => ({
                            category,
                            channel,
                            enabled: channel === NotificationChannel.IN_APP,
                        }))
                    ),
                },
            },
            include: { channels: { orderBy: [{ category: 'asc' }, { channel: 'asc' }] } },
        });
        return preference;
    }

    private projectPreference(preference: Awaited<ReturnType<CommunicationService['ensurePreferences']>>): object {
        return {
            version: preference.version,
            locale: preference.locale,
            timeZone: preference.timeZone,
            tzdataVersion: preference.tzdataVersion,
            quietHours: {
                enabled: preference.quietHoursEnabled,
                startLocal: this.localTime(preference.quietHoursStart),
                endLocal: this.localTime(preference.quietHoursEnd),
            },
            channels: preference.channels.map((item) => ({
                category: item.category,
                channel: item.channel,
                enabled: item.enabled,
            })),
            updatedAt: preference.updatedAt.toISOString(),
        };
    }

    private projectNotification(
        notification: Prisma.NotificationGetPayload<{ include: { deliveries: true } }>
    ): object {
        return {
            id: notification.id,
            type: notification.type,
            category: notification.category,
            route: notification.route,
            mobileTarget: this.mobileTarget(notification.route),
            readAt: notification.readAt?.toISOString() ?? null,
            createdAt: notification.createdAt.toISOString(),
            deliveries: notification.deliveries.map((delivery) => ({
                id: delivery.id,
                channel: delivery.channel,
                status: delivery.status,
                notBefore: delivery.notBefore.toISOString(),
                lastAttemptAt: delivery.claimedAt?.toISOString() ?? null,
                terminalAt: delivery.terminalAt?.toISOString() ?? null,
            })),
        };
    }

    private projectDevice(
        device: {
            installationId: string;
            platform: string;
            createdAt: Date;
            lastSeenAt: Date;
        },
        registration: Prisma.PushRegistrationGetPayload<object> | null
    ): object {
        return {
            installationId: device.installationId,
            platform: device.platform,
            createdAt: device.createdAt.toISOString(),
            lastSeenAt: device.lastSeenAt.toISOString(),
            activePushRegistration: registration === null ? null : this.projectPushRegistration(registration),
        };
    }

    private projectPushRegistration(registration: Prisma.PushRegistrationGetPayload<object>): object {
        return {
            id: registration.id,
            installationId: registration.installationId,
            operatingSystem: registration.operatingSystem,
            environment: registration.environment,
            appVersion: registration.appVersion,
            createdAt: registration.createdAt.toISOString(),
            lastSeenAt: registration.lastSeenAt.toISOString(),
            expiresAt: registration.expiresAt.toISOString(),
            revokedAt: registration.revokedAt?.toISOString() ?? null,
        };
    }

    private mobileTarget(route: string): object | null {
        const chat = /^matches\/([0-9a-f-]{36})\/chat$/iu.exec(route);
        if (chat?.[1] !== undefined) return { kind: 'MATCH_CHAT', matchId: chat[1] };
        const match = /^matches\/([0-9a-f-]{36})$/iu.exec(route);
        if (match?.[1] !== undefined) return { kind: 'MATCH', matchId: match[1] };
        return null;
    }

    private assertText(text: string): void {
        if (text !== text.normalize('NFKC').trim() || text.length < 1 || text.length > 2000 || /[\p{Cc}]/u.test(text)) {
            throw communicationError('VALIDATION_FAILED', 400);
        }
    }

    private assertLocaleAndTimeZone(locale: string, timeZone: string): void {
        try {
            if (Intl.getCanonicalLocales(locale)[0] !== locale) throw new Error();
            new Intl.DateTimeFormat(locale, { timeZone }).format(this.clock.now());
        } catch {
            throw communicationError('VALIDATION_FAILED', 400);
        }
    }

    private time(value: string): Date {
        return new Date(`1970-01-01T${value}:00.000Z`);
    }

    private localTime(value: Date): string {
        return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
    }

    private bigint(value: string): bigint {
        try {
            const parsed = BigInt(value);
            if (parsed < 0n) throw new Error();
            return parsed;
        } catch {
            throw communicationError('INVALID_CURSOR', 400);
        }
    }
}
