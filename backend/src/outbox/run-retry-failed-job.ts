import 'dotenv/config';

import { Queue } from 'bullmq';

import { getEnvironment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';

const QUEUES = {
    outbox: 'platform-outbox-v1',
    match_statistics: 'match-statistics-v1',
    communications: 'communication-events-v1',
    profile_statistics: 'profile-statistics-v1',
    gamification: 'gamification-events-v1',
    notification_delivery: 'notification-delivery-v1',
    content_ingestion: 'content-ingestion-v1',
} as const;

async function run(): Promise<void> {
    const environment = getEnvironment();
    const queueKeyInput = process.argv[2];
    const jobId = process.argv[3];
    if (queueKeyInput === undefined || !(queueKeyInput in QUEUES) || jobId === undefined || jobId.length > 128)
        throw new Error('An allowlisted queue key and one bounded job ID are required');
    const queueKey = queueKeyInput as keyof typeof QUEUES;
    const redis = new RedisService(environment);
    const queue = new Queue(`${environment.REDIS_NAMESPACE}-${QUEUES[queueKey]}`, { connection: redis.client });
    try {
        const job = await queue.getJob(jobId);
        if (job === undefined || (await job.getState()) !== 'failed') {
            process.stdout.write(`${JSON.stringify({ event: 'queue.operator_retry', queue: queueKey, updated: 0 })}\n`);
            process.exitCode = 2;
            return;
        }
        await job.retry('failed');
        process.stdout.write(`${JSON.stringify({ event: 'queue.operator_retry', queue: queueKey, updated: 1 })}\n`);
    } finally {
        await queue.close();
        await redis.onModuleDestroy();
    }
}

void run().catch(() => {
    process.stderr.write(`${JSON.stringify({ level: 'error', event: 'queue.operator_retry.failed' })}\n`);
    process.exitCode = 1;
});
