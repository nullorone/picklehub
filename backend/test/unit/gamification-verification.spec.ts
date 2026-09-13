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
    { id: 'community', ordinal: 3, name: 'Участник сообщества', thresholdXp: 500n },
];

function fact(
    id: string,
    sourceEventId: string,
    kind: XpLedgerEntryKind,
    amount: number,
    occurredAt: string,
    status: XpLedgerEntryStatus = 'POSTED',
    sourceKind: XpSourceKind = 'CONFIRMED_PLAY'
): LedgerFact {
    return { id, sourceEventId, sourceKind, kind, status, amount, sourceOccurredAt: new Date(occurredAt) };
}

function permutations<T>(values: readonly T[]): T[][] {
    if (values.length < 2) return [[...values]];
    return values.flatMap((value, index) =>
        permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((tail) => [value, ...tail])
    );
}

describe('gamification verification model', () => {
    it('converges duplicate, late and out-of-order revisions to one applied source state', () => {
        const deliveries = [
            { messageId: 'message-new', revision: 3 },
            { messageId: 'message-old', revision: 2 },
            { messageId: 'message-new', revision: 3 },
        ];

        for (const order of permutations(deliveries)) {
            const messageIds = new Set<string>();
            const revisions = new Set<number>();
            let newest: number | null = null;
            let effectiveAwards = 0;
            for (const delivery of order) {
                const disposition = eventDisposition(
                    messageIds.has(delivery.messageId) || revisions.has(delivery.revision),
                    newest,
                    delivery.revision
                );
                if (disposition === 'APPLY') {
                    effectiveAwards = 1;
                    newest = Math.max(newest ?? delivery.revision, delivery.revision);
                }
                messageIds.add(delivery.messageId);
                revisions.add(delivery.revision);
            }
            expect(effectiveAwards).toBe(1);
            expect(newest).toBe(3);
        }
    });

    it('keeps every displayed total traceable to immutable award and compensation rows', () => {
        const ledger = [
            fact('1-award', 'match-1', 'AWARD', 100, '2026-09-01T10:00:00Z'),
            fact('2-award', 'match-2', 'AWARD', 100, '2026-09-02T10:00:00Z'),
            fact('3-reversal', 'match-1', 'REVERSAL', 100, '2026-09-01T10:00:00Z'),
            fact('4-reinstatement', 'match-1', 'REINSTATEMENT', 100, '2026-09-01T10:00:00Z'),
            fact('5-pending', 'match-3', 'AWARD', 100, '2026-09-03T10:00:00Z', 'PENDING'),
            fact('6-capped', 'match-4', 'AWARD', 0, '2026-09-04T10:00:00Z', 'CAPPED'),
        ];
        const expected = ledger.reduce(
            (sum, entry) =>
                entry.status === 'POSTED'
                    ? sum + BigInt(entry.kind === 'REVERSAL' ? -entry.amount : entry.amount)
                    : sum,
            0n
        );

        const checksums = new Set<string>();
        for (const deliveryOrder of permutations(ledger.slice(0, 4))) {
            const projection = engine.project([...deliveryOrder, ...ledger.slice(4)], levels);
            checksums.add(projection.checksum);
            expect(projection.lifetimeNetXp).toBe(expected);
            expect(projection.revision).toBe(BigInt(ledger.length));
            expect(engine.validSourceCount([...deliveryOrder, ...ledger.slice(4)], 'CONFIRMED_PLAY')).toBe(2);
        }
        expect(checksums.size).toBe(1);
    });

    it('uses source time for UTC daily and weekly cap simulations', () => {
        const rule = {
            id: 'global-v1',
            enabled: true,
            baseXp: 100,
            coefficientTenths: 10,
            dailyEventCap: 3,
            weeklyEventCap: 10,
        };
        const sourceTimes = [
            '2026-09-07T00:00:00Z',
            '2026-09-07T10:00:00Z',
            '2026-09-07T23:59:59Z',
            '2026-09-08T00:00:00Z',
        ];
        const dayKey = (value: string) => value.slice(0, 10);
        const statuses = sourceTimes.map((value, index) => {
            const earlier = sourceTimes.slice(0, index);
            const daily = earlier.filter((candidate) => dayKey(candidate) === dayKey(value)).length;
            return engine.awardStatus(rule, daily, earlier.length);
        });

        expect(statuses).toEqual(['POSTED', 'POSTED', 'POSTED', 'POSTED']);
        expect(engine.awardStatus(rule, 3, 4)).toBe('CAPPED');
        expect(engine.awardStatus(rule, 0, 10)).toBe('CAPPED');
    });

    it('does not derive XP from a winner, score or guest-shaped metadata', () => {
        const rule = {
            id: 'global-v1',
            enabled: true,
            baseXp: 100,
            coefficientTenths: 10,
            dailyEventCap: 3,
            weeklyEventCap: 10,
        };
        const cases = [
            { winner: true, score: '11:0', guestSlots: 0 },
            { winner: false, score: '0:11', guestSlots: 3 },
        ];
        expect(cases.map(() => engine.calculateAmount(rule))).toEqual([100, 100]);
    });

    it('keeps global and club ledgers independent through leave and rejoin', () => {
        const global = [fact('global', 'match-1', 'AWARD', 100, '2026-09-01T10:00:00Z')];
        const club = [fact('club', 'match-1', 'AWARD', 150, '2026-09-01T10:00:00Z')];
        const beforeLeave = engine.project(club, levels);
        const afterLeave = engine.project(club, levels);
        const afterRejoinReplay = engine.project(club, levels);

        expect(engine.project(global, levels).lifetimeNetXp).toBe(100n);
        expect(beforeLeave).toEqual(afterLeave);
        expect(afterRejoinReplay).toEqual(beforeLeave);
        expect(afterRejoinReplay.lifetimeNetXp).toBe(150n);
    });

    it('applies historical rule versions without mutating earlier amounts', () => {
        const versionOne = { id: 'v1', enabled: true, baseXp: 100, coefficientTenths: 10 };
        const versionTwo = { id: 'v2', enabled: true, baseXp: 100, coefficientTenths: 15 };
        const caps = { dailyEventCap: 3, weeklyEventCap: 10 };
        const ledger = [
            fact(
                'old',
                'match-old',
                'AWARD',
                engine.calculateAmount({ ...versionOne, ...caps }),
                '2026-09-01T10:00:00Z'
            ),
            fact(
                'new',
                'match-new',
                'AWARD',
                engine.calculateAmount({ ...versionTwo, ...caps }),
                '2026-09-08T10:00:00Z'
            ),
        ];

        expect(engine.project(ledger, levels).lifetimeNetXp).toBe(250n);
        expect(ledger.map((entry) => entry.amount)).toEqual([100, 150]);
    });

    it('rejects abuse-shaped club templates and arbitrary source kinds', () => {
        const base = {
            enabled: true,
            coefficientTenths: 10,
            baseXp: 100,
            dailyEventCap: 3,
            weeklyEventCap: 10,
        };
        for (const sourceKind of ['COMPLAINT', 'PAYMENT', 'VICTORY', 'GUEST_CREATED']) {
            expect(() => {
                assertClubConfiguration(
                    [{ ...base, sourceKind: sourceKind as XpSourceKind }],
                    [{ ordinal: 1, name: 'Старт', thresholdXp: 0 }]
                );
            }).toThrow('Unsupported XP source');
        }
        expect(() => {
            assertClubConfiguration(
                [{ ...base, sourceKind: 'CONFIRMED_PLAY', coefficientTenths: 21 }],
                [{ ordinal: 1, name: 'Старт', thresholdXp: 0 }]
            );
        }).toThrow('Club template changes immutable platform rules');
    });
});
