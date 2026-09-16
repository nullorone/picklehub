import { Injectable } from '@nestjs/common';
import {
    ClubRole,
    ClubState,
    GamificationScopeKind,
    LeaderboardSeasonState,
    Prisma,
    type XpSourceKind,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { OutboxService } from '../outbox/outbox.service';
import type { ClubXpTemplateDto, UpdateClubGamificationDto } from './gamification.dto';
import { assertClubConfiguration, LEADERBOARD_POLICY_VERSION } from './gamification.domain';
import { gamificationError } from './gamification.errors';

type Database = PrismaService | Prisma.TransactionClient;

@Injectable()
export class GamificationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: AuditService,
        private readonly context: RequestContextService,
        private readonly outbox: OutboxService
    ) {}

    async globalProgress(userId: string): Promise<object> {
        return this.progress(userId, GamificationScopeKind.GLOBAL, null);
    }

    async clubProgress(userId: string, clubId: string): Promise<object> {
        await this.clubAccess(this.prisma, clubId, userId, true);
        return this.progress(userId, GamificationScopeKind.CLUB, clubId);
    }

    async xpHistory(userId: string, limit: number, cursor?: string): Promise<object> {
        const before = cursor === undefined ? undefined : this.decodeCursor(cursor);
        const rows = await this.prisma.xpLedgerEntry.findMany({
            where: {
                userId,
                ...(before === undefined
                    ? {}
                    : { OR: [{ createdAt: { lt: before.at } }, { createdAt: before.at, id: { lt: before.id } }] }),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
        });
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
            items: page.map((entry) => ({
                id: entry.id,
                scope: this.scope(entry.scopeKind, entry.clubId),
                sourceKind: entry.sourceKind,
                sourceEventId: entry.sourceEventId,
                ruleDefinitionId: entry.ruleDefinitionId,
                ruleVersion: entry.ruleVersion,
                kind: entry.kind,
                status: entry.status,
                amount: entry.amount,
                compensationOfEntryId: entry.compensationOfEntryId,
                occurredAt: entry.sourceOccurredAt.toISOString(),
                createdAt: entry.createdAt.toISOString(),
            })),
            pageInfo: {
                hasMore: rows.length > limit,
                nextCursor:
                    rows.length > limit && last !== undefined ? this.encodeCursor(last.createdAt, last.id) : null,
            },
        };
    }

    async achievements(userId: string, limit: number, cursor?: string): Promise<object> {
        const before = cursor === undefined ? undefined : this.decodeCursor(cursor);
        const rows = await this.prisma.achievementAward.findMany({
            where: {
                userId,
                ...(before === undefined
                    ? {}
                    : { OR: [{ createdAt: { lt: before.at } }, { createdAt: before.at, id: { lt: before.id } }] }),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
        });
        const definitions = await this.prisma.achievementDefinition.findMany({
            where: { id: { in: rows.map((award) => award.achievementDefinitionId) } },
        });
        const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
            items: page.map((award) => {
                const definition = definitionsById.get(award.achievementDefinitionId);
                if (definition === undefined) throw new Error('Achievement definition is missing');
                return {
                    id: award.id,
                    definition: this.achievementDefinition(definition),
                    scope: this.scope(
                        award.clubId === null ? GamificationScopeKind.GLOBAL : GamificationScopeKind.CLUB,
                        award.clubId
                    ),
                    state: award.state,
                    qualifyingCount: award.qualifyingCount,
                    awardedAt: award.createdAt.toISOString(),
                    changedAt: award.createdAt.toISOString(),
                };
            }),
            pageInfo: {
                hasNext: rows.length > limit,
                nextCursor:
                    rows.length > limit && last !== undefined ? this.encodeCursor(last.createdAt, last.id) : null,
            },
        };
    }

    async adminDefinitions(): Promise<object> {
        const [rules, levels, achievements] = await Promise.all([
            this.prisma.xpRuleDefinition.findMany({
                where: { scopeKind: 'GLOBAL' },
                orderBy: [{ sourceKind: 'asc' }, { effectiveFrom: 'desc' }],
            }),
            this.prisma.levelDefinition.findMany({
                where: { scopeKind: 'GLOBAL' },
                orderBy: [{ version: 'desc' }, { ordinal: 'asc' }],
            }),
            this.prisma.achievementDefinition.findMany({ orderBy: [{ sourceKind: 'asc' }, { thresholdCount: 'asc' }] }),
        ]);
        return {
            globalRules: rules.map((rule) => this.rule(rule)),
            globalLevels: levels.map((level) => this.level(level)),
            achievements: achievements.map((definition) => this.achievementDefinition(definition)),
            clubTemplates: this.defaultTemplates(),
        };
    }

    async clubConfiguration(userId: string, clubId: string): Promise<object> {
        await this.clubAccess(this.prisma, clubId, userId, false);
        return this.readClubConfiguration(this.prisma, clubId);
    }

    async updateClubConfiguration(
        userId: string,
        clubId: string,
        body: UpdateClubGamificationDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const membership = await this.clubAccess(tx, clubId, userId, false);
        if (membership.role !== ClubRole.OWNER && membership.role !== ClubRole.ADMIN)
            throw gamificationError('GAMIFICATION_ACTION_FORBIDDEN', 403);
        let effectiveFrom = new Date(body.effectiveFrom);
        if (Number.isNaN(effectiveFrom.getTime()) || effectiveFrom <= new Date())
            throw gamificationError('VALIDATION_FAILED', 400);
        effectiveFrom = new Date(Math.floor(effectiveFrom.getTime() / 1000) * 1000);
        try {
            assertClubConfiguration(body.templates, body.levels);
        } catch {
            throw gamificationError('VALIDATION_FAILED', 400);
        }
        const current = await tx.xpRuleDefinition.findFirst({
            where: { scopeKind: 'CLUB', clubId },
            orderBy: { createdAt: 'desc' },
        });
        const currentVersion = current === null ? 0 : Number(current.version.split('.')[0]);
        if (currentVersion !== body.expectedVersion) throw gamificationError('REVISION_CONFLICT', 409);
        const versionNumber = currentVersion + 1;
        const version = `${String(versionNumber)}.0.0`;
        const snapshotHash = this.hash({
            templates: body.templates,
            levels: body.levels,
            effectiveFrom: effectiveFrom.toISOString(),
        });
        for (const template of body.templates) {
            await tx.xpRuleDefinition.create({
                data: {
                    id: uuidV7(),
                    scopeKind: 'CLUB',
                    clubId,
                    sourceKind: template.sourceKind,
                    version,
                    enabled: template.enabled,
                    baseXp: template.baseXp,
                    coefficientTenths: template.coefficientTenths,
                    dailyEventCap: template.dailyEventCap,
                    weeklyEventCap: template.weeklyEventCap,
                    effectiveFrom,
                    snapshotHash,
                },
            });
        }
        for (const definition of body.levels) {
            await tx.levelDefinition.create({
                data: {
                    id: uuidV7(),
                    scopeKind: 'CLUB',
                    clubId,
                    version,
                    ordinal: definition.ordinal,
                    name: definition.name.normalize('NFC').trim(),
                    thresholdXp: BigInt(definition.thresholdXp),
                    effectiveFrom,
                },
            });
        }
        await this.auditEntry(tx, userId, 'gamification.club.configuration.published', 'CLUB', clubId, {
            version,
            effectiveFrom: effectiveFrom.toISOString(),
            sources: body.templates.map((template) => template.sourceKind),
        });
        return this.readClubConfiguration(tx, clubId, version);
    }

    async setConsent(
        userId: string,
        seasonId: string,
        optedIn: boolean,
        policyVersion: string,
        expectedRevision: number,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        if (policyVersion !== LEADERBOARD_POLICY_VERSION) throw gamificationError('REVISION_CONFLICT', 409);
        const season = await tx.leaderboardSeason.findUnique({ where: { id: seasonId } });
        if (season === null) throw gamificationError('SEASON_NOT_FOUND', 404);
        if (season.scopeKind === 'CLUB' && season.clubId !== null)
            await this.clubAccess(tx, season.clubId, userId, false);
        const current = await tx.leaderboardConsent.findFirst({
            where: { seasonId, userId },
            orderBy: { revision: 'desc' },
        });
        const revision = current?.revision ?? -1;
        if ((current?.revision ?? 0) !== expectedRevision) throw gamificationError('REVISION_CONFLICT', 409);
        if (season.state === LeaderboardSeasonState.CLOSED && optedIn) throw gamificationError('SEASON_CLOSED', 409);
        const consent = await tx.leaderboardConsent.create({
            data: { id: uuidV7(), seasonId, userId, revision: revision + 1, optedIn, policyVersion },
        });
        const correlationId = this.context.get()?.correlationId ?? uuidV7();
        await this.outbox.enqueue(tx, {
            type: 'gamification.leaderboard-consent.changed.v1',
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type: 'gamification.leaderboard-consent.changed.v1',
                occurredAt: consent.createdAt.toISOString(),
                correlationId,
                causationId: null,
                data: {
                    consentId: consent.id,
                    revision: consent.revision,
                    action: optedIn ? 'OPTED_IN' : 'OPTED_OUT',
                },
            },
            correlationId,
            occurredAt: consent.createdAt,
        });
        await this.auditEntry(
            tx,
            userId,
            optedIn ? 'gamification.leaderboard.opted_in' : 'gamification.leaderboard.opted_out',
            'LEADERBOARD_SEASON',
            seasonId,
            { revision: consent.revision }
        );
        return this.consent(consent);
    }

    async leaderboard(userId: string, seasonId: string, limit: number, cursor?: string): Promise<object> {
        const season = await this.prisma.leaderboardSeason.findUnique({ where: { id: seasonId } });
        if (season === null) throw gamificationError('SEASON_NOT_FOUND', 404);
        if (season.scopeKind === 'CLUB' && season.clubId !== null)
            await this.clubAccess(this.prisma, season.clubId, userId, false);
        const offset = cursor === undefined ? 0 : this.decodeOffset(cursor);
        const [entries, viewerConsent] = await Promise.all([
            this.prisma.leaderboardEntry.findMany({
                where: { seasonId },
                orderBy: [{ rank: 'asc' }, { userId: 'asc' }],
                skip: offset,
                take: limit + 1,
            }),
            this.prisma.leaderboardConsent.findFirst({ where: { seasonId, userId }, orderBy: { revision: 'desc' } }),
        ]);
        const page = entries.slice(0, limit);
        const profiles = await this.prisma.playerProfile.findMany({
            where: { userId: { in: page.map((entry) => entry.userId) } },
            select: { userId: true, displayName: true, visibility: true },
        });
        const hidden = await this.blockedUserIds(
            userId,
            page.map((entry) => entry.userId)
        );
        const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));
        const levels = await this.prisma.levelDefinition.findMany({
            where: { id: { in: page.map((entry) => entry.levelDefinitionId) } },
        });
        const levelById = new Map(levels.map((level) => [level.id, level]));
        return {
            season: this.season(season),
            items: page.map((entry) => {
                const profile = profileById.get(entry.userId);
                const isHidden = hidden.has(entry.userId) || profile?.visibility !== 'PUBLIC';
                return {
                    rank: entry.rank,
                    visibility: isHidden ? 'HIDDEN_BY_BLOCK' : 'VISIBLE',
                    userId: isHidden ? null : entry.userId,
                    displayName: isHidden ? 'Скрытый игрок' : profile.displayName,
                    avatarUrl: null,
                    levelName: levelById.get(entry.levelDefinitionId)?.name ?? 'Старт',
                    seasonalNetXp: entry.seasonalNetXp.toString(),
                };
            }),
            pageInfo: {
                hasNext: entries.length > limit,
                nextCursor: entries.length > limit ? this.encodeOffset(offset + limit) : null,
            },
            viewerConsent: viewerConsent === null ? null : this.consent(viewerConsent),
            projectionRevision: page
                .reduce(
                    (maximum, entry) => (entry.projectionRevision > maximum ? entry.projectionRevision : maximum),
                    0n
                )
                .toString(),
        };
    }

    private async progress(userId: string, scopeKind: GamificationScopeKind, clubId: string | null): Promise<object> {
        const balance = await this.prisma.xpBalance.findFirst({ where: { userId, scopeKind, clubId } });
        const levels = await this.prisma.levelDefinition.findMany({
            where: { scopeKind, clubId, effectiveFrom: { lte: new Date() } },
            orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }, { ordinal: 'asc' }],
        });
        const currentVersion = levels[0]?.version;
        const currentLevels = levels.filter((level) => level.version === currentVersion);
        const xp = balance?.lifetimeNetXp ?? 0n;
        const current = [...currentLevels].reverse().find((level) => level.thresholdXp <= xp) ?? currentLevels[0];
        if (current === undefined) throw gamificationError('GAMIFICATION_SCOPE_NOT_FOUND', 404);
        const next = currentLevels.find((level) => level.thresholdXp > xp) ?? null;
        return {
            scope: this.scope(scopeKind, clubId),
            state: balance?.frozenAt === null || balance === null ? 'ACTIVE' : 'FROZEN',
            lifetimeNetXp: xp.toString(),
            currentLevel: this.level(current),
            nextLevel: next === null ? null : this.level(next),
            xpToNextLevel: next === null ? null : (next.thresholdXp - xp).toString(),
            projectionRevision: (balance?.projectionRevision ?? 0n).toString(),
            updatedAt: (balance?.updatedAt ?? new Date()).toISOString(),
        };
    }

    private async readClubConfiguration(
        database: Database,
        clubId: string,
        requestedVersion?: string
    ): Promise<object> {
        const latest =
            requestedVersion ??
            (
                await database.xpRuleDefinition.findFirst({
                    where: { scopeKind: 'CLUB', clubId },
                    orderBy: { createdAt: 'desc' },
                })
            )?.version;
        if (latest === undefined) throw gamificationError('GAMIFICATION_SCOPE_NOT_FOUND', 404);
        const [rules, levels] = await Promise.all([
            database.xpRuleDefinition.findMany({
                where: { scopeKind: 'CLUB', clubId, version: latest },
                orderBy: { sourceKind: 'asc' },
            }),
            database.levelDefinition.findMany({
                where: { scopeKind: 'CLUB', clubId, version: latest },
                orderBy: { ordinal: 'asc' },
            }),
        ]);
        return {
            clubId,
            version: Number(latest.split('.')[0]),
            definitionVersion: latest,
            effectiveFrom: rules[0]?.effectiveFrom.toISOString() ?? levels[0]?.effectiveFrom.toISOString(),
            templates: rules.map((rule) => this.template(rule)),
            levels: levels.map((level) => this.level(level)),
        };
    }

    private async clubAccess(database: Database, clubId: string, userId: string, frozenAllowed: boolean) {
        const club = await database.club.findUnique({ where: { id: clubId }, select: { state: true } });
        if (club === null || club.state === ClubState.ARCHIVED)
            throw gamificationError('GAMIFICATION_SCOPE_NOT_FOUND', 404);
        const membership = await database.clubMembership.findFirst({
            where: { clubId, userId, ...(frozenAllowed ? {} : { state: 'ACTIVE' }) },
            orderBy: { joinedAt: 'desc' },
            select: { role: true, state: true },
        });
        if (membership === null) throw gamificationError('GAMIFICATION_ACTION_FORBIDDEN', 403);
        return membership;
    }

    private async blockedUserIds(viewerId: string, candidateIds: string[]): Promise<Set<string>> {
        const [blocks, restrictions] = await Promise.all([
            this.prisma.communicationBlock.findMany({
                where: {
                    OR: [
                        { blockerId: viewerId, blockedUserId: { in: candidateIds } },
                        { blockerId: { in: candidateIds }, blockedUserId: viewerId },
                    ],
                },
                select: { blockerId: true, blockedUserId: true },
            }),
            this.prisma.userRestriction.findMany({
                where: {
                    userId: { in: candidateIds },
                    state: 'ACTIVE',
                    scope: 'PLATFORM_ACCESS',
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                select: { userId: true },
            }),
        ]);
        return new Set(
            [
                ...blocks.flatMap((block) => [block.blockerId, block.blockedUserId]),
                ...restrictions.map((row) => row.userId),
            ].filter((id) => id !== viewerId)
        );
    }

    private defaultTemplates(): object[] {
        return [
            ['CONFIRMED_PLAY', 100],
            ['CONFIRMED_MATCH_ORGANIZED', 40],
            ['ELIGIBLE_STRUCTURED_REVIEW', 15],
        ].map(([sourceKind, baseXp]) => ({
            sourceKind,
            enabled: true,
            coefficientTenths: 10,
            baseXp,
            dailyEventCap: 3,
            weeklyEventCap: 10,
        }));
    }

    private template(rule: {
        sourceKind: XpSourceKind;
        enabled: boolean;
        coefficientTenths: number;
        baseXp: number;
        dailyEventCap: number;
        weeklyEventCap: number;
    }): ClubXpTemplateDto {
        const { sourceKind } = rule;
        if (sourceKind === 'MINI_GAME_DAILY_COMPLETION') {
            throw new Error('Mini-game XP is global-only');
        }
        return { ...rule, sourceKind };
    }
    private scope(kind: GamificationScopeKind, clubId: string | null): object {
        return { kind, clubId };
    }
    private level(level: {
        id: string;
        scopeKind: GamificationScopeKind;
        clubId: string | null;
        version: string;
        ordinal: number;
        name: string;
        thresholdXp: bigint;
        effectiveFrom: Date;
    }): object {
        return {
            id: level.id,
            scope: this.scope(level.scopeKind, level.clubId),
            version: level.version,
            ordinal: level.ordinal,
            name: level.name,
            thresholdXp: level.thresholdXp.toString(),
            effectiveFrom: level.effectiveFrom.toISOString(),
        };
    }
    private rule(rule: {
        id: string;
        scopeKind: GamificationScopeKind;
        clubId: string | null;
        sourceKind: XpSourceKind;
        version: string;
        enabled: boolean;
        baseXp: number;
        coefficientTenths: number;
        dailyEventCap: number;
        weeklyEventCap: number;
        effectiveFrom: Date;
        effectiveUntil: Date | null;
    }): object {
        return {
            id: rule.id,
            scope: this.scope(rule.scopeKind, rule.clubId),
            sourceKind: rule.sourceKind,
            version: rule.version,
            enabled: rule.enabled,
            baseXp: rule.baseXp,
            coefficientTenths: rule.coefficientTenths,
            dailyEventCap: rule.dailyEventCap,
            weeklyEventCap: rule.weeklyEventCap,
            effectiveFrom: rule.effectiveFrom.toISOString(),
            effectiveUntil: rule.effectiveUntil?.toISOString() ?? null,
        };
    }
    private achievementDefinition(definition: {
        id: string;
        scopeKind: GamificationScopeKind;
        code: string;
        version: string;
        sourceKind: XpSourceKind;
        thresholdCount: number;
        title: string;
        description: string;
    }): object {
        return {
            id: definition.id,
            scopeKind: definition.scopeKind,
            code: definition.code,
            version: definition.version,
            sourceKind: definition.sourceKind,
            thresholdCount: definition.thresholdCount,
            title: definition.title,
            description: definition.description,
        };
    }
    private season(season: {
        id: string;
        scopeKind: GamificationScopeKind;
        clubId: string | null;
        name: string;
        state: LeaderboardSeasonState;
        startsAt: Date;
        endsAt: Date;
        ruleVersion: string;
        definitionSnapshotHash: string;
    }): object {
        return {
            id: season.id,
            scope: this.scope(season.scopeKind, season.clubId),
            name: season.name,
            state: season.state,
            startsAt: season.startsAt.toISOString(),
            endsAt: season.endsAt.toISOString(),
            ruleVersion: season.ruleVersion,
            definitionSnapshotHash: season.definitionSnapshotHash,
        };
    }
    private consent(consent: {
        seasonId: string;
        optedIn: boolean;
        policyVersion: string;
        revision: number;
        createdAt: Date;
    }): object {
        return {
            seasonId: consent.seasonId,
            optedIn: consent.optedIn,
            policyVersion: consent.policyVersion,
            revision: consent.revision,
            changedAt: consent.createdAt.toISOString(),
        };
    }
    private hash(value: object): string {
        return createHash('sha256').update(JSON.stringify(value)).digest('hex');
    }
    private encodeCursor(at: Date, id: string): string {
        return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString('base64url');
    }
    private decodeCursor(cursor: string): { at: Date; id: string } {
        try {
            const value = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { at?: unknown; id?: unknown };
            if (typeof value.at !== 'string' || typeof value.id !== 'string') throw new Error();
            const at = new Date(value.at);
            if (Number.isNaN(at.getTime())) throw new Error();
            return { at, id: value.id };
        } catch {
            throw gamificationError('INVALID_CURSOR', 400);
        }
    }
    private encodeOffset(value: number): string {
        return Buffer.from(String(value)).toString('base64url');
    }
    private decodeOffset(value: string): number {
        const result = Number(Buffer.from(value, 'base64url').toString());
        if (!Number.isInteger(result) || result < 0) throw gamificationError('INVALID_CURSOR', 400);
        return result;
    }
    private async auditEntry(
        tx: Prisma.TransactionClient,
        actorId: string,
        action: string,
        targetType: string,
        targetId: string,
        changedFields: Prisma.InputJsonObject
    ): Promise<void> {
        const requestId = this.context.get()?.requestId ?? uuidV7();
        await this.audit.append(tx, {
            actorType: 'USER',
            actorId,
            action,
            targetType,
            targetId,
            outcome: 'SUCCEEDED',
            policyVersion: 'gamification-v1',
            changedFields,
            requestId,
            correlationId: this.context.get()?.correlationId ?? requestId,
            source: 'API',
        });
    }
}
