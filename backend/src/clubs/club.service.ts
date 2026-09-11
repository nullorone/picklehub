import { Injectable } from '@nestjs/common';
import {
    ClubInvitationState,
    ClubMembershipPolicy,
    ClubMembershipState,
    ClubRole,
    ClubState,
    Prisma,
    RecurringMatchRuleState,
    VenuePublicationState,
} from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { CursorService } from '../identity/cursor.service';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { MatchService } from '../matches/match.service';
import { OutboxService } from '../outbox/outbox.service';
import type {
    ChangeClubRoleDto,
    ClubReasonDto,
    ClubResourceReasonDto,
    ClubSearchDto,
    CreateClubDto,
    CreateClubMatchDto,
    CreateRecurringRuleDto,
    ExpectedClubResourceDto,
    ExpectedClubVersionDto,
    RecurringMatchTemplateDto,
    TransferClubOwnershipDto,
    UpdateClubDto,
    UpdateRecurringRuleDto,
} from './club.dto';
import { BookingStateDto } from '../matches/match.dto';
import { clubError } from './club.errors';
import { ClubPolicyService } from './club.policy';
import { assertTimeZone } from './club-timezone';

const ROLES = [ClubRole.OWNER, ClubRole.ADMIN, ClubRole.MEMBER] as const;
const MANAGERS = [ClubRole.OWNER, ClubRole.ADMIN] as const;
const memberSelect = {
    id: true,
    clubId: true,
    userId: true,
    role: true,
    state: true,
    revision: true,
    joinedAt: true,
    endedAt: true,
} satisfies Prisma.ClubMembershipSelect;

