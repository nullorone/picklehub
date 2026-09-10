import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ChatMessageKind, ChatRevisionKind, NotificationCategory, NotificationChannel, Prisma } from '@prisma/client';
import { Worker } from 'bullmq';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { RedisService } from '../common/redis/redis.service';
import type { OutboxJobData } from '../outbox/outbox-queue.service';
import { CommunicationMetricsService } from './communication-metrics.service';

const CONSUMER = 'chat-notification-projector-v1';

interface EventPayload {
    data?: Record<string, unknown>;
}

interface Projection {
    conversationId?: string;
    sequence?: bigint;
    notificationIds: string[];
}

const EVENT_POLICY: Record<
    string,
    { systemType?: string; notificationType?: string; category?: NotificationCategory; terminal?: boolean }
> = {
    'match.roster.changed.v1': {
        systemType: 'ROSTER_JOINED',
        notificationType: 'ROSTER_CHANGED',
        category: NotificationCategory.ROSTER,
    },
    'match.cancelled.v1': {
        systemType: 'MATCH_CANCELLED',
        notificationType: 'MATCH_CANCELLED',
        category: NotificationCategory.MATCH_CRITICAL,
        terminal: true,
    },
    'match.started.v1': {
        systemType: 'MATCH_STARTED',
        notificationType: 'MATCH_CHANGED',
        category: NotificationCategory.MATCH_CRITICAL,
    },
    'match.result.proposed.v1': {
        systemType: 'RESULT_PROPOSED',
        notificationType: 'RESULT_ACTION_REQUIRED',
        category: NotificationCategory.RESULTS,
    },
    'match.completed.confirmed.v1': {
        systemType: 'RESULT_CONFIRMED',
        notificationType: 'RESULT_CONFIRMED',
        category: NotificationCategory.RESULTS,
        terminal: true,
    },
    'match.result.disputed.v1': {
        systemType: 'RESULT_DISPUTED',
        notificationType: 'RESULT_DISPUTED',
        category: NotificationCategory.RESULTS,
        terminal: true,
    },
};

