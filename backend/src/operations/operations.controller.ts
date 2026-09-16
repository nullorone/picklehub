import { createHash, timingSafeEqual } from 'node:crypto';

import {
    Controller,
    Get,
    Headers,
    Inject,
    Res,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { OutboxQueueService } from '../outbox/outbox-queue.service';
import { OperationalMetricsService } from './operational-metrics.service';

function digest(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}

@Controller('operations')
export class OperationsController {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly prisma: PrismaService,
        private readonly queues: OutboxQueueService,
        private readonly metrics: OperationalMetricsService
    ) {}

    @Get('metrics')
    async scrape(
        @Headers('x-operations-key') suppliedKey: string | undefined,
        @Res({ passthrough: true }) response: Response
    ): Promise<string> {
        response.setHeader('Cache-Control', 'no-store');
        const expectedKey = this.environment.OPERATIONS_METRICS_KEY;
        if (
            expectedKey === undefined ||
            suppliedKey === undefined ||
            !timingSafeEqual(digest(suppliedKey), digest(expectedKey))
        ) {
            throw new UnauthorizedException();
        }

        response.setHeader('Content-Type', 'application/openmetrics-text; version=1.0.0; charset=utf-8');
        response.setHeader('X-Metrics-Schema-Version', '1');
        try {
            return this.metrics.render(await this.databaseMetrics());
        } catch {
            response.setHeader('Retry-After', '5');
            throw new ServiceUnavailableException();
        }
    }

    private async databaseMetrics(): Promise<string[]> {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(new Error('METRICS_COLLECTION_TIMEOUT'));
            }, this.environment.DEPENDENCY_TIMEOUT_MS);
        });
        try {
            return await Promise.race([this.queryDatabaseMetrics(), timeout]);
        } finally {
            if (timer !== undefined) clearTimeout(timer);
        }
    }

    private async queryDatabaseMetrics(): Promise<string[]> {
        interface StatusCount {
            status: string;
            count: bigint;
        }
        const [outbox, lifecycle, reconciliation, queues] = await Promise.all([
            this.prisma.$queryRaw<StatusCount[]>(Prisma.sql`
                SELECT status::text AS status, COUNT(*)::bigint AS count
                FROM outbox_events
                GROUP BY status
            `),
            this.prisma.$queryRaw<StatusCount[]>(Prisma.sql`
                SELECT state::text AS status, COUNT(*)::bigint AS count
                FROM data_lifecycle_tasks
                GROUP BY state
            `),
            this.prisma.$queryRaw<StatusCount[]>(Prisma.sql`
                SELECT state::text AS status, COUNT(*)::bigint AS count
                FROM reconciliation_runs
                GROUP BY state
            `),
            this.queues.operationalCounts(),
        ]);
        const oldest = await this.prisma.$queryRaw<{ seconds: number | null }[]>(Prisma.sql`
            SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(occurred_at)))::double precision AS seconds
            FROM outbox_events
            WHERE status::text IN ('PENDING', 'PROCESSING')
        `);
        return [
            '# HELP picklehub_outbox_events Current durable outbox events by state.',
            '# TYPE picklehub_outbox_events gauge',
            ...outbox.map((row) => `picklehub_outbox_events{state="${row.status}"} ${String(row.count)}`),
            '# HELP picklehub_outbox_oldest_unpublished_seconds Age of the oldest durable unpublished event.',
            '# TYPE picklehub_outbox_oldest_unpublished_seconds gauge',
            `picklehub_outbox_oldest_unpublished_seconds ${String(oldest[0]?.seconds ?? 0)}`,
            '# HELP picklehub_privacy_tasks Current lifecycle tasks by state.',
            '# TYPE picklehub_privacy_tasks gauge',
            ...lifecycle.map((row) => `picklehub_privacy_tasks{state="${row.status}"} ${String(row.count)}`),
            '# HELP picklehub_reconciliation_runs Current reconciliation runs by state.',
            '# TYPE picklehub_reconciliation_runs gauge',
            ...reconciliation.map((row) => `picklehub_reconciliation_runs{state="${row.status}"} ${String(row.count)}`),
            '# HELP picklehub_queue_jobs Current BullMQ jobs by allowlisted queue and state.',
            '# TYPE picklehub_queue_jobs gauge',
            ...queues.flatMap((queue) =>
                (['waiting', 'active', 'delayed', 'failed'] as const).map(
                    (state) => `picklehub_queue_jobs{queue="${queue.queue}",state="${state}"} ${String(queue[state])}`
                )
            ),
        ];
    }
}
