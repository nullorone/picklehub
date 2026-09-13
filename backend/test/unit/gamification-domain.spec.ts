import type { XpLedgerEntryKind, XpLedgerEntryStatus, XpSourceKind } from '@prisma/client';

import {
    assertClubConfiguration,
    eventDisposition,
    GamificationRuleEngine,
    type LedgerFact,
    type LevelSnapshot,
} from '../../src/gamification/gamification.domain';

const engine = new GamificationRuleEngine();
const levels: LevelSnapshot[] = [
    { id: 'start', ordinal: 1, name: 'Старт', thresholdXp: 0n },
    { id: 'active', ordinal: 2, name: 'Активный', thresholdXp: 100n },
];

function entry(
    id: string,
    sourceEventId: string,
    kind: XpLedgerEntryKind,
    status: XpLedgerEntryStatus,
    amount = 100,
    sourceKind: XpSourceKind = 'CONFIRMED_PLAY'
): LedgerFact {
    return { id, sourceEventId, kind, status, amount, sourceKind, sourceOccurredAt: new Date('2026-09-13T10:00:00Z') };
}

describe('GamificationRuleEngine', () => {
    it('projects append-only compensation deterministically regardless of delivery order', () => {
        const ledger = [
            entry('b', 'match-1', 'REVERSAL', 'POSTED'),
            entry('a', 'match-1', 'AWARD', 'POSTED'),
            entry('c', 'match-1', 'REINSTATEMENT', 'POSTED'),
        ];
        const sequential = engine.project(ledger, levels);
        const replayed = engine.project([...ledger].reverse(), levels);
        expect(replayed).toEqual(sequential);
        expect(sequential.lifetimeNetXp).toBe(100n);
        expect(sequential.currentLevel.name).toBe('Активный');
        expect(engine.validSourceCount(ledger, 'CONFIRMED_PLAY')).toBe(1);
    });

    it('deduplicates a revision and rejects late older delivery', () => {
        expect(eventDisposition(true, 2, 3)).toBe('DUPLICATE');
        expect(eventDisposition(false, 2, 2)).toBe('DUPLICATE');
        expect(eventDisposition(false, 3, 2)).toBe('STALE');
        expect(eventDisposition(false, 2, 3)).toBe('APPLY');
    });

    it('keeps pending and capped awards out of the balance', () => {
        const projection = engine.project(
            [entry('a', 'match-1', 'AWARD', 'PENDING'), entry('b', 'match-2', 'AWARD', 'CAPPED', 0)],
            levels
        );
        expect(projection.lifetimeNetXp).toBe(0n);
        expect(
            engine.awardStatus(
                { id: 'r', enabled: true, baseXp: 100, coefficientTenths: 10, dailyEventCap: 3, weeklyEventCap: 10 },
                3,
                3
            )
        ).toBe('CAPPED');
    });

    it('keeps cap outcomes stable when source events arrive out of chronological order', () => {
        const rule = {
            id: 'r',
            enabled: true,
            baseXp: 100,
            coefficientTenths: 10,
            dailyEventCap: 3,
            weeklyEventCap: 10,
        };
        const chronological = [0, 1, 2, 3].map((index) => engine.awardStatus(rule, index, index));
        const outOfOrder = [2, 0, 3, 1].map((_sourceIndex, processedIndex) =>
            engine.awardStatus(rule, processedIndex, processedIndex)
        );

        expect(chronological.filter((status) => status === 'POSTED')).toHaveLength(3);
        expect(outOfOrder.filter((status) => status === 'POSTED')).toHaveLength(3);
        expect(chronological.filter((status) => status === 'CAPPED')).toHaveLength(1);
        expect(outOfOrder.filter((status) => status === 'CAPPED')).toHaveLength(1);
    });

    it('uses shared competition rank without a hidden tie-break', () => {
        const ranks = engine.competitionRanks([
            { userId: 'c', seasonalNetXp: 10n },
            { userId: 'b', seasonalNetXp: 20n },
            { userId: 'a', seasonalNetXp: 20n },
            { userId: 'd', seasonalNetXp: 5n },
        ]);
        expect([...ranks.entries()]).toEqual([
            ['a', 1],
            ['b', 1],
            ['c', 3],
            ['d', 4],
        ]);
    });

    it('accepts only bounded club templates and increasing decorative levels', () => {
        expect(() => {
            assertClubConfiguration(
                [
                    {
                        sourceKind: 'CONFIRMED_PLAY',
                        enabled: true,
                        coefficientTenths: 20,
                        baseXp: 100,
                        dailyEventCap: 3,
                        weeklyEventCap: 10,
                    },
                ],
                [{ ordinal: 1, name: 'Новичок', thresholdXp: 0 }]
            );
        }).not.toThrow();
        expect(() => {
            assertClubConfiguration(
                [
                    {
                        sourceKind: 'CONFIRMED_PLAY',
                        enabled: true,
                        coefficientTenths: 21,
                        baseXp: 100,
                        dailyEventCap: 3,
                        weeklyEventCap: 10,
                    },
                ],
                [{ ordinal: 1, name: 'Администратор', thresholdXp: 0 }]
            );
        }).toThrow();
    });
});
