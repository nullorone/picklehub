import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { AuditService } from '../../src/audit/audit.service';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { OutboxDispatcherService } from '../../src/outbox/outbox-dispatcher.service';
import { OutboxService } from '../../src/outbox/outbox.service';

interface HealthBody {
    status: 'ok' | 'not_ready';
    checkedAt: string;
    requestId: string;
}

function isHealthBody(value: unknown): value is HealthBody {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const body = value as Record<string, unknown>;
    return typeof body.status === 'string' && typeof body.checkedAt === 'string' && typeof body.requestId === 'string';
}

describe('platform foundation', () => {
    let application: INestApplication | undefined;
    let prisma: PrismaService;

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        const testApplication = module.createNestApplication();
        configureApplication(testApplication);
        await testApplication.init();
        application = testApplication;
        prisma = testApplication.get(PrismaService);
    });

    afterAll(async () => {
        await application?.close();
    });

    it('serves contract-compatible liveness and readiness responses', async () => {
        const httpServer = application?.getHttpServer() as unknown as Server;
        const liveness = await request(httpServer).get('/v1/health/live').set('X-Request-ID', 'not-a-uuid').expect(200);

        expect(liveness.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/u);
        expect(liveness.headers['x-correlation-id']).toBe(liveness.headers['x-request-id']);
        expect(liveness.headers['content-language']).toBe('ru-RU');
        const livenessBody: unknown = liveness.body;
        expect(isHealthBody(livenessBody)).toBe(true);
        if (!isHealthBody(livenessBody)) {
            throw new Error('Liveness response does not match the contract');
        }
        expect(livenessBody.status).toBe('ok');
        expect(livenessBody.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/u);
        expect(livenessBody.requestId).toBe(liveness.headers['x-request-id']);

        const readiness = await request(httpServer).get('/v1/health/ready').expect(200);
        const readinessBody: unknown = readiness.body;
        expect(isHealthBody(readinessBody)).toBe(true);
        if (!isHealthBody(readinessBody)) {
            throw new Error('Readiness response does not match the contract');
        }
        expect(readinessBody.status).toBe('ok');

        const notFound = await request(httpServer).get('/v1/not-a-route').expect(404);
        const notFoundBody: unknown = notFound.body;
        expect(notFoundBody).toEqual({
            error: {
                code: 'NOT_FOUND',
                message: 'Ресурс не найден.',
            },
            requestId: notFound.headers['x-request-id'],
        });
    });

    it('has PostGIS and the platform tables after a clean migration', async () => {
        await expect(prisma.isReady()).resolves.toBe(true);
        const tables = await prisma.$queryRaw<{ table_name: string }[]>`
            SELECT table_name::text AS table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('audit_entries', 'outbox_events')
            ORDER BY table_name
        `;

        expect(tables.map((table) => table.table_name)).toEqual(['audit_entries', 'outbox_events']);
    });

    it('rolls an outbox event back with its owning transaction', async () => {
        const outbox = application?.get(OutboxService);
        if (outbox === undefined) {
            throw new Error('Test application is not initialized');
        }
        const id = uuidV7();

        await expect(
            prisma.$transaction(async (transaction) => {
                await outbox.enqueue(transaction, {
                    type: 'platform.rollback.tested.v1',
                    schemaVersion: 1,
                    payload: { id },
                    correlationId: '8e4398c6-cbee-4386-9871-28206d45ca17',
                    occurredAt: new Date(),
                });
                throw new Error('ROLLBACK_TEST');
            })
        ).rejects.toThrow('ROLLBACK_TEST');

        await expect(prisma.outboxEvent.count({ where: { payload: { path: ['id'], equals: id } } })).resolves.toBe(0);
    });

    it('publishes a claimed outbox event once and marks it as published', async () => {
        const outbox = application?.get(OutboxService);
        const dispatcher = application?.get(OutboxDispatcherService);
        if (outbox === undefined || dispatcher === undefined) {
            throw new Error('Test application is not initialized');
        }
        const eventId = await prisma.$transaction((transaction) =>
            outbox.enqueue(transaction, {
                type: 'platform.dispatch.tested.v1',
                schemaVersion: 1,
                payload: { referenceId: uuidV7() },
                correlationId: '8e4398c6-cbee-4386-9871-28206d45ca17',
                occurredAt: new Date(),
            })
        );

        await expect(dispatcher.dispatchBatch()).resolves.toBeGreaterThanOrEqual(1);
        await expect(dispatcher.dispatchBatch()).resolves.toBe(0);
        await expect(prisma.outboxEvent.findUniqueOrThrow({ where: { id: eventId } })).resolves.toMatchObject({
            status: 'PUBLISHED',
            attempts: 1,
            lastErrorCode: null,
        });

        await prisma.outboxEvent.delete({ where: { id: eventId } });
    });

    it('enforces append-only audit entries in PostgreSQL', async () => {
        const audit = application?.get(AuditService);
        if (audit === undefined) {
            throw new Error('Test application is not initialized');
        }
        const auditId = await prisma.$transaction((transaction) =>
            audit.append(transaction, {
                actorType: 'SYSTEM',
                action: 'platform.integration_tested',
                targetType: 'platform',
                outcome: 'SUCCEEDED',
                changedFields: {},
                requestId: 'b85e2f1a-ec0d-4b40-b3cc-60a71b1e5f98',
                correlationId: '8e4398c6-cbee-4386-9871-28206d45ca17',
                source: 'integration-test',
            })
        );

        await expect(
            prisma.$executeRaw`UPDATE audit_entries SET outcome = 'ALTERED' WHERE id = ${auditId}::uuid`
        ).rejects.toThrow('audit_entries are append-only');
    });
});
