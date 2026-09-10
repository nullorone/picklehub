import { Injectable } from '@nestjs/common';
import {
    MatchJoinMode,
    MatchParticipantState,
    MatchResultState,
    MatchState,
    MatchTeamChoice,
    MatchTeamCode,
    MatchWaitlistState,
    Prisma,
} from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { CursorService } from '../identity/cursor.service';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { OutboxService } from '../outbox/outbox.service';
import { chooseTeam, normalizeText, recommendation, validateResult } from './match.domain';
import type {
    DraftMatchDto,
    JoinMatchDto,
    MatchSearchDto,
    ProposeResultDto,
    ResolveResultDto,
    UpdateMatchDto,
} from './match.dto';
import { BookingStateDto, MatchFormatDto } from './match.dto';
import { matchError } from './match.errors';
import { MatchPolicyService } from './match.policy';

const includeMatch = {
    teams: { orderBy: { code: 'asc' as const } },
    participants: { orderBy: [{ joinedAt: 'asc' as const }, { id: 'asc' as const }] },
    guests: { orderBy: [{ team: 'asc' as const }, { createdAt: 'asc' as const }] },
    results: {
        where: { state: { in: [MatchResultState.PROPOSED, MatchResultState.DISPUTED, MatchResultState.CONFIRMED] } },
        include: { games: { orderBy: { gameNumber: 'asc' as const } }, confirmations: true },
        take: 1,
    },
    waitlistEntries: { where: { state: MatchWaitlistState.OFFERED } },
} satisfies Prisma.MatchInclude;
type MatchAggregate = Prisma.MatchGetPayload<{ include: typeof includeMatch }>;

interface SearchRow {
    id: string;
    format: 'SINGLES' | 'DOUBLES';
    startsAt: Date;
    timeZone: string;
    skillMin: number;
    skillMax: number;
    distanceMeters: number | null;
    teamAOccupied: number;
    teamBOccupied: number;
    teamAReserved: number;
    teamBReserved: number;
}

interface MatchCursor {
    type: 'match-search';
    bind: string;
    snapshotAt: string;
    lastId: string;
    lastStartsAt: string;
    lastScore?: number;
}

