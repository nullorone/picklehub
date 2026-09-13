import type { XpLedgerEntryKind, XpLedgerEntryStatus, XpSourceKind } from '@prisma/client';
import { createHash } from 'node:crypto';

export const GLOBAL_RULE_VERSION = '1.0.0';
export const LEADERBOARD_POLICY_VERSION = '1.0.0';

export type EventDisposition = 'APPLY' | 'DUPLICATE' | 'STALE';

export function eventDisposition(
    messageSeen: boolean,
    newestRevision: number | null,
    incomingRevision: number
): EventDisposition {
    if (messageSeen || newestRevision === incomingRevision) return 'DUPLICATE';
    if (newestRevision !== null && newestRevision > incomingRevision) return 'STALE';
    return 'APPLY';
}

export interface RuleSnapshot {
    readonly id: string;
    readonly enabled: boolean;
    readonly baseXp: number;
    readonly coefficientTenths: number;
    readonly dailyEventCap: number;
    readonly weeklyEventCap: number;
}

export interface LedgerFact {
    readonly id: string;
    readonly sourceEventId: string;
    readonly sourceKind: XpSourceKind;
    readonly kind: XpLedgerEntryKind;
    readonly status: XpLedgerEntryStatus;
    readonly amount: number;
    readonly sourceOccurredAt: Date;
}

export interface LevelSnapshot {
    readonly id: string;
    readonly ordinal: number;
    readonly name: string;
    readonly thresholdXp: bigint;
}

export interface ProjectionSnapshot {
    readonly lifetimeNetXp: bigint;
    readonly revision: bigint;
    readonly checksum: string;
    readonly currentLevel: LevelSnapshot;
    readonly nextLevel: LevelSnapshot | null;
}

export class GamificationRuleEngine {
    calculateAmount(rule: RuleSnapshot): number {
        if (!rule.enabled) return 0;
        if (!Number.isInteger(rule.baseXp) || rule.baseXp <= 0) throw new Error('Rule base XP must be positive');
        if (!Number.isInteger(rule.coefficientTenths) || rule.coefficientTenths < 5 || rule.coefficientTenths > 20) {
            throw new Error('Club coefficient must be between 0.5 and 2.0 in 0.1 steps');
        }
        return Math.floor((rule.baseXp * rule.coefficientTenths) / 10);
    }

    awardStatus(
        rule: RuleSnapshot,
        dailyCount: number,
        weeklyCount: number,
        heldForReview = false
    ): XpLedgerEntryStatus {
        if (dailyCount >= rule.dailyEventCap || weeklyCount >= rule.weeklyEventCap) return 'CAPPED';
        return heldForReview ? 'PENDING' : 'POSTED';
    }

    project(ledger: readonly LedgerFact[], levels: readonly LevelSnapshot[]): ProjectionSnapshot {
        const ordered = [...ledger].sort(
            (left, right) =>
                left.sourceOccurredAt.getTime() - right.sourceOccurredAt.getTime() || left.id.localeCompare(right.id)
        );
        const net = ordered.reduce((sum, entry) => {
            if (entry.status !== 'POSTED') return sum;
            return sum + BigInt(entry.kind === 'REVERSAL' ? -entry.amount : entry.amount);
        }, 0n);
        const lifetimeNetXp = net < 0n ? 0n : net;
        const sortedLevels = [...levels].sort((left, right) => left.ordinal - right.ordinal);
        const currentLevel = [...sortedLevels].reverse().find((level) => level.thresholdXp <= lifetimeNetXp);
        if (currentLevel === undefined) throw new Error('A level set must contain a zero-threshold level');
        const nextLevel = sortedLevels.find((level) => level.thresholdXp > lifetimeNetXp) ?? null;
        const canonical = ordered.map((entry) => [
            entry.id,
            entry.sourceKind,
            entry.kind,
            entry.status,
            entry.amount,
            entry.sourceOccurredAt.toISOString(),
        ]);
        return {
            lifetimeNetXp,
            revision: BigInt(ordered.length),
            checksum: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
            currentLevel,
            nextLevel,
        };
    }

    validSourceCount(ledger: readonly LedgerFact[], sourceKind: XpSourceKind): number {
        const chains = new Map<string, number>();
        for (const entry of ledger) {
            if (entry.sourceKind !== sourceKind || entry.status !== 'POSTED') continue;
            const delta = entry.kind === 'REVERSAL' ? -1 : 1;
            chains.set(entry.sourceEventId, (chains.get(entry.sourceEventId) ?? 0) + delta);
        }
        return [...chains.values()].filter((value) => value > 0).length;
    }

    competitionRanks(rows: readonly { userId: string; seasonalNetXp: bigint }[]): Map<string, number> {
        const ordered = [...rows].sort(
            (left, right) => Number(right.seasonalNetXp - left.seasonalNetXp) || left.userId.localeCompare(right.userId)
        );
        const ranks = new Map<string, number>();
        let previousXp: bigint | undefined;
        let rank = 0;
        ordered.forEach((row, index) => {
            if (previousXp === undefined || row.seasonalNetXp !== previousXp) rank = index + 1;
            ranks.set(row.userId, rank);
            previousXp = row.seasonalNetXp;
        });
        return ranks;
    }
}

export function assertClubConfiguration(
    templates: readonly {
        sourceKind: XpSourceKind;
        enabled: boolean;
        coefficientTenths: number;
        baseXp: number;
        dailyEventCap: number;
        weeklyEventCap: number;
    }[],
    levels: readonly { ordinal: number; name: string; thresholdXp: number }[]
): void {
    const allowed = new Set<XpSourceKind>([
        'CONFIRMED_PLAY',
        'CONFIRMED_MATCH_ORGANIZED',
        'ELIGIBLE_STRUCTURED_REVIEW',
    ]);
    if (
        templates.length < 1 ||
        templates.length > 3 ||
        new Set(templates.map((item) => item.sourceKind)).size !== templates.length
    )
        throw new Error('Club templates must be a unique allowlisted set');
    for (const template of templates) {
        if (!allowed.has(template.sourceKind)) throw new Error('Unsupported XP source');
        const base =
            template.sourceKind === 'CONFIRMED_PLAY'
                ? 100
                : template.sourceKind === 'CONFIRMED_MATCH_ORGANIZED'
                  ? 40
                  : 15;
        if (
            template.baseXp !== base ||
            template.dailyEventCap !== 3 ||
            template.weeklyEventCap !== 10 ||
            !Number.isInteger(template.coefficientTenths) ||
            template.coefficientTenths < 5 ||
            template.coefficientTenths > 20
        )
            throw new Error('Club template changes immutable platform rules');
    }
    if (levels.length < 1 || levels.length > 20) throw new Error('A club needs between 1 and 20 levels');
    const forbidden = /(admin|moderator|staff|админ|модератор|казино|ставк|деньг|приз|выигрыш)/iu;
    levels.forEach((level, index) => {
        if (level.ordinal !== index + 1 || !Number.isInteger(level.thresholdXp) || level.thresholdXp < 0)
            throw new Error('Level ordinals and thresholds are invalid');
        if (index === 0 && level.thresholdXp !== 0) throw new Error('First level must start at zero XP');
        if (index > 0 && level.thresholdXp <= (levels[index - 1]?.thresholdXp ?? -1))
            throw new Error('Level thresholds must strictly increase');
        const name = level.name.normalize('NFC').trim();
        if (name.length < 1 || name.length > 30 || forbidden.test(name))
            throw new Error('Level name violates text policy');
    });
}
