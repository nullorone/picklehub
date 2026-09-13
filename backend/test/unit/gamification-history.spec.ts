import { GamificationService } from '../../src/gamification/gamification.service';

describe('GamificationService XP history', () => {
    it('reads only the owner ledger and keeps append-only compensation details', async () => {
        const createdAt = new Date('2026-09-13T10:00:00.000Z');
        const sourceOccurredAt = new Date('2026-09-12T10:00:00.000Z');
        const findMany = jest.fn().mockResolvedValue([
            {
                amount: 100,
                clubId: null,
                compensationOfEntryId: '11111111-1111-4111-8111-111111111111',
                createdAt,
                id: '22222222-2222-4222-8222-222222222222',
                kind: 'REVERSAL',
                ruleDefinitionId: '33333333-3333-4333-8333-333333333333',
                ruleVersion: '1.0.0',
                scopeKind: 'GLOBAL',
                sourceEventId: '44444444-4444-4444-8444-444444444444',
                sourceKind: 'CONFIRMED_PLAY',
                sourceOccurredAt,
                status: 'POSTED',
            },
        ]);
        const service = new GamificationService(
            { xpLedgerEntry: { findMany } } as never,
            {} as never,
            {} as never,
            {} as never
        );

        await expect(service.xpHistory('owner-id', 20)).resolves.toEqual({
            items: [
                expect.objectContaining({
                    amount: 100,
                    compensationOfEntryId: '11111111-1111-4111-8111-111111111111',
                    kind: 'REVERSAL',
                    occurredAt: sourceOccurredAt.toISOString(),
                    scope: { clubId: null, kind: 'GLOBAL' },
                }),
            ],
            pageInfo: { hasMore: false, nextCursor: null },
        });
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 21,
                where: { userId: 'owner-id' },
            })
        );
    });
});
