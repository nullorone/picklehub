import type { Prisma } from '@prisma/client';

import { OutboxService } from '../../src/outbox/outbox.service';

describe('OutboxService', () => {
    it('writes through the transaction supplied by the owning use case', async () => {
        const create = jest.fn().mockResolvedValue({});
        const transaction = { outboxEvent: { create } } as unknown as Prisma.TransactionClient;
        const service = new OutboxService();

        const id = await service.enqueue(transaction, {
            type: 'platform.checked.v1',
            schemaVersion: 1,
            payload: { referenceId: 'opaque' },
            correlationId: '8e4398c6-cbee-4386-9871-28206d45ca17',
            occurredAt: new Date('2026-09-04T10:00:00.000Z'),
        });

        expect(id).toMatch(/^[0-9a-f-]{36}$/u);
        expect(create).toHaveBeenCalledWith({
            data: {
                id,
                type: 'platform.checked.v1',
                schemaVersion: 1,
                payload: { referenceId: 'opaque' },
                correlationId: '8e4398c6-cbee-4386-9871-28206d45ca17',
                occurredAt: new Date('2026-09-04T10:00:00.000Z'),
            },
        });
    });

    it('rejects unversioned event types before touching storage', async () => {
        const create = jest.fn();
        const transaction = { outboxEvent: { create } } as unknown as Prisma.TransactionClient;

        await expect(
            new OutboxService().enqueue(transaction, {
                type: 'platform.checked',
                schemaVersion: 1,
                payload: {},
                correlationId: '8e4398c6-cbee-4386-9871-28206d45ca17',
                occurredAt: new Date(),
            })
        ).rejects.toThrow('Outbox event type must be versioned');
        expect(create).not.toHaveBeenCalled();
    });
});
