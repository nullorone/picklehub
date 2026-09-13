import { Injectable } from '@nestjs/common';
import { GamificationScopeKind, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { GLOBAL_RULE_VERSION } from './gamification.domain';

export interface CreateSeason {
    readonly scopeKind: GamificationScopeKind;
    readonly clubId: string | null;
    readonly name: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly ruleVersion?: string;
}

/** Internal command used by audited platform/club administration workflows; it is intentionally not a public API. */
@Injectable()
export class GamificationSeasonService {
    constructor(
        private readonly audit: AuditService,
        private readonly context: RequestContextService
    ) {}

    async create(
        actorId: string,
        input: CreateSeason,
        tx: Prisma.TransactionClient
    ): Promise<{ id: string; definitionSnapshotHash: string }> {
        const duration = input.endsAt.getTime() - input.startsAt.getTime();
        if (
            duration < 28 * 86_400_000 ||
            duration > 366 * 86_400_000 ||
            input.startsAt.getTime() % 1 !== 0 ||
            input.endsAt <= input.startsAt ||
            (input.scopeKind === 'GLOBAL') !== (input.clubId === null)
        ) {
            throw new Error('Invalid leaderboard season scope or interval');
        }
        const name = input.name.normalize('NFC').trim();
        if (name.length < 1 || name.length > 80) throw new Error('Invalid leaderboard season name');
        if (input.scopeKind === 'CLUB') {
            if (input.clubId === null) throw new Error('Club season requires a club');
            const membership = await tx.clubMembership.findFirst({
                where: {
                    clubId: input.clubId,
                    userId: actorId,
                    state: 'ACTIVE',
                    role: { in: ['OWNER', 'ADMIN'] },
                },
            });
            if (membership === null) throw new Error('Club season management is forbidden');
        }
        const ruleVersion = input.ruleVersion ?? GLOBAL_RULE_VERSION;
        const [rules, levels] = await Promise.all([
            tx.xpRuleDefinition.findMany({
                where: { scopeKind: input.scopeKind, clubId: input.clubId, version: ruleVersion },
                orderBy: { sourceKind: 'asc' },
            }),
            tx.levelDefinition.findMany({
                where: { scopeKind: input.scopeKind, clubId: input.clubId, version: ruleVersion },
                orderBy: { ordinal: 'asc' },
            }),
        ]);
        if (rules.length === 0 || levels.length === 0) throw new Error('Season definition snapshot is missing');
        const snapshot = {
            rules: rules.map((rule) => ({ id: rule.id, hash: rule.snapshotHash })),
            levels: levels.map((level) => ({
                id: level.id,
                ordinal: level.ordinal,
                thresholdXp: level.thresholdXp.toString(),
            })),
        };
        const definitionSnapshotHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
        const id = uuidV7();
        await tx.leaderboardSeason.create({
            data: {
                id,
                scopeKind: input.scopeKind,
                clubId: input.clubId,
                name,
                state: input.startsAt > new Date() ? 'SCHEDULED' : 'ACTIVE',
                startsAt: input.startsAt,
                endsAt: input.endsAt,
                ruleVersion,
                definitionSnapshot: snapshot,
                definitionSnapshotHash,
            },
        });
        const requestId = this.context.get()?.requestId ?? uuidV7();
        await this.audit.append(tx, {
            actorType: input.scopeKind === 'GLOBAL' ? 'ADMIN' : 'USER',
            actorId,
            action: 'gamification.leaderboard.season.created',
            targetType: 'LEADERBOARD_SEASON',
            targetId: id,
            outcome: 'SUCCEEDED',
            policyVersion: 'gamification-v1',
            changedFields: {
                scopeKind: input.scopeKind,
                clubId: input.clubId,
                startsAt: input.startsAt.toISOString(),
                endsAt: input.endsAt.toISOString(),
                definitionSnapshotHash,
            },
            requestId,
            correlationId: this.context.get()?.correlationId ?? requestId,
            source: 'INTERNAL_COMMAND',
        });
        return { id, definitionSnapshotHash };
    }
}