@Injectable()
export class MatchService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly policy: MatchPolicyService,
        private readonly cursors: CursorService,
        private readonly crypto: IdentityCryptoService,
        private readonly outbox: OutboxService,
        private readonly audit: AuditService,
        private readonly context: RequestContextService
    ) {}

    async search(
        query: MatchSearchDto,
        profile?: { skill: number; preferredFormat: 'SINGLES' | 'DOUBLES' | null }
    ): Promise<object> {
        this.validateSearch(query);
        const recommended = profile !== undefined;
        const bind = this.crypto.hash(
            JSON.stringify({
                recommended,
                profile,
                format: query.format,
                startsFrom: query.startsFrom,
                startsTo: query.startsTo,
                skillLevel: query.skillLevel,
                longitude: query.longitude,
                latitude: query.latitude,
                radiusMeters: query.radiusMeters,
                limit: query.limit,
            })
        );
        const cursor = query.cursor === undefined ? undefined : this.decodeCursor(query.cursor, bind);
        const snapshotAt = cursor?.snapshotAt ?? this.policy.now().toISOString();
        const from = query.startsFrom === undefined ? this.policy.now() : new Date(query.startsFrom);
        const policyEnd = new Date(this.policy.now().getTime() + this.policy.current.publishHorizonMs);
        const to =
            query.startsTo === undefined
                ? policyEnd
                : new Date(Math.min(new Date(query.startsTo).getTime(), policyEnd.getTime()));
        const hasLocation = query.longitude !== undefined;
        const effectiveSkill = query.skillLevel ?? profile?.skill;
        const location = hasLocation
            ? Prisma.sql`ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography`
            : Prisma.sql`NULL::geography`;
        const pagination =
            cursor === undefined || recommended
                ? Prisma.empty
                : Prisma.sql`AND (m.starts_at, m.id) > (${new Date(cursor.lastStartsAt)}, ${cursor.lastId}::uuid)`;
        const rows = await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
            SELECT m.id, m.format::text AS format, m.starts_at AS "startsAt", m.time_zone AS "timeZone",
                m.skill_min::double precision AS "skillMin", m.skill_max::double precision AS "skillMax",
                CASE WHEN ${hasLocation} THEN ST_Distance(COALESCE(v.location, vc.location), ${location}) ELSE NULL END AS "distanceMeters",
                count(DISTINCT p.id) FILTER (WHERE p.team = 'TEAM_A' AND p.state = 'ACTIVE')::int + count(DISTINCT g.id) FILTER (WHERE g.team = 'TEAM_A')::int AS "teamAOccupied",
                count(DISTINCT p.id) FILTER (WHERE p.team = 'TEAM_B' AND p.state = 'ACTIVE')::int + count(DISTINCT g.id) FILTER (WHERE g.team = 'TEAM_B')::int AS "teamBOccupied",
                count(DISTINCT w.id) FILTER (WHERE w.offered_team = 'TEAM_A' AND w.state = 'OFFERED')::int AS "teamAReserved",
                count(DISTINCT w.id) FILTER (WHERE w.offered_team = 'TEAM_B' AND w.state = 'OFFERED')::int AS "teamBReserved"
            FROM matches m LEFT JOIN venues v ON v.id = m.venue_id LEFT JOIN venue_candidates vc ON vc.id = m.venue_candidate_id
            LEFT JOIN match_participants p ON p.match_id = m.id LEFT JOIN match_guest_slots g ON g.match_id = m.id
            LEFT JOIN waitlist_entries w ON w.match_id = m.id
            WHERE m.visibility = 'PUBLIC' AND m.state = 'PUBLISHED' AND m.created_at <= ${new Date(snapshotAt)}
              AND m.starts_at >= ${from} AND m.starts_at <= ${to}
              ${query.format === undefined ? Prisma.empty : Prisma.sql`AND m.format = ${query.format}::match_format`}
              ${effectiveSkill === undefined ? Prisma.empty : Prisma.sql`AND ${effectiveSkill} BETWEEN m.skill_min AND m.skill_max`}
              ${hasLocation ? Prisma.sql`AND ST_DWithin(COALESCE(v.location, vc.location), ${location}, ${query.radiusMeters})` : Prisma.empty}
              ${pagination}
            GROUP BY m.id, v.location, vc.location ORDER BY m.starts_at, m.id
            ${recommended ? Prisma.empty : Prisma.sql`LIMIT ${query.limit + 1}`}`);
        let ranked = rows.map((row) => {
            const capacity = row.format === 'SINGLES' ? 1 : 2;
            const item: Record<string, unknown> = {
                id: row.id,
                state: 'PUBLISHED',
                format: row.format,
                startsAt: row.startsAt.toISOString(),
                timeZone: row.timeZone,
                skillMin: row.skillMin,
                skillMax: row.skillMax,
                teams: [
                    { code: 'TEAM_A', capacity, occupiedPlaces: row.teamAOccupied, reservedPlaces: row.teamAReserved },
                    { code: 'TEAM_B', capacity, occupiedPlaces: row.teamBOccupied, reservedPlaces: row.teamBReserved },
                ],
            };
            if (profile !== undefined)
                Object.assign(
                    item,
                    recommendation({
                        distanceMeters: row.distanceMeters,
                        radiusMeters: query.radiusMeters ?? null,
                        startsAt: row.startsAt,
                        startsFrom: query.startsFrom === undefined ? null : new Date(query.startsFrom),
                        startsTo: query.startsTo === undefined ? null : new Date(query.startsTo),
                        format: row.format,
                        preferredFormat: profile.preferredFormat,
                        skillMin: row.skillMin,
                        skillMax: row.skillMax,
                        playerSkill: profile.skill,
                    })
                );
            return item;
        });
        if (recommended)
            ranked.sort(
                (a, b) =>
                    Number(b.score) - Number(a.score) ||
                    String(a.startsAt).localeCompare(String(b.startsAt)) ||
                    String(a.id).localeCompare(String(b.id))
            );
        if (recommended && cursor !== undefined)
            ranked = ranked.filter(
                (item) =>
                    Number(item.score) < (cursor.lastScore ?? 101) ||
                    (Number(item.score) === cursor.lastScore &&
                        (String(item.startsAt) > cursor.lastStartsAt ||
                            (String(item.startsAt) === cursor.lastStartsAt && String(item.id) > cursor.lastId)))
            );
        const hasNext = ranked.length > query.limit;
        const items = ranked.slice(0, query.limit);
        const last = items.at(-1);
        return {
            items,
            pageInfo: {
                hasNext,
                nextCursor:
                    hasNext && last !== undefined
                        ? this.cursors.encode({
                              type: 'match-search',
                              bind,
                              snapshotAt,
                              lastId: String(last.id),
                              lastStartsAt: String(last.startsAt),
                              ...(recommended ? { lastScore: Number(last.score) } : {}),
                          })
                        : null,
            },
            snapshotAt,
            ...(recommended ? { recommendationPolicyVersion: this.policy.current.version } : {}),
        };
    }

    async profile(userId: string): Promise<{ skill: number; preferredFormat: 'SINGLES' | 'DOUBLES' | null }> {
        const draft = await this.prisma.playerProfileDraft.findUnique({ where: { userId } });
        if (draft?.completedAt === null || draft?.skillSelfAssessment === null || draft === null)
            throw matchError('ONBOARDING_REQUIRED', 403);
        const preferred = draft.gameFormats.find((value) => value === 'SINGLES' || value === 'DOUBLES');
        return {
            skill: Number(draft.skillSelfAssessment),
            preferredFormat: preferred ?? null,
        };
    }

    async create(userId: string, body: DraftMatchDto, tx: Prisma.TransactionClient): Promise<object> {
        await this.assertOnboarded(userId, tx);
        this.validateDraft(body);
        this.assertDraftCapacity(body.format ?? null, body.guests ?? []);
        if (
            (body.bookingState ?? BookingStateDto.UNKNOWN) !== BookingStateDto.BOOKED_EXTERNALLY &&
            body.bookingNote != null
        )
            throw matchError('VALIDATION_FAILED', 400);
        const now = this.policy.now();
        const id = uuidV7();
        const capacity = body.format === MatchFormatDto.SINGLES ? 1 : 2;
        await tx.match.create({
            data: {
                id,
                organizerId: userId,
                ...this.draftData(body),
                createdAt: now,
                updatedAt: now,
                teams: {
                    create: [
                        { code: MatchTeamCode.TEAM_A, capacity },
                        { code: MatchTeamCode.TEAM_B, capacity },
                    ],
                },
                participants: {
                    create: { id: uuidV7(), userId, team: MatchTeamCode.TEAM_A, isOrganizer: true, joinedAt: now },
                },
                guests: {
                    create: (body.guests ?? []).map((guest) => ({
                        id: uuidV7(),
                        team: guest.team,
                        label: normalizeText(guest.label) ?? '',
                        createdBy: userId,
                        createdAt: now,
                    })),
                },
            },
        });
        await this.event(tx, 'match.created.v1', now, { matchId: id, aggregateVersion: 0 });
        await this.auditEntry(tx, userId, 'match.created', id, ['state']);
        return this.getAggregate(id, tx);
    }

    async detail(id: string, userId?: string): Promise<object> {
        const aggregate = await this.prisma.match.findUnique({ where: { id }, include: includeMatch });
        if (
            aggregate === null ||
            ((aggregate.visibility !== 'PUBLIC' || aggregate.state !== 'PUBLISHED') &&
                aggregate.organizerId !== userId &&
                !aggregate.participants.some((p) => p.userId === userId))
        )
            throw matchError('MATCH_NOT_FOUND', 404);
        return this.project(aggregate);
    }

    async inviteDetail(token: string): Promise<object> {
        const invite = await this.prisma.matchInvite.findUnique({
            where: { tokenHash: this.crypto.hash(`MATCH_INVITE:${token}`) },
            include: { match: { include: includeMatch } },
        });
        if (
            invite === null ||
            invite.revokedAt !== null ||
            invite.expiresAt <= this.policy.now() ||
            invite.match.visibility !== 'UNLISTED' ||
            invite.match.state !== 'PUBLISHED'
        )
            throw matchError('INVITE_INVALID', 404);
        return this.project(invite.match);
    }

    async update(userId: string, id: string, body: UpdateMatchDto, tx: Prisma.TransactionClient): Promise<object> {
        const match = await this.lock(id, tx);
        this.organizer(match, userId);
        this.version(match, body.expectedVersion);
        if (match.state !== MatchState.DRAFT) throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        this.validateDraft(body);
        const effectiveFormat = body.format === undefined ? match.format : body.format;
        const guests = body.guests ?? (await tx.matchGuestSlot.findMany({ where: { matchId: id } }));
        this.assertDraftCapacity(effectiveFormat, guests);
        const bookingState = body.bookingState ?? match.bookingState;
        const bookingNote = body.bookingNote === undefined ? match.bookingNote : body.bookingNote;
        if (bookingState !== 'BOOKED_EXTERNALLY' && bookingNote !== null) throw matchError('VALIDATION_FAILED', 400);
        const skillMin = body.skillMin === undefined ? match.skillMin : body.skillMin;
        const skillMax = body.skillMax === undefined ? match.skillMax : body.skillMax;
        if (
            (skillMin === null) !== (skillMax === null) ||
            (skillMin !== null && skillMax !== null && Number(skillMin) > Number(skillMax))
        )
            throw matchError('VALIDATION_FAILED', 400);
        const capacity = body.format === undefined ? undefined : body.format === MatchFormatDto.SINGLES ? 1 : 2;
        await tx.match.update({
            where: { id },
            data: { ...this.draftData(body), version: { increment: 1 }, updatedAt: this.policy.now() },
        });
        if (capacity !== undefined) await tx.matchTeam.updateMany({ where: { matchId: id }, data: { capacity } });
        if (body.guests !== undefined) {
            await tx.matchGuestSlot.deleteMany({ where: { matchId: id } });
            await tx.matchGuestSlot.createMany({
                data: body.guests.map((guest) => ({
                    id: uuidV7(),
                    matchId: id,
                    team: guest.team,
                    label: normalizeText(guest.label) ?? '',
                    createdBy: userId,
                    createdAt: this.policy.now(),
                })),
            });
        }
        await this.auditEntry(
            tx,
            userId,
            'match.draft.updated',
            id,
            Object.keys(body).filter((key) => key !== 'expectedVersion')
        );
        return this.getAggregate(id, tx);
    }

    async remove(userId: string, id: string, expectedVersion: number, tx: Prisma.TransactionClient): Promise<object> {
        const match = await this.lock(id, tx);
        this.organizer(match, userId);
        this.version(match, expectedVersion);
        if (match.state !== MatchState.DRAFT) throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        await tx.match.delete({ where: { id } });
        return {};
    }

    async publish(userId: string, id: string, expectedVersion: number, tx: Prisma.TransactionClient): Promise<object> {
        const match = await this.lock(id, tx);
        this.organizer(match, userId);
        this.version(match, expectedVersion);
        if (match.state !== MatchState.DRAFT) throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        const now = this.policy.now();
        await this.assertPublishable(match, now, tx);
        const updated = await tx.match.update({
            where: { id },
            data: {
                state: MatchState.PUBLISHED,
                version: { increment: 1 },
                policyVersion: this.policy.current.version,
                publishedAt: now,
                updatedAt: now,
            },
        });
        await this.event(tx, 'match.published.v1', now, {
            matchId: id,
            aggregateVersion: updated.version,
            format: match.format,
            visibility: match.visibility,
            joinMode: match.joinMode,
        });
        await this.auditEntry(tx, userId, 'match.published', id, ['state', 'policyVersion', 'publishedAt']);
        if (match.visibility === 'UNLISTED') return this.rotateInviteLocked(userId, updated, tx, false);
        return this.getAggregate(id, tx);
    }

    async rotateInvite(
        userId: string,
        id: string,
        expectedVersion: number,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const match = await this.lock(id, tx);
        this.organizer(match, userId);
        this.version(match, expectedVersion);
        if (match.state !== MatchState.PUBLISHED || match.visibility !== 'UNLISTED')
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        return this.rotateInviteLocked(userId, match, tx, true);
    }

    private async rotateInviteLocked(
        userId: string,
        match: { id: string; version: number; startsAt: Date | null },
        tx: Prisma.TransactionClient,
        increment: boolean
    ): Promise<object> {
        const now = this.policy.now();
        const token = this.crypto.secret();
        await tx.matchInvite.updateMany({ where: { matchId: match.id, revokedAt: null }, data: { revokedAt: now } });
        const aggregateVersion = increment ? match.version + 1 : match.version;
        if (increment)
            await tx.match.update({ where: { id: match.id }, data: { version: { increment: 1 }, updatedAt: now } });
        await tx.matchInvite.create({
            data: {
                id: uuidV7(),
                matchId: match.id,
                version: aggregateVersion,
                tokenHash: this.crypto.hash(`MATCH_INVITE:${token}`),
                keyVersion: 1,
                createdAt: now,
                expiresAt: new Date((match.startsAt ?? now).getTime() + 86_400_000),
            },
        });
        await this.auditEntry(tx, userId, 'match.invite.rotated', match.id, ['inviteVersion']);
        return { matchId: match.id, token, createdAt: now.toISOString() };
    }

    async join(userId: string, id: string, body: JoinMatchDto, tx: Prisma.TransactionClient): Promise<object> {
        await this.assertOnboarded(userId, tx);
        const match = await this.lock(id, tx);
        this.version(match, body.expectedVersion);
        this.assertJoinable(match);
        const profile = await tx.playerProfileDraft.findUniqueOrThrow({ where: { userId } });
        if (
            Number(profile.skillSelfAssessment) < Number(match.skillMin) ||
            Number(profile.skillSelfAssessment) > Number(match.skillMax)
        )
            throw matchError('LEVEL_NOT_ELIGIBLE', 409);
        await this.assertNotInvolved(id, userId, tx);
        const now = this.policy.now();
        let participantId: string | undefined;
        let joinRequestId: string | undefined;
        let waitlistId: string | undefined;
        let outcome: 'AUTO_JOINED' | 'AUTO_WAITLISTED' | 'APPROVAL_PENDING';
        if (match.joinMode === MatchJoinMode.APPROVAL) {
            joinRequestId = uuidV7();
            outcome = 'APPROVAL_PENDING';
            await tx.joinRequest.create({
                data: {
                    id: joinRequestId,
                    matchId: id,
                    requesterId: userId,
                    teamChoice: body.teamChoice,
                    createdAt: now,
                },
            });
        } else {
            const team = await this.availableTeam(id, body.teamChoice, tx);
            if (team === null) {
                waitlistId = await this.enqueue(id, userId, body.teamChoice, tx);
                outcome = 'AUTO_WAITLISTED';
            } else {
                participantId = uuidV7();
                outcome = 'AUTO_JOINED';
                await tx.matchParticipant.create({
                    data: { id: participantId, matchId: id, userId, team, joinedAt: now },
                });
            }
        }
        const updated = await tx.match.update({ where: { id }, data: { version: { increment: 1 }, updatedAt: now } });
        await this.event(tx, 'match.join.intent.recorded.v1', now, {
            matchId: id,
            aggregateVersion: updated.version,
            outcome,
            teamChoice: body.teamChoice,
        });
        if (participantId !== undefined) await this.rosterEvent(tx, id, updated.version, now);
        return this.joinOutcome(id, participantId, joinRequestId, waitlistId, tx);
    }

    async listRequests(userId: string, id: string, limit: number, cursor?: string): Promise<object> {
        const match = await this.prisma.match.findUnique({ where: { id } });
        if (match === null) throw matchError('MATCH_NOT_FOUND', 404);
        this.organizer(match, userId);
        const after =
            cursor === undefined
                ? undefined
                : this.cursors.decode<{ type: 'match-request'; matchId: string; createdAt: string; id: string }>(
                      cursor,
                      'match-request'
                  );
        if (after !== undefined && after.matchId !== id) throw matchError('INVALID_CURSOR', 400);
        const items = await this.prisma.joinRequest.findMany({
            where: {
                matchId: id,
                ...(after === undefined
                    ? {}
                    : {
                          OR: [
                              { createdAt: { gt: new Date(after.createdAt) } },
                              { createdAt: new Date(after.createdAt), id: { gt: after.id } },
                          ],
                      }),
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
        });
        return this.simplePage(items, limit, (last) =>
            this.cursors.encode({
                type: 'match-request',
                matchId: id,
                createdAt: last.createdAt.toISOString(),
                id: last.id,
            })
        );
    }

    async decideRequest(
        userId: string,
        id: string,
        requestId: string,
        expectedVersion: number,
        decision: 'APPROVED' | 'REJECTED' | 'WITHDRAWN',
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const match = await this.lock(id, tx);
        this.version(match, expectedVersion);
        const request = await tx.joinRequest.findUnique({ where: { id: requestId } });
        if (request === null || request.matchId !== id) throw matchError('MATCH_NOT_FOUND', 404);
        if (decision === 'WITHDRAWN') {
            if (request.requesterId !== userId) throw matchError('REQUEST_NOT_ALLOWED', 403);
        } else this.organizer(match, userId);
        if (request.state !== 'PENDING') throw matchError('JOIN_REQUEST_NOT_PENDING', 409);
        const now = this.policy.now();
        let participantId: string | undefined;
        let waitlistId: string | undefined;
        const updatedRequest = await tx.joinRequest.update({
            where: { id: requestId },
            data: { state: decision, decidedAt: now },
        });
        if (decision === 'APPROVED') {
            this.assertJoinable(match);
            const team = await this.availableTeam(id, request.teamChoice, tx);
            if (team === null) waitlistId = await this.enqueue(id, request.requesterId, request.teamChoice, tx);
            else {
                participantId = uuidV7();
                await tx.matchParticipant.create({
                    data: { id: participantId, matchId: id, userId: request.requesterId, team, joinedAt: now },
                });
            }
        }
        const updated = await tx.match.update({ where: { id }, data: { version: { increment: 1 }, updatedAt: now } });
        if (participantId !== undefined) await this.rosterEvent(tx, id, updated.version, now);
        return decision === 'APPROVED'
            ? this.joinOutcome(id, participantId, requestId, waitlistId, tx)
            : this.projectRequest(updatedRequest);
    }

    async listWaitlist(userId: string, id: string, limit: number): Promise<object> {
        const match = await this.prisma.match.findUnique({ where: { id } });
        if (match === null) throw matchError('MATCH_NOT_FOUND', 404);
        const items = await this.prisma.waitlistEntry.findMany({
            where: { matchId: id, ...(match.organizerId === userId ? {} : { playerId: userId }) },
            orderBy: { sequence: 'asc' },
            take: limit + 1,
        });
        return this.simplePage(
            items.map((item) => this.projectWaitlist(item)),
            limit,
            () => null
        );
    }

    async withdrawWaitlist(
        userId: string,
        id: string,
        entryId: string,
        expectedVersion: number,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const match = await this.lock(id, tx);
        this.version(match, expectedVersion);
        const entry = await tx.waitlistEntry.findUnique({ where: { id: entryId } });
        if (entry === null || entry.matchId !== id) throw matchError('MATCH_NOT_FOUND', 404);
        if (entry.playerId !== userId) throw matchError('REQUEST_NOT_ALLOWED', 403);
        if (entry.state !== 'WAITING' && entry.state !== 'OFFERED') throw matchError('WAITLIST_ORDER_CONFLICT', 409);
        const now = this.policy.now();
        const updatedEntry = await tx.waitlistEntry.update({
            where: { id: entryId },
            data: {
                state: 'WITHDRAWN',
                resolvedAt: now,
                ...(entry.state === 'OFFERED' ? { offeredTeam: null, offeredAt: null, offerExpiresAt: null } : {}),
            },
        });
        const updated = await tx.match.update({ where: { id }, data: { version: { increment: 1 }, updatedAt: now } });
        if (entry.state === 'OFFERED') await this.promoteNext(id, tx);
        await this.rosterEvent(tx, id, updated.version, now);
        return this.projectWaitlist(updatedEntry);
    }

    async promoteWaitlist(
        userId: string,
        id: string,
        entryId: string,
        expectedVersion: number,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const match = await this.lock(id, tx);
        this.organizer(match, userId);
        this.version(match, expectedVersion);
        const entry = await tx.waitlistEntry.findUnique({ where: { id: entryId } });
        if (entry === null || entry.matchId !== id || entry.state !== MatchWaitlistState.OFFERED)
            throw matchError('WAITLIST_ORDER_CONFLICT', 409);
        if (entry.offerExpiresAt === null || entry.offerExpiresAt <= this.policy.now())
            throw matchError('OFFER_EXPIRED', 409);
        const earlier = await tx.waitlistEntry.count({
            where: {
                matchId: id,
                sequence: { lt: entry.sequence },
                state: { in: [MatchWaitlistState.WAITING, MatchWaitlistState.OFFERED] },
                OR: [{ teamChoice: MatchTeamChoice.ANY }, { teamChoice: entry.offeredTeam as MatchTeamChoice }],
            },
        });
        if (earlier > 0) throw matchError('WAITLIST_ORDER_CONFLICT', 409);
        const participantId = uuidV7();
        const now = this.policy.now();
        await tx.waitlistEntry.update({
            where: { id: entryId },
            data: { state: MatchWaitlistState.PROMOTED, resolvedAt: now },
        });
        await tx.matchParticipant.create({
            data: {
                id: participantId,
                matchId: id,
                userId: entry.playerId,
                team: entry.offeredTeam ?? MatchTeamCode.TEAM_B,
                joinedAt: now,
            },
        });
        const updated = await tx.match.update({ where: { id }, data: { version: { increment: 1 }, updatedAt: now } });
        await this.rosterEvent(tx, id, updated.version, now);
        return this.joinOutcome(id, participantId, undefined, entryId, tx);
    }

    async leave(
        userId: string,
        id: string,
        participantId: string,
        expectedVersion: number,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const match = await this.lock(id, tx);
        this.version(match, expectedVersion);
        const participant = await tx.matchParticipant.findUnique({ where: { id: participantId } });
        if (participant === null || participant.matchId !== id) throw matchError('MATCH_NOT_FOUND', 404);
        if (participant.userId !== userId || participant.isOrganizer) throw matchError('REQUEST_NOT_ALLOWED', 403);
        if (participant.state !== MatchParticipantState.ACTIVE || match.state !== MatchState.PUBLISHED)
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        const now = this.policy.now();
        await tx.matchParticipant.update({
            where: { id: participantId },
            data: { state: MatchParticipantState.LEFT, resolvedAt: now },
        });
        const updated = await tx.match.update({ where: { id }, data: { version: { increment: 1 }, updatedAt: now } });
        await this.promoteNext(id, tx);
        await this.rosterEvent(tx, id, updated.version, now);
        await this.auditEntry(tx, userId, 'match.participant.left', id, ['participants']);
        return this.getAggregate(id, tx);
    }

    async cancel(userId: string, id: string, expectedVersion: number, tx: Prisma.TransactionClient): Promise<object> {
        const match = await this.lock(id, tx);
        this.organizer(match, userId);
        this.version(match, expectedVersion);
        if (match.state !== MatchState.DRAFT && match.state !== MatchState.PUBLISHED)
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        const now = this.policy.now();
        const stage = match.state;
        await tx.joinRequest.updateMany({
            where: { matchId: id, state: 'PENDING' },
            data: { state: 'EXPIRED', decidedAt: now },
        });
        await tx.waitlistEntry.updateMany({
            where: { matchId: id, state: { in: ['WAITING', 'OFFERED'] } },
            data: { state: 'EXPIRED', resolvedAt: now },
        });
        await tx.matchParticipant.updateMany({
            where: { matchId: id, state: 'ACTIVE' },
            data: { state: 'CANCELLED', resolvedAt: now },
        });
        await tx.matchInvite.updateMany({ where: { matchId: id, revokedAt: null }, data: { revokedAt: now } });
        const updated = await tx.match.update({
            where: { id },
            data: { state: 'CANCELLED', version: { increment: 1 }, updatedAt: now },
        });
        await this.event(tx, 'match.cancelled.v1', now, { matchId: id, aggregateVersion: updated.version, stage });
        await this.auditEntry(tx, userId, 'match.cancelled', id, ['state']);
        return this.getAggregate(id, tx);
    }

    async start(userId: string, id: string, expectedVersion: number, tx: Prisma.TransactionClient): Promise<object> {
        const match = await this.lock(id, tx);
        this.organizer(match, userId);
        this.version(match, expectedVersion);
        if (match.state !== MatchState.PUBLISHED || match.startsAt === null)
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        const now = this.policy.now();
        if (
            now.getTime() < match.startsAt.getTime() - this.policy.current.startEarlyMs ||
            now.getTime() >= match.startsAt.getTime() + this.policy.current.startLateMs
        )
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        const teams = await tx.matchParticipant.groupBy({
            by: ['team'],
            where: { matchId: id, state: 'ACTIVE' },
            _count: true,
        });
        if (
            !teams.some((team) => team.team === 'TEAM_A' && team._count > 0) ||
            !teams.some((team) => team.team === 'TEAM_B' && team._count > 0)
        )
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        await tx.joinRequest.updateMany({
            where: { matchId: id, state: 'PENDING' },
            data: { state: 'EXPIRED', decidedAt: now },
        });
        await tx.waitlistEntry.updateMany({
            where: { matchId: id, state: { in: ['WAITING', 'OFFERED'] } },
            data: { state: 'EXPIRED', resolvedAt: now },
        });
        const updated = await tx.match.update({
            where: { id },
            data: { state: 'IN_PROGRESS', version: { increment: 1 }, updatedAt: now },
        });
        const roster = (await this.isRosterComplete(id, tx)) ? 'FULL' : 'MINIMUM';
        await this.event(tx, 'match.started.v1', now, {
            matchId: id,
            aggregateVersion: updated.version,
            format: match.format,
            roster,
        });
        await this.auditEntry(tx, userId, 'match.started', id, ['state']);
        return this.getAggregate(id, tx);
    }

    async proposeResult(
        userId: string,
        id: string,
        body: ProposeResultDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const match = await this.lock(id, tx);
        this.organizer(match, userId);
        this.version(match, body.expectedVersion);
        if (match.state !== MatchState.IN_PROGRESS && match.state !== MatchState.AWAITING_CONFIRMATION)
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        const now = this.policy.now();
        if (match.startsAt === null || now.getTime() >= match.startsAt.getTime() + this.policy.current.resultMs)
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        validateResult(body.mode, body.seriesFormat, body.winningTeam, body.games);
        const current = await tx.matchResult.findFirst({ where: { matchId: id, state: MatchResultState.PROPOSED } });
        if (match.state === MatchState.AWAITING_CONFIRMATION && current === null)
            throw matchError('RESULT_VERSION_CONFLICT', 409);
        if (current !== null)
            await tx.matchResult.update({
                where: { id: current.id },
                data: { state: MatchResultState.SUPERSEDED, resolvedAt: now },
            });
        const version =
            (await tx.matchResult.aggregate({ where: { matchId: id }, _max: { version: true } }))._max.version ?? 0;
        const createdResult = await tx.matchResult.create({
            data: {
                id: uuidV7(),
                matchId: id,
                version: version + 1,
                mode: body.mode,
                seriesFormat: body.seriesFormat ?? null,
                winningTeam: body.winningTeam ?? null,
                proposedBy: userId,
                proposedAt: now,
                games: { create: (body.games ?? []).map((game) => game) },
            },
        });
        const result = await tx.matchResult.findUniqueOrThrow({
            where: { id: createdResult.id },
            include: { games: true, confirmations: true },
        });
        const updated = await tx.match.update({
            where: { id },
            data: { state: 'AWAITING_CONFIRMATION', version: { increment: 1 }, updatedAt: now },
        });
        await this.event(tx, 'match.result.proposed.v1', now, {
            matchId: id,
            aggregateVersion: updated.version,
            resultId: result.id,
            resultVersion: result.version,
            mode: result.mode,
        });
        await this.auditEntry(tx, userId, 'match.result.proposed', id, ['state', 'resultVersion']);
        return this.projectResult(result);
    }

    async resolveResult(
        userId: string,
        id: string,
        resultId: string,
        body: ResolveResultDto,
        decision: 'CONFIRMED' | 'DISPUTED',
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const match = await this.lock(id, tx);
        this.version(match, body.expectedVersion);
        if (match.state !== MatchState.AWAITING_CONFIRMATION) throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        const result = await tx.matchResult.findUnique({
            where: { id: resultId },
            include: { games: true, confirmations: true },
        });
        if (
            result === null ||
            result.matchId !== id ||
            result.version !== body.resultVersion ||
            result.state !== MatchResultState.PROPOSED
        )
            throw matchError('RESULT_VERSION_CONFLICT', 409);
        const proposer = await tx.matchParticipant.findFirst({ where: { matchId: id, userId: result.proposedBy } });
        const actor = await tx.matchParticipant.findFirst({
            where: { matchId: id, userId, state: MatchParticipantState.ACTIVE },
        });
        if (actor === null || proposer === null || actor.team === proposer.team)
            throw matchError('RESULT_CONFIRMATION_FORBIDDEN', 403);
        const now = this.policy.now();
        if (now.getTime() >= result.proposedAt.getTime() + this.policy.current.confirmationMs)
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        await tx.resultConfirmation.create({
            data: { id: uuidV7(), resultId, playerId: userId, decision, createdAt: now },
        });
        const resolved = await tx.matchResult.update({
            where: { id: resultId },
            data: { state: decision, resolvedAt: now },
            include: { games: true, confirmations: true },
        });
        const updated = await tx.match.update({
            where: { id },
            data: {
                state: decision === 'CONFIRMED' ? 'COMPLETED' : 'DISPUTED',
                version: { increment: 1 },
                updatedAt: now,
            },
        });
        if (decision === 'DISPUTED') {
            await this.event(tx, 'match.result.disputed.v1', now, {
                matchId: id,
                aggregateVersion: updated.version,
                resultId,
                resultVersion: result.version,
                mode: result.mode,
            });
        } else {
            await tx.matchParticipant.updateMany({
                where: { matchId: id, state: 'ACTIVE' },
                data: { state: 'PLAYED', resolvedAt: now },
            });
            const marker = await tx.matchMetricMarker.create({
                data: {
                    id: uuidV7(),
                    matchId: id,
                    resultId,
                    metricType: 'CONFIRMED_MATCH',
                    confirmationPath: 'PLAYER',
                    confirmedAt: now,
                },
            });
            await this.event(tx, 'match.completed.confirmed.v1', now, {
                matchId: id,
                aggregateVersion: updated.version,
                resultId,
                resultVersion: result.version,
                markerId: marker.id,
                mode: result.mode,
                format: match.format,
                confirmationPath: 'PLAYER',
            });
        }
        await this.auditEntry(tx, userId, `match.result.${decision.toLowerCase()}`, id, ['state', 'result']);
        return this.projectResult(resolved);
    }

    async expireOffersBatch(limit = 50): Promise<number> {
        let processed = 0;
        for (let index = 0; index < limit; index += 1) {
            const changed = await this.prisma.$transaction(
                async (tx) => {
                    const candidates = await tx.$queryRaw<{ matchId: string; entryId: string }[]>(Prisma.sql`
                    SELECT m.id AS "matchId", w.id AS "entryId" FROM matches m
                    JOIN waitlist_entries w ON w.match_id = m.id
                    WHERE w.state = 'OFFERED' AND w.offer_expires_at <= ${this.policy.now()}
                    ORDER BY w.offer_expires_at, w.sequence FOR UPDATE OF m SKIP LOCKED LIMIT 1`);
                    const candidate = candidates[0];
                    if (candidate === undefined) return false;
                    const entry = await tx.waitlistEntry.findUnique({ where: { id: candidate.entryId } });
                    if (
                        entry?.state !== MatchWaitlistState.OFFERED ||
                        entry.offerExpiresAt === null ||
                        entry.offerExpiresAt > this.policy.now()
                    )
                        return false;
                    const now = this.policy.now();
                    await tx.waitlistEntry.update({
                        where: { id: entry.id },
                        data: { state: MatchWaitlistState.EXPIRED, resolvedAt: now },
                    });
                    const match = await tx.match.update({
                        where: { id: candidate.matchId },
                        data: { version: { increment: 1 }, updatedAt: now },
                    });
                    await this.promoteNext(candidate.matchId, tx);
                    await this.rosterEvent(tx, candidate.matchId, match.version, now);
                    return true;
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            );
            if (!changed) break;
            processed += 1;
        }
        return processed;
    }

    private validateSearch(query: MatchSearchDto): void {
        const location = [query.longitude, query.latitude, query.radiusMeters];
        if (location.some((value) => value !== undefined) && !location.every((value) => value !== undefined))
            throw matchError('VALIDATION_FAILED', 400);
        if (
            query.startsFrom !== undefined &&
            query.startsTo !== undefined &&
            new Date(query.startsFrom) >= new Date(query.startsTo)
        )
            throw matchError('VALIDATION_FAILED', 400);
    }

    private decodeCursor(value: string, bind: string): MatchCursor {
        try {
            const cursor = this.cursors.decode<MatchCursor>(value, 'match-search');
            if (cursor.bind !== bind) throw new Error('filter mismatch');
            return cursor;
        } catch {
            throw matchError('INVALID_CURSOR', 400);
        }
    }

    private validateDraft(body: DraftMatchDto): void {
        if (
            body.venueId !== undefined &&
            body.venueId !== null &&
            body.venueCandidateId !== undefined &&
            body.venueCandidateId !== null
        )
            throw matchError('VALIDATION_FAILED', 400);
        if (
            (body.skillMin !== undefined && body.skillMin !== null && (body.skillMin * 2) % 1 !== 0) ||
            (body.skillMax !== undefined && body.skillMax !== null && (body.skillMax * 2) % 1 !== 0)
        )
            throw matchError('VALIDATION_FAILED', 400);
        if (
            body.skillMin !== undefined &&
            body.skillMin !== null &&
            body.skillMax !== undefined &&
            body.skillMax !== null &&
            body.skillMin > body.skillMax
        )
            throw matchError('VALIDATION_FAILED', 400);
        if ((body.guests ?? []).some((guest) => /https?:\/\/|www\.|@/iu.test(guest.label)))
            throw matchError('VALIDATION_FAILED', 400);
        if (body.timeZone !== undefined && body.timeZone !== null) {
            try {
                new Intl.DateTimeFormat('ru-RU', { timeZone: body.timeZone });
            } catch {
                throw matchError('VALIDATION_FAILED', 400);
            }
        }
    }

    private draftData(
        body: DraftMatchDto
    ): Omit<Prisma.MatchUncheckedCreateInput, 'id' | 'organizerId' | 'createdAt' | 'updatedAt'> {
        return {
            ...(body.format === undefined ? {} : { format: body.format }),
            ...(body.visibility === undefined ? {} : { visibility: body.visibility }),
            ...(body.joinMode === undefined ? {} : { joinMode: body.joinMode }),
            ...(body.startsAt === undefined
                ? {}
                : { startsAt: body.startsAt === null ? null : new Date(body.startsAt) }),
            ...(body.timeZone === undefined ? {} : { timeZone: normalizeText(body.timeZone) ?? null }),
            ...(body.venueId === undefined ? {} : { venueId: body.venueId }),
            ...(body.venueId === undefined
                ? body.venueCandidateId === undefined
                    ? {}
                    : {
                          venueCandidateId: body.venueCandidateId,
                          ...(body.venueCandidateId === null ? {} : { venueId: null }),
                      }
                : { venueId: body.venueId, ...(body.venueId === null ? {} : { venueCandidateId: null }) }),
            ...(body.skillMin === undefined ? {} : { skillMin: body.skillMin }),
            ...(body.skillMax === undefined ? {} : { skillMax: body.skillMax }),
            ...(body.description === undefined ? {} : { description: normalizeText(body.description) ?? null }),
            ...(body.bookingState === undefined ? {} : { bookingState: body.bookingState }),
            ...(body.bookingNote === undefined ? {} : { bookingNote: normalizeText(body.bookingNote) ?? null }),
        };
    }

    private assertDraftCapacity(format: string | null, guests: readonly { team: string }[]): void {
        const capacity = format === MatchFormatDto.SINGLES ? 1 : 2;
        const teamA = 1 + guests.filter((guest) => guest.team === 'TEAM_A').length;
        const teamB = guests.filter((guest) => guest.team === 'TEAM_B').length;
        if (teamA > capacity || teamB > capacity) throw matchError('VALIDATION_FAILED', 400);
    }

    private async assertPublishable(
        match: Awaited<ReturnType<MatchService['lock']>>,
        now: Date,
        tx: Prisma.TransactionClient
    ): Promise<void> {
        if (
            match.format === null ||
            match.visibility === null ||
            match.joinMode === null ||
            match.startsAt === null ||
            match.timeZone === null ||
            (match.venueId === null) === (match.venueCandidateId === null) ||
            match.skillMin === null ||
            match.skillMax === null ||
            match.description === null
        )
            throw matchError('VALIDATION_FAILED', 400);
        const lead = match.startsAt.getTime() - now.getTime();
        if (lead < this.policy.current.publishMinimumLeadMs || lead > this.policy.current.publishHorizonMs)
            throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        if (match.venueId !== null) {
            const venue = await tx.venue.count({ where: { id: match.venueId, publicationState: 'PUBLISHED' } });
            if (venue !== 1) throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        } else {
            const candidate = await tx.venueCandidate.count({
                where: { id: match.venueCandidateId ?? '', sourceMatchId: match.id, contributorId: match.organizerId },
            });
            if (candidate !== 1) throw matchError('MATCH_TRANSITION_NOT_ALLOWED', 409);
        }
    }

    private assertJoinable(match: Awaited<ReturnType<MatchService['lock']>>): void {
        if (match.state !== MatchState.PUBLISHED || match.startsAt === null || this.policy.now() >= match.startsAt)
            throw matchError('MATCH_NOT_JOINABLE', 409);
    }

    private async assertOnboarded(userId: string, tx: Prisma.TransactionClient): Promise<void> {
        const user = await tx.user.findUnique({ where: { id: userId }, include: { draft: true } });
        if (user?.completedAt === null || user?.draft?.completedAt === null || user === null)
            throw matchError('ONBOARDING_REQUIRED', 403);
    }

    private organizer(match: { organizerId: string }, userId: string): void {
        if (match.organizerId !== userId) throw matchError('REQUEST_NOT_ALLOWED', 403);
    }
    private version(match: { version: number }, expected: number): void {
        if (match.version !== expected) throw matchError('MATCH_VERSION_CONFLICT', 409);
    }

    private async lock(id: string, tx: Prisma.TransactionClient) {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM matches WHERE id = ${id}::uuid FOR UPDATE`;
        if (locked.length === 0) throw matchError('MATCH_NOT_FOUND', 404);
        return tx.match.findUniqueOrThrow({ where: { id } });
    }

    private async assertNotInvolved(matchId: string, userId: string, tx: Prisma.TransactionClient): Promise<void> {
        const [participant, request, waitlist] = await Promise.all([
            tx.matchParticipant.count({ where: { matchId, userId, state: 'ACTIVE' } }),
            tx.joinRequest.count({ where: { matchId, requesterId: userId, state: 'PENDING' } }),
            tx.waitlistEntry.count({ where: { matchId, playerId: userId, state: { in: ['WAITING', 'OFFERED'] } } }),
        ]);
        if (participant + request + waitlist > 0) throw matchError('ALREADY_INVOLVED', 409);
    }

    private async occupancy(
        matchId: string,
        tx: Prisma.TransactionClient
    ): Promise<Record<'TEAM_A' | 'TEAM_B', number>> {
        const rows = await tx.$queryRaw<{ team: 'TEAM_A' | 'TEAM_B'; count: number }[]>(Prisma.sql`
            SELECT team::text AS team, count(*)::int AS count FROM (
                SELECT team FROM match_participants WHERE match_id = ${matchId}::uuid AND state = 'ACTIVE'
                UNION ALL SELECT team FROM match_guest_slots WHERE match_id = ${matchId}::uuid
                UNION ALL SELECT offered_team FROM waitlist_entries WHERE match_id = ${matchId}::uuid AND state = 'OFFERED'
            ) places GROUP BY team`);
        return {
            TEAM_A: rows.find((row) => row.team === 'TEAM_A')?.count ?? 0,
            TEAM_B: rows.find((row) => row.team === 'TEAM_B')?.count ?? 0,
        };
    }

    private async availableTeam(
        matchId: string,
        choice: MatchTeamChoice,
        tx: Prisma.TransactionClient
    ): Promise<MatchTeamCode | null> {
        const team = await tx.matchTeam.findFirst({ where: { matchId } });
        if (team === null) throw matchError('MATCH_NOT_FOUND', 404);
        return chooseTeam(choice, await this.occupancy(matchId, tx), team.capacity) as MatchTeamCode | null;
    }

    private async enqueue(
        matchId: string,
        playerId: string,
        choice: MatchTeamChoice,
        tx: Prisma.TransactionClient
    ): Promise<string> {
        const match = await tx.match.update({
            where: { id: matchId },
            data: { waitlistSequence: { increment: 1 }, version: { increment: 1 }, updatedAt: this.policy.now() },
        });
        const id = uuidV7();
        await tx.waitlistEntry.create({
            data: {
                id,
                matchId,
                playerId,
                teamChoice: choice,
                sequence: match.waitlistSequence,
                createdAt: this.policy.now(),
            },
        });
        return id;
    }

    private async promoteNext(matchId: string, tx: Prisma.TransactionClient): Promise<void> {
        const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
        if (match.state !== MatchState.PUBLISHED || match.startsAt === null || this.policy.now() >= match.startsAt)
            return;
        let afterSequence = 0n;
        for (;;) {
            const entry = await tx.waitlistEntry.findFirst({
                where: { matchId, state: MatchWaitlistState.WAITING, sequence: { gt: afterSequence } },
                orderBy: { sequence: 'asc' },
            });
            if (entry === null) return;
            afterSequence = entry.sequence;
            const profile = await tx.playerProfileDraft.findUnique({ where: { userId: entry.playerId } });
            const eligible =
                profile?.completedAt !== null &&
                profile?.skillSelfAssessment !== null &&
                Number(profile?.skillSelfAssessment) >= Number(match.skillMin) &&
                Number(profile?.skillSelfAssessment) <= Number(match.skillMax);
            const team = eligible ? await this.availableTeam(matchId, entry.teamChoice, tx) : null;
            if (!eligible) {
                await tx.waitlistEntry.update({
                    where: { id: entry.id },
                    data: { state: 'SKIPPED', resolvedAt: this.policy.now() },
                });
                continue;
            }
            if (team === null) continue;
            if (match.joinMode === MatchJoinMode.AUTO) {
                await tx.waitlistEntry.update({
                    where: { id: entry.id },
                    data: { state: 'PROMOTED', resolvedAt: this.policy.now() },
                });
                await tx.matchParticipant.create({
                    data: { id: uuidV7(), matchId, userId: entry.playerId, team, joinedAt: this.policy.now() },
                });
            } else {
                const now = this.policy.now();
                await tx.waitlistEntry.update({
                    where: { id: entry.id },
                    data: {
                        state: 'OFFERED',
                        offeredTeam: team,
                        offeredAt: now,
                        offerExpiresAt: this.policy.offerDeadline(match.startsAt),
                    },
                });
            }
            return;
        }
    }

    private async isRosterComplete(matchId: string, tx: Prisma.TransactionClient): Promise<boolean> {
        const match = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { teams: true } });
        const occupied = await this.occupancy(matchId, tx);
        return match.teams.every((team) => occupied[team.code] === team.capacity);
    }

    private async rosterEvent(
        tx: Prisma.TransactionClient,
        matchId: string,
        aggregateVersion: number,
        now: Date
    ): Promise<void> {
        const complete = await this.isRosterComplete(matchId, tx);
        const match = complete
            ? await tx.match.update({
                  where: { id: matchId },
                  data: { rosterCompletionSequence: { increment: 1 }, version: { increment: 1 }, updatedAt: now },
              })
            : await tx.match.findUniqueOrThrow({ where: { id: matchId } });
        await this.event(tx, 'match.roster.changed.v1', now, {
            matchId,
            aggregateVersion: Math.max(aggregateVersion, match.version),
            rosterComplete: complete,
            completionSequence: match.rosterCompletionSequence,
        });
    }

    private async getAggregate(id: string, tx: Prisma.TransactionClient): Promise<object> {
        return this.project(await tx.match.findUniqueOrThrow({ where: { id }, include: includeMatch }));
    }

    private project(match: MatchAggregate): object {
        const counts = (team: MatchTeamCode) => ({
            occupiedPlaces:
                match.participants.filter((p) => p.team === team && p.state === 'ACTIVE').length +
                match.guests.filter((g) => g.team === team).length,
            reservedPlaces: match.waitlistEntries.filter((entry) => entry.offeredTeam === team).length,
        });
        return {
            id: match.id,
            organizerId: match.organizerId,
            version: match.version,
            state: match.state,
            format: match.format,
            visibility: match.visibility,
            joinMode: match.joinMode,
            startsAt: match.startsAt?.toISOString() ?? null,
            timeZone: match.timeZone,
            venue: { venueId: match.venueId, venueCandidateId: match.venueCandidateId },
            skillMin: match.skillMin === null ? null : Number(match.skillMin),
            skillMax: match.skillMax === null ? null : Number(match.skillMax),
            description: match.description,
            bookingState: match.bookingState,
            bookingNote: match.bookingNote,
            policyVersion: match.policyVersion,
            teams: match.teams.map((team) => ({ code: team.code, capacity: team.capacity, ...counts(team.code) })),
            participants: match.participants.map((participant) => ({
                id: participant.id,
                team: participant.team,
                state: participant.state,
                isOrganizer: participant.isOrganizer,
                userId: participant.userId,
                joinedAt: participant.joinedAt.toISOString(),
            })),
            guests: match.guests.map((guest) => ({ id: guest.id, team: guest.team, label: guest.label })),
            currentResult: match.results[0] === undefined ? null : this.projectResult(match.results[0]),
            createdAt: match.createdAt.toISOString(),
            publishedAt: match.publishedAt?.toISOString() ?? null,
            updatedAt: match.updatedAt.toISOString(),
        };
    }

    private projectRequest(request: {
        id: string;
        matchId: string;
        requesterId: string;
        teamChoice: MatchTeamChoice;
        state: string;
        createdAt: Date;
        decidedAt: Date | null;
    }): object {
        return {
            id: request.id,
            matchId: request.matchId,
            requesterId: request.requesterId,
            teamChoice: request.teamChoice,
            state: request.state,
            createdAt: request.createdAt.toISOString(),
            decidedAt: request.decidedAt?.toISOString() ?? null,
        };
    }

    private projectWaitlist(entry: {
        id: string;
        matchId: string;
        playerId: string;
        teamChoice: MatchTeamChoice;
        state: string;
        sequence: bigint;
        offeredTeam: MatchTeamCode | null;
        offerExpiresAt: Date | null;
        createdAt: Date;
        resolvedAt: Date | null;
    }): object {
        return {
            id: entry.id,
            matchId: entry.matchId,
            playerId: entry.playerId,
            teamChoice: entry.teamChoice,
            state: entry.state,
            position: entry.sequence.toString(),
            offeredTeam: entry.offeredTeam,
            offerExpiresAt: entry.offerExpiresAt?.toISOString() ?? null,
            createdAt: entry.createdAt.toISOString(),
            resolvedAt: entry.resolvedAt?.toISOString() ?? null,
        };
    }

    private projectResult(result: {
        id: string;
        matchId: string;
        version: number;
        state: string;
        mode: string;
        seriesFormat: string | null;
        winningTeam: string | null;
        proposedAt: Date;
        resolvedAt: Date | null;
        games: { gameNumber: number; teamAPoints: number; teamBPoints: number }[];
        confirmations: { id: string; playerId: string; decision: string; createdAt: Date }[];
    }): object {
        return {
            id: result.id,
            matchId: result.matchId,
            version: result.version,
            state: result.state,
            mode: result.mode,
            seriesFormat: result.seriesFormat,
            winningTeam: result.winningTeam,
            games: result.games,
            confirmations: result.confirmations.map((item) => ({
                id: item.id,
                resultId: result.id,
                resultVersion: result.version,
                playerId: item.playerId,
                decision: item.decision,
                createdAt: item.createdAt.toISOString(),
            })),
            proposedAt: result.proposedAt.toISOString(),
            resolvedAt: result.resolvedAt?.toISOString() ?? null,
        };
    }

    private async joinOutcome(
        matchId: string,
        participantId: string | undefined,
        requestId: string | undefined,
        waitlistId: string | undefined,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const [match, participant, request, waitlist] = await Promise.all([
            this.getAggregate(matchId, tx),
            participantId === undefined ? null : tx.matchParticipant.findUnique({ where: { id: participantId } }),
            requestId === undefined ? null : tx.joinRequest.findUnique({ where: { id: requestId } }),
            waitlistId === undefined ? null : tx.waitlistEntry.findUnique({ where: { id: waitlistId } }),
        ]);
        return {
            match,
            participant:
                participant === null
                    ? null
                    : {
                          id: participant.id,
                          team: participant.team,
                          state: participant.state,
                          isOrganizer: participant.isOrganizer,
                          userId: participant.userId,
                          joinedAt: participant.joinedAt.toISOString(),
                      },
            joinRequest: request === null ? null : this.projectRequest(request),
            waitlistEntry: waitlist === null ? null : this.projectWaitlist(waitlist),
        };
    }

    private simplePage<T>(rows: T[], limit: number, cursor: (last: T) => string | null): object {
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        const hasNext = rows.length > limit;
        return { items, pageInfo: { hasNext, nextCursor: hasNext && last !== undefined ? cursor(last) : null } };
    }

    private async event(
        tx: Prisma.TransactionClient,
        type: string,
        occurredAt: Date,
        data: Prisma.InputJsonObject
    ): Promise<void> {
        const context = this.context.get();
        const correlationId = context?.correlationId ?? uuidV7();
        await this.outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: occurredAt.toISOString(),
                correlationId,
                causationId: null,
                data,
            },
            correlationId,
            occurredAt,
        });
    }

    private async auditEntry(
        tx: Prisma.TransactionClient,
        actorId: string,
        action: string,
        targetId: string,
        changedFields: string[]
    ): Promise<void> {
        const context = this.context.get();
        const requestId = context?.requestId ?? uuidV7();
        const correlationId = context?.correlationId ?? requestId;
        await this.audit.append(tx, {
            actorType: 'USER',
            actorId,
            action,
            targetType: 'MATCH',
            targetId,
            outcome: 'SUCCEEDED',
            changedFields: { fields: changedFields },
            requestId,
            correlationId,
            source: 'API',
        });
    }
}