@Injectable()
export class ClubService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly policy: ClubPolicyService,
        private readonly crypto: IdentityCryptoService,
        private readonly cursors: CursorService,
        private readonly outbox: OutboxService,
        private readonly context: RequestContextService,
        private readonly matches: MatchService
    ) {}

    async search(query: ClubSearchDto): Promise<object> {
        const bind = this.crypto.hash(JSON.stringify([query.query, query.locality, query.venueId, query.limit]));
        const cursor = query.cursor === undefined ? undefined : this.decodeCursor(query.cursor, bind);
        const snapshotAt = cursor?.snapshotAt ?? new Date().toISOString();
        const normalizedQuery = query.query?.trim().toLocaleLowerCase('ru-RU');
        const normalizedLocality = query.locality?.trim().toLocaleLowerCase('ru-RU');
        const rows = await this.prisma.club.findMany({
            where: {
                state: ClubState.ACTIVE,
                createdAt: { lte: new Date(snapshotAt) },
                ...(normalizedQuery === undefined ? {} : { normalizedName: { contains: normalizedQuery } }),
                ...(normalizedLocality === undefined ? {} : { normalizedLocality }),
                ...(query.venueId === undefined ? {} : { venues: { some: { venueId: query.venueId } } }),
                ...(cursor === undefined
                    ? {}
                    : {
                          OR: [
                              { normalizedName: { gt: cursor.lastName } },
                              { normalizedName: cursor.lastName, id: { gt: cursor.lastId } },
                          ],
                      }),
            },
            include: { venues: true, memberships: { where: { state: ClubMembershipState.ACTIVE } } },
            orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
            take: query.limit + 1,
        });
        const hasNext = rows.length > query.limit;
        const page = rows.slice(0, query.limit);
        const items = page.map((club) => this.summary(club));
        const last = page.at(-1);
        return {
            items,
            pageInfo: {
                hasNext,
                nextCursor:
                    hasNext && last !== undefined
                        ? this.cursors.encode({
                              type: 'club-search',
                              bind,
                              snapshotAt,
                              lastName: last.normalizedName,
                              lastId: last.id,
                          })
                        : null,
            },
            snapshotAt,
        };
    }

    async detail(clubId: string, tx: Prisma.TransactionClient = this.prisma): Promise<object> {
        const club = await tx.club.findUnique({
            where: { id: clubId },
            include: { venues: true, memberships: { where: { state: ClubMembershipState.ACTIVE } } },
        });
        if (club === null) throw clubError('CLUB_NOT_FOUND', 404);
        return this.projectClub(club);
    }

    async create(actorId: string, body: CreateClubDto, tx: Prisma.TransactionClient): Promise<object> {
        await this.assertOnboarded(actorId, tx);
        const now = new Date();
        const id = uuidV7();
        const club = await tx.club.create({
            data: {
                id,
                name: this.text(body.name),
                normalizedName: this.normalized(body.name),
                description: this.text(body.description),
                locality: this.text(body.locality),
                normalizedLocality: this.normalized(body.locality),
                membershipPolicy: body.membershipPolicy,
                createdAt: now,
                updatedAt: now,
                memberships: { create: { id: uuidV7(), userId: actorId, role: ClubRole.OWNER, joinedAt: now } },
            },
        });
        await this.event(tx, 'club.created.v1', now, {
            clubId: id,
            clubVersion: club.version,
            state: club.state,
            membershipPolicy: club.membershipPolicy,
        });
        return this.detail(id, tx);
    }

    async update(actorId: string, clubId: string, body: UpdateClubDto, tx: Prisma.TransactionClient): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, body.expectedVersion);
        await tx.club.update({
            where: { id: clubId },
            data: {
                ...(body.name === undefined
                    ? {}
                    : { name: this.text(body.name), normalizedName: this.normalized(body.name) }),
                ...(body.description === undefined ? {} : { description: this.text(body.description) }),
                ...(body.locality === undefined
                    ? {}
                    : { locality: this.text(body.locality), normalizedLocality: this.normalized(body.locality) }),
                ...(body.membershipPolicy === undefined ? {} : { membershipPolicy: body.membershipPolicy }),
                version: { increment: 1 },
                updatedAt: new Date(),
            },
        });
        return this.detail(clubId, tx);
    }

    async state(
        actorId: string,
        clubId: string,
        target: ClubState,
        body: ClubReasonDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.owner(tx, clubId, actorId);
        this.version(club.version, body.expectedVersion);
        if (club.state === target) throw clubError('CLUB_TRANSITION_NOT_ALLOWED', 409);
        const now = new Date();
        const updated = await tx.club.update({
            where: { id: clubId },
            data: {
                state: target,
                archivedAt: target === ClubState.ARCHIVED ? now : null,
                version: { increment: 1 },
                updatedAt: now,
            },
        });
        await this.audit(
            tx,
            clubId,
            actorId,
            clubId,
            target === ClubState.ARCHIVED ? 'CLUB_ARCHIVE' : 'CLUB_RESTORE',
            body.reasonCode
        );
        await this.event(tx, 'club.state.changed.v1', now, {
            clubId,
            clubVersion: updated.version,
            state: updated.state,
        });
        return this.detail(clubId, tx);
    }

    async join(
        actorId: string,
        clubId: string,
        body: ExpectedClubVersionDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        this.policy.active(club.state);
        this.version(club.version, body.expectedVersion);
        await this.assertNoAccess(actorId, clubId, tx);
        if (club.membershipPolicy === ClubMembershipPolicy.INVITE_ONLY) throw clubError('CLUB_ACTION_FORBIDDEN', 403);
        if (club.membershipPolicy === ClubMembershipPolicy.OPEN) {
            const membership = await this.createMembership(clubId, actorId, tx);
            const clubVersion = await this.bumpClub(clubId, tx);
            await this.membershipEvent(tx, { ...club, version: clubVersion }, membership);
            return { membership: this.projectMembership(membership), joinRequest: null };
        }
        const request = await tx.clubJoinRequest.create({ data: { id: uuidV7(), clubId, requesterId: actorId } });
        return { membership: null, joinRequest: this.projectRequest(request) };
    }

    async listMembers(actorId: string, clubId: string, limit: number): Promise<object> {
        await this.policy.membership(this.prisma, clubId, actorId, ROLES);
        const rows = await this.prisma.clubMembership.findMany({
            where: { clubId, state: ClubMembershipState.ACTIVE },
            select: memberSelect,
            orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
        });
        return this.page(
            rows.map((row) => this.projectMembership(row)),
            limit
        );
    }

    async leave(
        actorId: string,
        clubId: string,
        membershipId: string,
        body: ExpectedClubResourceDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const membership = await this.membership(clubId, membershipId, tx);
        if (membership.userId !== actorId) throw clubError('CLUB_ACTION_FORBIDDEN', 403);
        if (membership.role === ClubRole.OWNER) throw clubError('CLUB_OWNER_REQUIRED', 409);
        return this.endMembership(club, membership, ClubMembershipState.LEFT, body.expectedRevision, tx);
    }

    async exclude(
        actorId: string,
        clubId: string,
        membershipId: string,
        body: ClubResourceReasonDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        const actor = await this.policy.membership(tx, clubId, actorId, MANAGERS);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const target = await this.membership(clubId, membershipId, tx);
        this.canManage(actor.role, target.role, actorId === target.userId);
        const result = await this.endMembership(club, target, ClubMembershipState.EXCLUDED, body.expectedRevision, tx);
        await this.audit(tx, clubId, actorId, membershipId, 'MEMBER_EXCLUSION', body.reasonCode);
        return result;
    }

    async changeRole(
        actorId: string,
        clubId: string,
        membershipId: string,
        body: ChangeClubRoleDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.owner(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const membership = await this.membership(clubId, membershipId, tx);
        this.revision(membership.revision, body.expectedRevision);
        if (membership.role === ClubRole.OWNER) throw clubError('CLUB_OWNER_REQUIRED', 409);
        const updated = await tx.clubMembership.update({
            where: { id: membershipId },
            data: { role: body.role, revision: { increment: 1 } },
        });
        await this.bumpClub(clubId, tx);
        await this.audit(tx, clubId, actorId, membershipId, 'ROLE_CHANGE', body.reasonCode);
        await this.membershipEvent(tx, { ...club, version: club.version + 1 }, updated);
        return this.projectMembership(updated);
    }

    async transfer(
        actorId: string,
        clubId: string,
        body: TransferClubOwnershipDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        const owner = await this.policy.membership(tx, clubId, actorId, [ClubRole.OWNER]);
        this.policy.active(club.state);
        this.version(club.version, body.expectedVersion);
        const target = await this.membership(clubId, body.targetMembershipId, tx);
        if (target.id === owner.id || target.role === ClubRole.OWNER)
            throw clubError('CLUB_TRANSITION_NOT_ALLOWED', 409);
        await tx.clubMembership.update({
            where: { id: target.id },
            data: { role: ClubRole.OWNER, revision: { increment: 1 } },
        });
        await tx.clubMembership.update({
            where: { id: owner.id },
            data: { role: ClubRole.ADMIN, revision: { increment: 1 } },
        });
        const clubVersion = await this.bumpClub(clubId, tx);
        await this.audit(tx, clubId, actorId, target.id, 'OWNERSHIP_TRANSFER', body.reasonCode);
        const [newOwner, formerOwner] = await Promise.all([
            tx.clubMembership.findUniqueOrThrow({ where: { id: target.id } }),
            tx.clubMembership.findUniqueOrThrow({ where: { id: owner.id } }),
        ]);
        await this.membershipEvent(tx, { ...club, version: clubVersion }, newOwner);
        await this.membershipEvent(tx, { ...club, version: clubVersion }, formerOwner);
        return this.detail(clubId, tx);
    }

    async listRequests(actorId: string, clubId: string, limit: number): Promise<object> {
        await this.policy.manager(this.prisma, clubId, actorId);
        const rows = await this.prisma.clubJoinRequest.findMany({
            where: { clubId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
        });
        return this.page(
            rows.map((row) => this.projectRequest(row)),
            limit
        );
    }

    async decideRequest(
        actorId: string,
        clubId: string,
        requestId: string,
        state: 'APPROVED' | 'REJECTED' | 'CANCELLED',
        body: ExpectedClubResourceDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const request = await tx.clubJoinRequest.findFirst({ where: { id: requestId, clubId } });
        if (request === null) throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
        if (state === 'CANCELLED') {
            if (request.requesterId !== actorId) throw clubError('CLUB_ACTION_FORBIDDEN', 403);
        } else await this.policy.manager(tx, clubId, actorId);
        this.pending(request.state, request.revision, body.expectedRevision);
        if (state === 'APPROVED') await this.assertNoAccess(request.requesterId, clubId, tx, undefined, request.id);
        const updated = await tx.clubJoinRequest.update({
            where: { id: requestId },
            data: { state, revision: { increment: 1 }, resolvedAt: new Date() },
        });
        if (state !== 'APPROVED') return this.projectRequest(updated);
        const membership = await this.createMembership(clubId, request.requesterId, tx);
        const clubVersion = await this.bumpClub(clubId, tx);
        await this.membershipEvent(tx, { ...club, version: clubVersion }, membership);
        return this.projectMembership(membership);
    }

    async createInvitation(
        actorId: string,
        clubId: string,
        inviteeId: string,
        expectedVersion: number,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, expectedVersion);
        await this.assertNoAccess(inviteeId, clubId, tx, undefined, undefined, true);
        const token = this.crypto.secret();
        const invitation = await tx.clubInvitation.create({
            data: {
                id: uuidV7(),
                clubId,
                inviteeId,
                issuedByUserId: actorId,
                tokenHash: this.crypto.hash(`CLUB_INVITATION:${token}`),
                keyVersion: 1,
            },
        });
        return { invitation: this.projectInvitation(invitation), token };
    }

    async listInvitations(actorId: string, clubId: string, limit: number): Promise<object> {
        await this.policy.manager(this.prisma, clubId, actorId);
        await this.expireInvitations(this.prisma, { clubId });
        const rows = await this.prisma.clubInvitation.findMany({
            where: { clubId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
        });
        return this.page(
            rows.map((row) => this.projectInvitation(row)),
            limit
        );
    }

    async invitation(actorId: string, token: string): Promise<object> {
        return this.invitationRecord(actorId, token, this.prisma).then((item) => this.projectInvitation(item));
    }

    async decideInvitation(
        actorId: string,
        token: string,
        state: 'ACCEPTED' | 'DECLINED',
        body: ExpectedClubResourceDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const invitation = await this.invitationRecord(actorId, token, tx, true);
        const club = await this.lock(invitation.clubId, tx);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        this.pending(invitation.state, invitation.revision, body.expectedRevision);
        if (state === 'ACCEPTED')
            await this.assertNoAccess(actorId, invitation.clubId, tx, invitation.id, undefined, true);
        const updated = await tx.clubInvitation.update({
            where: { id: invitation.id },
            data: { state, revision: { increment: 1 }, resolvedAt: new Date() },
        });
        if (state === 'DECLINED') return this.projectInvitation(updated);
        await tx.clubJoinRequest.updateMany({
            where: { clubId: invitation.clubId, requesterId: actorId, state: 'PENDING' },
            data: { state: 'SUPERSEDED', revision: { increment: 1 }, resolvedAt: new Date() },
        });
        const membership = await this.createMembership(invitation.clubId, actorId, tx);
        const clubVersion = await this.bumpClub(invitation.clubId, tx);
        await this.membershipEvent(tx, { ...club, version: clubVersion }, membership);
        return this.projectMembership(membership);
    }

    async revokeInvitation(
        actorId: string,
        clubId: string,
        invitationId: string,
        body: ExpectedClubResourceDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const invitation = await tx.clubInvitation.findFirst({ where: { id: invitationId, clubId } });
        if (invitation === null) throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
        this.pending(invitation.state, invitation.revision, body.expectedRevision);
        return this.projectInvitation(
            await tx.clubInvitation.update({
                where: { id: invitationId },
                data: { state: ClubInvitationState.REVOKED, revision: { increment: 1 }, resolvedAt: new Date() },
            })
        );
    }

    async block(
        actorId: string,
        clubId: string,
        membershipId: string,
        body: ClubResourceReasonDto,
        tx: Prisma.TransactionClient
    ): Promise<void> {
        const club = await this.lock(clubId, tx);
        const actor = await this.policy.membership(tx, clubId, actorId, MANAGERS);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const target = await this.membership(clubId, membershipId, tx);
        this.canManage(actor.role, target.role, actorId === target.userId);
        this.revision(target.revision, body.expectedRevision);
        await this.endMembership(club, target, ClubMembershipState.EXCLUDED, body.expectedRevision, tx);
        await this.endIntents(clubId, target.userId, tx);
        await tx.clubBlock.create({
            data: {
                id: uuidV7(),
                clubId,
                userId: target.userId,
                reasonCode: body.reasonCode,
                createdByUserId: actorId,
            },
        });
        await this.audit(tx, clubId, actorId, membershipId, 'MEMBER_BLOCK', body.reasonCode);
    }

    async liftBlock(
        actorId: string,
        clubId: string,
        blockId: string,
        body: ClubResourceReasonDto,
        tx: Prisma.TransactionClient
    ): Promise<void> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const block = await tx.clubBlock.findFirst({ where: { id: blockId, clubId, state: 'ACTIVE' } });
        if (block === null) throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
        this.revision(block.revision, body.expectedRevision);
        await tx.clubBlock.update({
            where: { id: blockId },
            data: { state: 'LIFTED', revision: { increment: 1 }, liftedAt: new Date(), liftedByUserId: actorId },
        });
        await this.bumpClub(clubId, tx);
        await this.audit(tx, clubId, actorId, blockId, 'BLOCK_LIFT', body.reasonCode);
    }

    async venues(clubId: string): Promise<object> {
        const club = await this.prisma.club.findUnique({ where: { id: clubId } });
        if (club === null) throw clubError('CLUB_NOT_FOUND', 404);
        return { items: await this.prisma.clubVenue.findMany({ where: { clubId }, orderBy: { linkedAt: 'asc' } }) };
    }

    async linkVenue(
        actorId: string,
        clubId: string,
        venueId: string,
        expectedVersion: number,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, expectedVersion);
        const venue = await tx.venue.findUnique({ where: { id: venueId } });
        if (
            venue === null ||
            venue.publicationState !== VenuePublicationState.PUBLISHED ||
            venue.canonicalVenueId !== null
        )
            throw clubError('CLUB_VENUE_UNAVAILABLE', 409);
        const link = await tx.clubVenue.create({ data: { clubId, venueId, linkedById: actorId } });
        const version = await this.bumpClub(clubId, tx);
        await this.event(tx, 'club.venue.link.changed.v1', new Date(), {
            clubId,
            clubVersion: version,
            venueId,
            change: 'LINKED',
        });
        return { clubId: link.clubId, venueId: link.venueId, linkedAt: link.linkedAt.toISOString() };
    }

    async unlinkVenue(
        actorId: string,
        clubId: string,
        venueId: string,
        expectedVersion: number,
        tx: Prisma.TransactionClient
    ): Promise<void> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, expectedVersion);
        const deleted = await tx.clubVenue.deleteMany({ where: { clubId, venueId } });
        if (deleted.count === 0) throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
        const version = await this.bumpClub(clubId, tx);
        await this.event(tx, 'club.venue.link.changed.v1', new Date(), {
            clubId,
            clubVersion: version,
            venueId,
            change: 'UNLINKED',
        });
    }

    async createMatch(
        actorId: string,
        clubId: string,
        body: CreateClubMatchDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, body.expectedVersion);
        return this.matches.create(actorId, body.match, tx, { clubId, origin: 'CLUB' });
    }

    async createRule(
        actorId: string,
        clubId: string,
        body: CreateRecurringRuleDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, body.expectedVersion);
        this.validateRule(body);
        await this.assertTemplateVenue(clubId, body.template.venueId, tx);
        const now = new Date();
        const rule = await tx.recurringMatchRule.create({
            data: {
                id: uuidV7(),
                clubId,
                organizerId: actorId,
                intervalWeeks: body.intervalWeeks,
                weekdays: body.weekdays,
                localStartTime: new Date(`1970-01-01T${body.localStartTime}:00.000Z`),
                timeZone: body.timeZone,
                tzdataVersion: process.versions.tz ?? 'system',
                dstOverlapPolicy: body.dstOverlapPolicy,
                startsOn: new Date(`${body.startsOn.slice(0, 10)}T00:00:00.000Z`),
                endsOn: body.endsOn == null ? null : new Date(`${body.endsOn.slice(0, 10)}T00:00:00.000Z`),
                matchTemplate: body.template as unknown as Prisma.InputJsonObject,
                createdAt: now,
                updatedAt: now,
            },
        });
        const version = await this.bumpClub(clubId, tx);
        await this.ruleEvent(tx, clubId, version, rule);
        return this.projectRule(rule);
    }

    async listRules(actorId: string, clubId: string, limit: number): Promise<object> {
        await this.policy.manager(this.prisma, clubId, actorId);
        const rows = await this.prisma.recurringMatchRule.findMany({
            where: { clubId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
        });
        return this.page(
            rows.map((row) => this.projectRule(row)),
            limit
        );
    }

    async rule(actorId: string, clubId: string, ruleId: string): Promise<object> {
        await this.policy.manager(this.prisma, clubId, actorId);
        const rule = await this.prisma.recurringMatchRule.findFirst({ where: { id: ruleId, clubId } });
        if (rule === null) throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
        return this.projectRule(rule);
    }

    async updateRule(
        actorId: string,
        clubId: string,
        ruleId: string,
        body: UpdateRecurringRuleDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const rule = await this.lockRule(clubId, ruleId, tx);
        this.revision(rule.revision, body.expectedRevision);
        if (rule.state === RecurringMatchRuleState.ENDED) throw clubError('CLUB_TRANSITION_NOT_ALLOWED', 409);
        this.validateRule({
            weekdays: body.weekdays ?? rule.weekdays,
            startsOn: rule.startsOn.toISOString(),
            endsOn: body.endsOn === undefined ? (rule.endsOn?.toISOString() ?? null) : body.endsOn,
            timeZone: rule.timeZone,
            template: body.template ?? (rule.matchTemplate as unknown as RecurringMatchTemplateDto),
        });
        const template = body.template ?? (rule.matchTemplate as unknown as RecurringMatchTemplateDto);
        await this.assertTemplateVenue(clubId, template.venueId, tx);
        const updated = await tx.recurringMatchRule.update({
            where: { id: ruleId },
            data: {
                ...(body.intervalWeeks === undefined ? {} : { intervalWeeks: body.intervalWeeks }),
                ...(body.weekdays === undefined ? {} : { weekdays: body.weekdays }),
                ...(body.localStartTime === undefined
                    ? {}
                    : { localStartTime: new Date(`1970-01-01T${body.localStartTime}:00.000Z`) }),
                ...(body.endsOn === undefined
                    ? {}
                    : { endsOn: body.endsOn === null ? null : new Date(`${body.endsOn.slice(0, 10)}T00:00:00.000Z`) }),
                ...(body.dstOverlapPolicy === undefined ? {} : { dstOverlapPolicy: body.dstOverlapPolicy }),
                ...(body.template === undefined
                    ? {}
                    : { matchTemplate: body.template as unknown as Prisma.InputJsonObject }),
                revision: { increment: 1 },
                templateVersion: { increment: 1 },
                updatedAt: new Date(),
            },
        });
        const version = await this.bumpClub(clubId, tx);
        await this.ruleEvent(tx, clubId, version, updated);
        return this.projectRule(updated);
    }

    async ruleState(
        actorId: string,
        clubId: string,
        ruleId: string,
        target: 'ACTIVE' | 'PAUSED' | 'ENDED',
        body: ClubResourceReasonDto,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const club = await this.lock(clubId, tx);
        await this.policy.manager(tx, clubId, actorId);
        this.policy.active(club.state);
        this.version(club.version, body.expectedClubVersion);
        const rule = await this.lockRule(clubId, ruleId, tx);
        this.revision(rule.revision, body.expectedRevision);
        if (rule.state === RecurringMatchRuleState.ENDED || rule.state === target)
            throw clubError('CLUB_TRANSITION_NOT_ALLOWED', 409);
        if (target === 'ACTIVE' && rule.state !== RecurringMatchRuleState.PAUSED)
            throw clubError('CLUB_TRANSITION_NOT_ALLOWED', 409);
        const updated = await tx.recurringMatchRule.update({
            where: { id: ruleId },
            data: {
                state: target,
                revision: { increment: 1 },
                pauseReasonCode: target === 'PAUSED' ? body.reasonCode : null,
                endedAt: target === 'ENDED' ? new Date() : null,
                updatedAt: new Date(),
            },
        });
        const version = await this.bumpClub(clubId, tx);
        await this.ruleEvent(tx, clubId, version, updated);
        return this.projectRule(updated);
    }

    async occurrences(actorId: string, clubId: string, ruleId: string, limit: number): Promise<object> {
        await this.policy.manager(this.prisma, clubId, actorId);
        const rule = await this.prisma.recurringMatchRule.findFirst({ where: { id: ruleId, clubId } });
        if (rule === null) throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
        const rows = await this.prisma.recurringMatchOccurrence.findMany({
            where: { clubId, ruleId },
            orderBy: [{ calendarKey: 'asc' }, { id: 'asc' }],
            take: limit + 1,
        });
        return this.page(
            rows.map((row) => this.projectOccurrence(row)),
            limit
        );
    }

    private async lock(clubId: string, tx: Prisma.TransactionClient) {
        await tx.$queryRaw`SELECT id FROM clubs WHERE id = ${clubId}::uuid FOR UPDATE`;
        const club = await tx.club.findUnique({ where: { id: clubId } });
        if (club === null) throw clubError('CLUB_NOT_FOUND', 404);
        return club;
    }

    private async lockRule(clubId: string, ruleId: string, tx: Prisma.TransactionClient) {
        await tx.$queryRaw`SELECT id FROM recurring_match_rules WHERE id = ${ruleId}::uuid FOR UPDATE`;
        const rule = await tx.recurringMatchRule.findFirst({ where: { id: ruleId, clubId } });
        if (rule === null) throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
        return rule;
    }

    private async membership(clubId: string, membershipId: string, tx: Prisma.TransactionClient) {
        const membership = await tx.clubMembership.findFirst({
            where: { id: membershipId, clubId, state: ClubMembershipState.ACTIVE },
        });
        if (membership === null) throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
        return membership;
    }

    private async createMembership(clubId: string, userId: string, tx: Prisma.TransactionClient) {
        return tx.clubMembership.create({ data: { id: uuidV7(), clubId, userId, role: ClubRole.MEMBER } });
    }

    private async endMembership(
        club: { id: string; version: number },
        membership: { id: string; userId: string; role: ClubRole; revision: number },
        state: ClubMembershipState,
        expectedRevision: number,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        this.revision(membership.revision, expectedRevision);
        if (membership.role === ClubRole.OWNER) throw clubError('CLUB_OWNER_REQUIRED', 409);
        const updated = await tx.clubMembership.update({
            where: { id: membership.id },
            data: { state, revision: { increment: 1 }, endedAt: new Date() },
        });
        await this.endIntents(club.id, membership.userId, tx);
        await this.bumpClub(club.id, tx);
        await this.membershipEvent(tx, { ...club, version: club.version + 1 }, updated);
        return this.projectMembership(updated);
    }

    private async endIntents(clubId: string, userId: string, tx: Prisma.TransactionClient): Promise<void> {
        const now = new Date();
        await tx.clubJoinRequest.updateMany({
            where: { clubId, requesterId: userId, state: 'PENDING' },
            data: { state: 'SUPERSEDED', revision: { increment: 1 }, resolvedAt: now },
        });
        await tx.clubInvitation.updateMany({
            where: { clubId, inviteeId: userId, state: 'PENDING' },
            data: { state: 'SUPERSEDED', revision: { increment: 1 }, resolvedAt: now },
        });
    }

    private async assertNoAccess(
        userId: string,
        clubId: string,
        tx: Prisma.TransactionClient,
        ignoredInvitationId?: string,
        ignoredRequestId?: string,
        allowRequest = false
    ): Promise<void> {
        if (await tx.clubBlock.findFirst({ where: { clubId, userId, state: 'ACTIVE' } }))
            throw clubError('CLUB_BLOCKED', 403);
        if (await tx.clubMembership.findFirst({ where: { clubId, userId, state: 'ACTIVE' } }))
            throw clubError('CLUB_MEMBERSHIP_EXISTS', 409);
        const [request, invitation] = await Promise.all([
            tx.clubJoinRequest.findFirst({
                where: {
                    clubId,
                    requesterId: userId,
                    state: 'PENDING',
                    ...(ignoredRequestId === undefined ? {} : { id: { not: ignoredRequestId } }),
                },
            }),
            tx.clubInvitation.findFirst({
                where: {
                    clubId,
                    inviteeId: userId,
                    state: 'PENDING',
                    ...(ignoredInvitationId === undefined ? {} : { id: { not: ignoredInvitationId } }),
                },
            }),
        ]);
        if ((!allowRequest && request !== null) || invitation !== null) throw clubError('CLUB_INTENT_EXISTS', 409);
    }

    private async invitationRecord(actorId: string, token: string, tx: Prisma.TransactionClient, lock = false) {
        const tokenHash = this.crypto.hash(`CLUB_INVITATION:${token}`);
        if (lock) await tx.$queryRaw`SELECT id FROM club_invitations WHERE token_hash = ${tokenHash} FOR UPDATE`;
        const invitation = await tx.clubInvitation.findUnique({ where: { tokenHash } });
        if (invitation === null) throw clubError('INVITATION_NOT_FOUND', 404);
        if (invitation.state === ClubInvitationState.PENDING && invitation.expiresAt <= new Date()) {
            await this.expireInvitations(tx, { id: invitation.id });
            throw clubError('INVITATION_NOT_FOUND', 404);
        }
        if (invitation.state !== ClubInvitationState.PENDING) throw clubError('INVITATION_NOT_FOUND', 404);
        if (invitation.inviteeId !== actorId) throw clubError('INVITATION_NOT_ADDRESSED_TO_CALLER', 403);
        return invitation;
    }

    private async expireInvitations(
        tx: Prisma.TransactionClient,
        scope: { clubId?: string; id?: string }
    ): Promise<void> {
        const now = new Date();
        await tx.clubInvitation.updateMany({
            where: {
                ...scope,
                state: ClubInvitationState.PENDING,
                expiresAt: { lte: now },
            },
            data: { state: ClubInvitationState.EXPIRED, revision: { increment: 1 }, resolvedAt: now },
        });
    }

    private async bumpClub(clubId: string, tx: Prisma.TransactionClient): Promise<number> {
        return (
            await tx.club.update({ where: { id: clubId }, data: { version: { increment: 1 }, updatedAt: new Date() } })
        ).version;
    }

    private version(actual: number, expected: number): void {
        if (actual !== expected) throw clubError('CLUB_VERSION_CONFLICT', 409);
    }
    private revision(actual: number, expected: number): void {
        if (actual !== expected) throw clubError('CLUB_RESOURCE_REVISION_CONFLICT', 409);
    }
    private pending(state: string, revision: number, expected: number): void {
        this.revision(revision, expected);
        if (state !== 'PENDING') throw clubError('CLUB_INTENT_NOT_PENDING', 409);
    }
    private canManage(actor: ClubRole, target: ClubRole, self: boolean): void {
        if (self || target === ClubRole.OWNER || (actor === ClubRole.ADMIN && target !== ClubRole.MEMBER))
            throw clubError('CLUB_ACTION_FORBIDDEN', 403);
    }

    private validateRule(
        body: Pick<CreateRecurringRuleDto, 'weekdays' | 'startsOn' | 'endsOn' | 'timeZone' | 'template'>
    ): void {
        if (new Set(body.weekdays).size !== body.weekdays.length || body.weekdays.some((day) => day < 1 || day > 7))
            throw clubError('VALIDATION_FAILED', 400);
        try {
            assertTimeZone(body.timeZone);
        } catch {
            throw clubError('VALIDATION_FAILED', 400);
        }
        if (body.endsOn != null && body.endsOn.slice(0, 10) < body.startsOn.slice(0, 10))
            throw clubError('VALIDATION_FAILED', 400);
        this.validateTemplate(body.template);
    }

    private validateTemplate(template: RecurringMatchTemplateDto): void {
        if (
            (template.skillMin * 2) % 1 !== 0 ||
            (template.skillMax * 2) % 1 !== 0 ||
            template.skillMin > template.skillMax
        )
            throw clubError('VALIDATION_FAILED', 400);
        if (template.bookingState !== BookingStateDto.BOOKED_EXTERNALLY && template.bookingNote != null)
            throw clubError('VALIDATION_FAILED', 400);
    }

    private async assertOnboarded(userId: string, tx: Prisma.TransactionClient): Promise<void> {
        const profile = await tx.playerProfileDraft.findUnique({ where: { userId } });
        if (profile?.completedAt == null) throw clubError('ONBOARDING_REQUIRED', 403);
    }

    private async assertTemplateVenue(clubId: string, venueId: string, tx: Prisma.TransactionClient): Promise<void> {
        const link = await tx.clubVenue.findUnique({
            where: { clubId_venueId: { clubId, venueId } },
            include: { venue: true },
        });
        if (
            link === null ||
            link.venue.publicationState !== VenuePublicationState.PUBLISHED ||
            link.venue.canonicalVenueId !== null
        )
            throw clubError('CLUB_VENUE_UNAVAILABLE', 409);
    }

    private normalized(value: string): string {
        return this.text(value).normalize('NFKC').toLocaleLowerCase('ru-RU');
    }
    private text(value: string): string {
        const result = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
        for (const character of result) {
            const code = character.codePointAt(0) ?? 0;
            if (code < 32 || code === 127) throw clubError('VALIDATION_FAILED', 400);
        }
        return result;
    }

    private decodeCursor(value: string, bind: string): { snapshotAt: string; lastName: string; lastId: string } {
        try {
            const cursor = this.cursors.decode<{
                type: string;
                bind: string;
                snapshotAt: string;
                lastName: string;
                lastId: string;
            }>(value, 'club-search');
            if (cursor.bind !== bind) throw new Error('bind');
            return cursor;
        } catch {
            throw clubError('INVALID_CURSOR', 400);
        }
    }

    private page(items: object[], limit: number): object {
        const hasNext = items.length > limit;
        return { items: items.slice(0, limit), pageInfo: { hasNext, nextCursor: null } };
    }

    private summary(club: Parameters<ClubService['projectClub']>[0]): object {
        return {
            id: club.id,
            state: club.state,
            name: club.name,
            locality: club.locality,
            membershipPolicy: club.membershipPolicy,
            memberCount: club.memberships.length,
            venueIds: club.venues.map((venue) => venue.venueId),
        };
    }

    private projectClub(club: {
        id: string;
        version: number;
        state: ClubState;
        name: string;
        description: string;
        locality: string;
        membershipPolicy: ClubMembershipPolicy;
        createdAt: Date;
        updatedAt: Date;
        venues: { clubId: string; venueId: string; linkedAt: Date }[];
        memberships: unknown[];
    }): object {
        return {
            id: club.id,
            version: club.version,
            state: club.state,
            name: club.name,
            description: club.description,
            locality: club.locality,
            membershipPolicy: club.membershipPolicy,
            memberCount: club.memberships.length,
            venues: club.venues.map((venue) => ({
                clubId: venue.clubId,
                venueId: venue.venueId,
                linkedAt: venue.linkedAt.toISOString(),
            })),
            createdAt: club.createdAt.toISOString(),
            updatedAt: club.updatedAt.toISOString(),
        };
    }

    private projectMembership(row: {
        id: string;
        clubId: string;
        userId: string;
        role: ClubRole;
        state: ClubMembershipState;
        revision: number;
        joinedAt: Date;
        endedAt: Date | null;
    }): object {
        return { ...row, joinedAt: row.joinedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null };
    }
    private projectRequest(row: {
        id: string;
        clubId: string;
        requesterId: string;
        state: string;
        revision: number;
        createdAt: Date;
        resolvedAt: Date | null;
    }): object {
        return { ...row, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null };
    }
    private projectInvitation(row: {
        id: string;
        clubId: string;
        inviteeId: string;
        state: string;
        revision: number;
        expiresAt: Date;
        createdAt: Date;
        resolvedAt: Date | null;
    }): object {
        return {
            id: row.id,
            clubId: row.clubId,
            inviteeId: row.inviteeId,
            state: row.state,
            revision: row.revision,
            expiresAt: row.expiresAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString() ?? null,
        };
    }
    private projectRule(rule: {
        id: string;
        clubId: string;
        organizerId: string;
        revision: number;
        state: string;
        frequency: string;
        intervalWeeks: number;
        weekdays: number[];
        localStartTime: Date;
        timeZone: string;
        tzdataVersion: string;
        dstGapPolicy: string;
        dstOverlapPolicy: string;
        startsOn: Date;
        endsOn: Date | null;
        generatedThrough: Date | null;
        generationHorizonDays: number;
        matchTemplate: Prisma.JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }): object {
        return {
            id: rule.id,
            clubId: rule.clubId,
            organizerId: rule.organizerId,
            revision: rule.revision,
            state: rule.state,
            frequency: rule.frequency,
            intervalWeeks: rule.intervalWeeks,
            weekdays: rule.weekdays,
            localStartTime: rule.localStartTime.toISOString().slice(11, 16),
            timeZone: rule.timeZone,
            tzdataVersion: rule.tzdataVersion,
            dstGapPolicy: rule.dstGapPolicy,
            dstOverlapPolicy: rule.dstOverlapPolicy,
            startsOn: rule.startsOn.toISOString().slice(0, 10),
            endsOn: rule.endsOn?.toISOString().slice(0, 10) ?? null,
            generatedThrough: rule.generatedThrough?.toISOString().slice(0, 10) ?? null,
            generationHorizonDays: rule.generationHorizonDays,
            template: rule.matchTemplate,
            createdAt: rule.createdAt.toISOString(),
            updatedAt: rule.updatedAt.toISOString(),
        };
    }
    private projectOccurrence(row: {
        id: string;
        clubId: string;
        ruleId: string;
        calendarKey: string;
        state: string;
        startsAt: Date | null;
        utcOffsetMinutes: number | null;
        matchId: string | null;
        materializedAt: Date;
    }): object {
        return {
            id: row.id,
            clubId: row.clubId,
            ruleId: row.ruleId,
            calendarKey: row.calendarKey,
            state: row.state,
            startsAt: row.startsAt?.toISOString() ?? null,
            utcOffsetMinutes: row.utcOffsetMinutes,
            matchId: row.matchId,
            materializedAt: row.materializedAt.toISOString(),
        };
    }

    private async audit(
        tx: Prisma.TransactionClient,
        clubId: string,
        actorId: string,
        targetId: string,
        action: string,
        reasonCode: string
    ): Promise<void> {
        await tx.clubGovernanceAudit.create({
            data: {
                id: uuidV7(),
                clubId,
                operationId: uuidV7(),
                actorId,
                targetId,
                action,
                outcome: 'SUCCEEDED',
                reasonCode,
            },
        });
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
    private async membershipEvent(
        tx: Prisma.TransactionClient,
        club: { id: string; version: number },
        membership: { id: string; revision: number; state: string; role: string }
    ): Promise<void> {
        await this.event(tx, 'club.membership.changed.v1', new Date(), {
            clubId: club.id,
            clubVersion: club.version,
            membershipId: membership.id,
            membershipRevision: membership.revision,
            state: membership.state,
            role: membership.role,
        });
    }
    private async ruleEvent(
        tx: Prisma.TransactionClient,
        clubId: string,
        clubVersion: number,
        rule: { id: string; revision: number; state: string }
    ): Promise<void> {
        await this.event(tx, 'club.recurring.rule.changed.v1', new Date(), {
            clubId,
            clubVersion,
            ruleId: rule.id,
            ruleRevision: rule.revision,
            state: rule.state,
        });
    }
}
