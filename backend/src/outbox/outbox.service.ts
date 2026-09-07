import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { uuidV7 } from '../common/identifiers/uuid-v7';

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9]+)*\.v[1-9][0-9]*$/u;

export interface EnqueueOutboxEvent {
    type: string;
    schemaVersion: number;
    payload: Prisma.InputJsonValue;
    correlationId: string;
    causationId?: string;
    occurredAt: Date;
}

@Injectable()
export class OutboxService {
    async enqueue(transaction: Prisma.TransactionClient, event: EnqueueOutboxEvent): Promise<string> {
        if (!EVENT_TYPE_PATTERN.test(event.type)) {
            throw new Error('Outbox event type must be versioned, for example entity.changed.v1');
        }
        if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) {
            throw new Error('Outbox schema version must be a positive integer');
        }

        const id = uuidV7();
        await transaction.outboxEvent.create({
            data: {
                id,
                ...event,
            },
        });
        return id;
    }
}
