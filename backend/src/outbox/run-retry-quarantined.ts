import 'dotenv/config';

import { OutboxStatus } from '@prisma/client';

import { getEnvironment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

async function run(): Promise<void> {
    const eventId = process.argv[2]?.toLowerCase();
    if (eventId === undefined || !UUID_PATTERN.test(eventId))
        throw new Error('A single valid outbox event ID is required');
    const prisma = new PrismaService(getEnvironment());
    await prisma.onModuleInit();
    try {
        const result = await prisma.outboxEvent.updateMany({
            where: { id: eventId, status: OutboxStatus.QUARANTINED },
            data: {
                status: OutboxStatus.PENDING,
                attempts: 0,
                availableAt: new Date(),
                claimedAt: null,
                claimedBy: null,
                lastErrorCode: 'OPERATOR_RETRY_APPROVED',
            },
        });
        process.stdout.write(`${JSON.stringify({ event: 'outbox.operator_retry', updated: result.count })}\n`);
        if (result.count !== 1) process.exitCode = 2;
    } finally {
        await prisma.onModuleDestroy();
    }
}

void run().catch(() => {
    process.stderr.write(`${JSON.stringify({ level: 'error', event: 'outbox.operator_retry.failed' })}\n`);
    process.exitCode = 1;
});