@Injectable()
export class CommunicationEventWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private worker: Worker<OutboxJobData> | undefined;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly logger: ApplicationLogger,
        private readonly metrics: CommunicationMetricsService
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE !== 'worker') return;
        this.worker = new Worker<OutboxJobData>(
            `${this.environment.REDIS_NAMESPACE}-communication-events-v1`,
            async (job) => this.process(job.data),
            { connection: this.redis.client, concurrency: 4 }
        );
        this.worker.on('failed', (_job, error) => {
            this.metrics.increment('communication_event_failure_total');
            this.logger.error(error, undefined, CommunicationEventWorkerService.name);
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
    }

    async process(job: OutboxJobData): Promise<void> {
        if (job.schemaVersion !== 1) return;
        const projection = await this.prisma.$transaction(async (tx) => {
            const receipt = await tx.$queryRaw<{ eventId: string }[]>(Prisma.sql`
                INSERT INTO communication_event_receipts (consumer_key, event_id)
                VALUES (${CONSUMER}, ${job.eventId}::uuid) ON CONFLICT DO NOTHING
                RETURNING event_id AS "eventId"`);
            if (receipt.length === 0) return null;
            const event = await tx.outboxEvent.findUniqueOrThrow({ where: { id: job.eventId } });
            if (event.type !== job.type || event.schemaVersion !== job.schemaVersion)
                throw new Error('Communication event envelope mismatch');
            const data = (event.payload as EventPayload).data ?? {};
            if (job.type === 'communication.chat.stream.changed.v1') {
                return this.projectChatNotification(tx, job.eventId, data);
            }
            const matchId = data.matchId;
            if (typeof matchId !== 'string') return { notificationIds: [] };
            return this.projectMatchEvent(tx, job.eventId, job.type, matchId, event.occurredAt);
        });
        if (projection === null) {
            this.metrics.increment('communication_event_duplicate_total');
            return;
        }
        try {
            if (projection.conversationId !== undefined && projection.sequence !== undefined) {
                await this.redis.client.publish(
                    `${this.environment.REDIS_NAMESPACE}:communication:realtime`,
                    JSON.stringify({
                        conversationId: projection.conversationId,
                        sequence: projection.sequence.toString(),
                    })
                );
            }
            for (const notificationId of projection.notificationIds) {
                await this.redis.client.publish(
                    `${this.environment.REDIS_NAMESPACE}:communication:notifications`,
                    JSON.stringify({ notificationId })
                );
            }
        } catch {
            this.metrics.increment('communication_realtime_publish_failure_total');
        }
    }

    private async projectMatchEvent(
        tx: Prisma.TransactionClient,
        eventId: string,
        eventType: string,
        matchId: string,
        occurredAt: Date
    ): Promise<Projection> {
        const policy = EVENT_POLICY[eventType];
        if (eventType === 'match.published.v1') {
            const conversation = await this.ensureConversation(tx, matchId, occurredAt);
            await this.synchronizeMemberships(tx, conversation.id);
            return { notificationIds: [] };
        }
        if (policy === undefined) return { notificationIds: [] };
        const conversation = await this.ensureConversation(tx, matchId, occurredAt);
        let membershipChange: 'joined' | 'left' | undefined;
        if (eventType === 'match.roster.changed.v1')
            membershipChange = await this.membershipChange(tx, conversation.id);
        if (policy.terminal === true) {
            await tx.conversation.update({
                where: { id: conversation.id },
                data:
                    eventType === 'match.cancelled.v1' || eventType === 'match.result.disputed.v1'
                        ? {
                              state: 'READ_ONLY',
                              writeClosesAt: occurredAt,
                              retentionExpiresAt: new Date(occurredAt.getTime() + 180 * 86_400_000),
                          }
                        : {
                              writeClosesAt: new Date(occurredAt.getTime() + 7 * 86_400_000),
                              retentionExpiresAt: new Date(occurredAt.getTime() + 180 * 86_400_000),
                          },
            });
        }
        const systemType =
            eventType === 'match.roster.changed.v1' && membershipChange === 'left' ? 'ROSTER_LEFT' : policy.systemType;
        let sequence: bigint | undefined;
        if (systemType !== undefined) {
            const message = await tx.chatMessage.create({
                data: {
                    id: uuidV7(),
                    conversationId: conversation.id,
                    sequence: 1n,
                    kind: ChatMessageKind.SYSTEM,
                    systemType,
                    sourceEventId: eventId,
                    createdAt: occurredAt,
                    revisions: {
                        create: {
                            revision: 1,
                            kind: ChatRevisionKind.CREATED,
                            text: systemType,
                            createdAt: occurredAt,
                        },
                    },
                },
            });
            sequence = message.sequence;
        }
        if (eventType === 'match.roster.changed.v1') await this.synchronizeMemberships(tx, conversation.id);
        const recipients = await tx.matchParticipant.findMany({
            where: { matchId },
            distinct: ['userId'],
            select: { userId: true },
        });
        const notificationIds =
            policy.notificationType === undefined || policy.category === undefined
                ? []
                : await this.fanout(
                      tx,
                      eventId,
                      recipients.map((item) => item.userId),
                      policy.notificationType,
                      policy.category,
                      `matches/${matchId}`,
                      occurredAt
                  );
        return {
            conversationId: conversation.id,
            ...(sequence === undefined ? {} : { sequence }),
            notificationIds,
        };
    }

    private async projectChatNotification(
        tx: Prisma.TransactionClient,
        eventId: string,
        data: Record<string, unknown>
    ): Promise<Projection> {
        if (data.change !== 'CREATED' || typeof data.chatMessageId !== 'string') return { notificationIds: [] };
        const message = await tx.chatMessage.findUnique({
            where: { id: data.chatMessageId },
            include: { conversation: true },
        });
        if (message?.authorId == null) return { notificationIds: [] };
        const members = await tx.conversationMembership.findMany({
            where: { conversationId: message.conversationId, accessRevokedAt: null, userId: { not: message.authorId } },
            select: { userId: true },
        });
        const notificationIds = await this.fanout(
            tx,
            eventId,
            members.map((item) => item.userId),
            'CHAT_MESSAGE',
            NotificationCategory.CHAT,
            `matches/${message.conversation.matchId}/chat`,
            message.createdAt
        );
        return { conversationId: message.conversationId, sequence: message.sequence, notificationIds };
    }

    private async ensureConversation(tx: Prisma.TransactionClient, matchId: string, now: Date) {
        const conversation = await tx.conversation.upsert({
            where: { matchId },
            create: { id: uuidV7(), matchId, createdAt: now, updatedAt: now },
            update: {},
        });
        return conversation;
    }

    private async synchronizeMemberships(
        tx: Prisma.TransactionClient,
        conversationId: string
    ): Promise<'joined' | 'left' | undefined> {
        const conversation = await tx.conversation.findUniqueOrThrow({
            where: { id: conversationId },
            include: { match: { include: { participants: { where: { state: 'ACTIVE' } } } } },
        });
        const activeUsers = new Set(conversation.match.participants.map((item) => item.userId));
        const memberships = await tx.conversationMembership.findMany({
            where: { conversationId, accessRevokedAt: null },
        });
        const existingUsers = new Set(memberships.map((item) => item.userId));
        const now = new Date();
        let joined = false;
        let left = false;
        for (const userId of activeUsers) {
            if (!existingUsers.has(userId)) {
                await tx.conversationMembership.create({
                    data: { id: uuidV7(), conversationId, userId, accessGrantedAt: now },
                });
                joined = true;
            }
        }
        for (const membership of memberships) {
            if (!activeUsers.has(membership.userId)) {
                await tx.conversationMembership.update({
                    where: { id: membership.id },
                    data: {
                        accessRevokedAt: now,
                        accessThroughSequence: conversation.latestSequence,
                        readAccessExpiresAt: new Date(now.getTime() + 30 * 86_400_000),
                    },
                });
                left = true;
            }
        }
        return joined ? 'joined' : left ? 'left' : undefined;
    }

    private async membershipChange(
        tx: Prisma.TransactionClient,
        conversationId: string
    ): Promise<'joined' | 'left' | undefined> {
        const conversation = await tx.conversation.findUniqueOrThrow({
            where: { id: conversationId },
            include: { match: { include: { participants: { where: { state: 'ACTIVE' } } } } },
        });
        const activeUsers = new Set(conversation.match.participants.map((item) => item.userId));
        const memberships = await tx.conversationMembership.findMany({
            where: { conversationId, accessRevokedAt: null },
            select: { userId: true },
        });
        if (memberships.some((item) => !activeUsers.has(item.userId))) return 'left';
        return conversation.match.participants.some(
            (item) => !memberships.some((member) => member.userId === item.userId)
        )
            ? 'joined'
            : undefined;
    }

    private async fanout(
        tx: Prisma.TransactionClient,
        sourceEventId: string,
        recipientIds: string[],
        type: string,
        category: NotificationCategory,
        route: string,
        createdAt: Date
    ): Promise<string[]> {
        const notificationIds: string[] = [];
        for (const recipientId of new Set(recipientIds)) {
            const notification = await tx.notification.upsert({
                where: { recipientId_sourceEventId_type: { recipientId, sourceEventId, type } },
                create: { id: uuidV7(), recipientId, sourceEventId, type, category, route, createdAt },
                update: {},
            });
            notificationIds.push(notification.id);
            const preference = await tx.notificationPreference.findUnique({
                where: { userId: recipientId },
                include: { channels: { where: { category, enabled: true } } },
            });
            if (preference === null) continue;
            for (const channel of preference.channels) {
                if (channel.channel === NotificationChannel.IN_APP) continue;
                await tx.notificationDelivery.upsert({
                    where: { notificationId_channel: { notificationId: notification.id, channel: channel.channel } },
                    create: {
                        id: uuidV7(),
                        notificationId: notification.id,
                        channel: channel.channel,
                        idempotencyKey: uuidV7(),
                        notBefore:
                            type === 'MATCH_CANCELLED' || type === 'RESULT_DISPUTED'
                                ? createdAt
                                : this.notBefore(preference, createdAt),
                    },
                    update: {},
                });
            }
        }
        this.metrics.increment('logical_notification_total', { category, type });
        return notificationIds;
    }

    private notBefore(
        preference: { quietHoursEnabled: boolean; quietHoursStart: Date; quietHoursEnd: Date; timeZone: string },
        now: Date
    ): Date {
        if (!preference.quietHoursEnabled) return now;
        const start = preference.quietHoursStart.getUTCHours() * 60 + preference.quietHoursStart.getUTCMinutes();
        const end = preference.quietHoursEnd.getUTCHours() * 60 + preference.quietHoursEnd.getUTCMinutes();
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: preference.timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        const quiet = (instant: Date): boolean => {
            const parts = formatter.formatToParts(instant);
            const local =
                Number(parts.find((item) => item.type === 'hour')?.value ?? 0) * 60 +
                Number(parts.find((item) => item.type === 'minute')?.value ?? 0);
            return start < end ? local >= start && local < end : local >= start || local < end;
        };
        if (!quiet(now)) return now;
        const firstWholeMinute = Math.ceil(now.getTime() / 60_000) * 60_000;
        for (let minute = 0; minute <= 26 * 60; minute += 1) {
            const candidate = new Date(firstWholeMinute + minute * 60_000);
            if (!quiet(candidate)) return candidate;
        }
        return new Date(now.getTime() + 24 * 60 * 60_000);
    }
}
