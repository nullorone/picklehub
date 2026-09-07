import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { uuidV7 } from '../common/identifiers/uuid-v7';

export interface AppendAuditEntry {
    actorType: string;
    actorId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    outcome: string;
    reasonCode?: string;
    changedFields: Prisma.InputJsonObject;
    requestId: string;
    correlationId: string;
    source: string;
}

@Injectable()
export class AuditService {
    async append(transaction: Prisma.TransactionClient, entry: AppendAuditEntry): Promise<string> {
        const id = uuidV7();
        await transaction.auditEntry.create({
            data: {
                id,
                ...entry,
            },
        });
        return id;
    }
}
