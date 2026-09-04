import { Inject, Injectable } from '@nestjs/common';
import { Prisma, OutboxStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { OutboxQueueService } from './outbox-queue.service';

interface ClaimedEvent {
    id: string;
    type: string;
    schemaVersion: number;
    attempts: number;
}

@Injectable()
export class OutboxDispatcherService {
    private readonly dispatcherId = randomUUID();

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly prisma: PrismaService,
        private readonly queue: OutboxQueueService,
        private readonly logger: ApplicationLogger
    ) {}

    async dispatchBatch(): Promise<number> {
        const events = await this.claimBatch();
        await Promise.all(events.map((event) => this.publish(event)));
        return events.length;
    }

    private async claimBatch(): Promise<ClaimedEvent[]> {
        const staleBefore = new Date(Date.now() - this.environment.OUTBOX_CLAIM_TTL_MS);
        return this.prisma.$transaction((transaction) =>
            transaction.$queryRaw<ClaimedEvent[]>(Prisma.sql`
                WITH candidates AS (
                    SELECT id
                    FROM outbox_events
                    WHERE (
                        (status = 'PENDING' AND available_at <= CURRENT_TIMESTAMP)
                        OR (status = 'PROCESSING' AND claimed_at < ${staleBefore})
                    )
                    ORDER BY occurred_at, id
                    FOR UPDATE SKIP LOCKED
                    LIMIT ${this.environment.OUTBOX_BATCH_SIZE}
                )
                UPDATE outbox_events AS event
                SET status = 'PROCESSING',
                    claimed_at = CURRENT_TIMESTAMP,
                    claimed_by = ${this.dispatcherId}::uuid,
                    attempts = event.attempts + 1,
                    last_error_code = NULL
                FROM candidates
                WHERE event.id = candidates.id
                RETURNING event.id, event.type, event.schema_version AS "schemaVersion", event.attempts
            `)
        );
    }

    private async publish(event: ClaimedEvent): Promise<void> {
        try {
            await this.queue.publish({
                eventId: event.id,
                type: event.type,
                schemaVersion: event.schemaVersion,
            });
            await this.prisma.outboxEvent.updateMany({
                where: {
                    id: event.id,
                    claimedBy: this.dispatcherId,
                    status: OutboxStatus.PROCESSING,
                },
                data: {
                    status: OutboxStatus.PUBLISHED,
                    publishedAt: new Date(),
                    claimedAt: null,
                    claimedBy: null,
                },
            });
        } catch {
            await this.scheduleRetry(event);
            this.logger.warn(
                {
                    event: 'outbox.publish.failed',
                    eventId: event.id,
                    eventType: event.type,
                    attempt: event.attempts,
                    errorCode: 'OUTBOX_PUBLISH_FAILED',
                },
                OutboxDispatcherService.name
            );
        }
    }

    private async scheduleRetry(event: ClaimedEvent): Promise<void> {
        const quarantined = event.attempts >= this.environment.OUTBOX_MAX_ATTEMPTS;
        const baseDelayMs = Math.min(60_000, 2 ** Math.min(event.attempts, 10) * 100);
        const jitterMs = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelayMs / 4)));

        await this.prisma.outboxEvent.updateMany({
            where: {
                id: event.id,
                claimedBy: this.dispatcherId,
                status: OutboxStatus.PROCESSING,
            },
            data: {
                status: quarantined ? OutboxStatus.QUARANTINED : OutboxStatus.PENDING,
                availableAt: new Date(Date.now() + baseDelayMs + jitterMs),
                claimedAt: null,
                claimedBy: null,
                lastErrorCode: 'OUTBOX_PUBLISH_FAILED',
            },
        });
    }
}
