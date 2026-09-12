import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClubMembershipPolicy, ClubRole, ClubState, MatchState, Prisma, VenueVerificationState } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ClubMembershipPolicyDto, RecurringOverlapPolicyDto } from '../../src/clubs/club.dto';
import { ClubMetricsService } from '../../src/clubs/club-metrics.service';
import { ClubService } from '../../src/clubs/club.service';
import { RecurringMatchGeneratorService } from '../../src/clubs/recurring-match-generator.service';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { Clock } from '../../src/identity/clock';
import {
    BookingStateDto,
    MatchFormatDto,
    MatchJoinModeDto,
    MatchResultModeDto,
    MatchTeamChoiceDto,
    MatchVisibilityDto,
} from '../../src/matches/match.dto';
import { MatchService } from '../../src/matches/match.service';
import { FakeClock } from '../fakes/fake-clock';

describe('clubs backend concurrency and recurrence', () => {
    const now = new Date('2026-09-11T06:00:00.000Z');
    const clock = new FakeClock(now);
    let application: INestApplication;
    let prisma: PrismaService;
    let clubs: ClubService;
    let clubMetrics: ClubMetricsService;
    let generator: RecurringMatchGeneratorService;
    let matches: MatchService;
    let venueId: string;

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(Clock)
            .useValue(clock)
            .compile();
        application = module.createNestApplication();
        configureApplication(application);
        await application.init();
        prisma = application.get(PrismaService);
        clubs = application.get(ClubService);
        clubMetrics = application.get(ClubMetricsService);
        generator = application.get(RecurringMatchGeneratorService);
        matches = application.get(MatchService);
        venueId = uuidV7();
        await prisma.venue.create({
            data: {
                id: venueId,
                name: 'Клубный integration-корт',
                normalizedAddress: 'Москва, Integration, 1',
                locality: 'Москва',
                timeZone: 'Europe/Moscow',
                longitude: 37.6173,
                latitude: 55.7558,
                verificationState: VenueVerificationState.MODERATOR_VERIFIED,
                lastVerifiedAt: now,
            },
        });
    });

    afterAll(async () => application.close());

    function transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    async function player(): Promise<string> {
        const id = uuidV7();
        await prisma.user.create({
            data: {
                id,
                completedAt: now,
                draft: {
                    create: {
                        displayName: `Клубный игрок ${id.slice(-6)}`,
                        timeZone: 'Europe/Moscow',
                        gameFormats: ['SINGLES'],
                        skillSelfAssessment: 3,
                        completedAt: now,
                        updatedAt: now,
                    },
                },
            },
        });
        return id;
    }

    async function club(policy = ClubMembershipPolicyDto.OPEN): Promise<{ id: string; ownerId: string }> {
        const ownerId = await player();
        const result = (await transaction((tx) =>
            clubs.create(
                ownerId,
                {
                    name: `Клуб ${uuidV7().slice(-6)}`,
                    description: 'Integration',
                    locality: 'Москва',
                    membershipPolicy: policy,
                },
                tx
            )
        )) as { id: string };
        return { id: result.id, ownerId };
    }

    it('converges concurrent open joins to one active membership', async () => {
        const fixture = await club();
        const candidate = await player();
        const attempts = await Promise.allSettled([
            transaction((tx) => clubs.join(candidate, fixture.id, { expectedVersion: 0 }, tx)),
            transaction((tx) => clubs.join(candidate, fixture.id, { expectedVersion: 0 }, tx)),
        ]);
        expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        await expect(
            prisma.clubMembership.count({ where: { clubId: fixture.id, userId: candidate, state: 'ACTIVE' } })
        ).resolves.toBe(1);
    });

    it('enforces approval, invitation-only and invitation/request convergence', async () => {
        const approval = await club(ClubMembershipPolicyDto.APPROVAL);
        const candidate = await player();
        const joined = (await transaction((tx) => clubs.join(candidate, approval.id, { expectedVersion: 0 }, tx))) as {
            membership: null;
            joinRequest: { id: string; revision: number };
        };
        expect(joined.membership).toBeNull();
        await expect(clubs.listMembers(candidate, approval.id, 20)).rejects.toMatchObject({
            code: 'CLUB_ACTION_FORBIDDEN',
        });
        const delivery = (await transaction((tx) =>
            clubs.createInvitation(approval.ownerId, approval.id, candidate, 0, tx)
        )) as { invitation: { id: string }; token: string };
        const outcomes = await Promise.allSettled([
            transaction((tx) =>
                clubs.decideRequest(
                    approval.ownerId,
                    approval.id,
                    joined.joinRequest.id,
                    'APPROVED',
                    { expectedClubVersion: 0, expectedRevision: joined.joinRequest.revision },
                    tx
                )
            ),
            transaction((tx) =>
                clubs.decideInvitation(
                    candidate,
                    delivery.token,
                    'ACCEPTED',
                    { expectedClubVersion: 0, expectedRevision: 0 },
                    tx
                )
            ),
        ]);
        expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        await expect(
            prisma.clubMembership.count({ where: { clubId: approval.id, userId: candidate, state: 'ACTIVE' } })
        ).resolves.toBe(1);
        await expect(
            prisma.clubJoinRequest.findUniqueOrThrow({ where: { id: joined.joinRequest.id } })
        ).resolves.toMatchObject({ state: 'SUPERSEDED' });

        const inviteOnly = await club(ClubMembershipPolicyDto.INVITE_ONLY);
        const outsider = await player();
        await expect(
            transaction((tx) => clubs.join(outsider, inviteOnly.id, { expectedVersion: 0 }, tx))
        ).rejects.toMatchObject({ code: 'CLUB_ACTION_FORBIDDEN' });
    });

    it('keeps management authorization scoped to one club', async () => {
        const first = await club();
        const second = await club();
        await expect(
            transaction((tx) =>
                clubs.update(first.ownerId, second.id, { expectedVersion: 0, description: 'cross-club' }, tx)
            )
        ).rejects.toMatchObject({ code: 'CLUB_ACTION_FORBIDDEN' });
        await expect(prisma.club.findUniqueOrThrow({ where: { id: second.id } })).resolves.toMatchObject({
            description: 'Integration',
            version: 0,
        });
    });

    it('preserves history across leave, exclusion and club block', async () => {
        const fixture = await club();
        const leavingId = await player();
        const excludedId = await player();
        await transaction((tx) => clubs.join(leavingId, fixture.id, { expectedVersion: 0 }, tx));
        await transaction((tx) => clubs.join(excludedId, fixture.id, { expectedVersion: 1 }, tx));
        const leaving = await prisma.clubMembership.findFirstOrThrow({
            where: { clubId: fixture.id, userId: leavingId, state: 'ACTIVE' },
        });
        await transaction((tx) =>
            clubs.leave(
                leavingId,
                fixture.id,
                leaving.id,
                { expectedClubVersion: 2, expectedRevision: leaving.revision },
                tx
            )
        );
        const excluded = await prisma.clubMembership.findFirstOrThrow({
            where: { clubId: fixture.id, userId: excludedId, state: 'ACTIVE' },
        });
        await transaction((tx) =>
            clubs.block(
                fixture.ownerId,
                fixture.id,
                excluded.id,
                {
                    expectedClubVersion: 3,
                    expectedRevision: excluded.revision,
                    reasonCode: 'COMMUNITY_SAFETY',
                },
                tx
            )
        );
        await expect(
            transaction((tx) => clubs.join(excludedId, fixture.id, { expectedVersion: 4 }, tx))
        ).rejects.toMatchObject({ code: 'CLUB_BLOCKED' });
        await expect(prisma.clubMembership.findUniqueOrThrow({ where: { id: leaving.id } })).resolves.toMatchObject({
            state: 'LEFT',
        });
        await expect(prisma.clubMembership.findUniqueOrThrow({ where: { id: excluded.id } })).resolves.toMatchObject({
            state: 'EXCLUDED',
        });
        await expect(
            prisma.clubMembership.count({ where: { clubId: fixture.id, role: 'OWNER', state: 'ACTIVE' } })
        ).resolves.toBe(1);
    });

    it('atomically transfers ownership and never permits an owner to leave', async () => {
        const fixture = await club();
        const targetId = await player();
        await transaction((tx) => clubs.join(targetId, fixture.id, { expectedVersion: 0 }, tx));
        const root = await prisma.club.findUniqueOrThrow({ where: { id: fixture.id } });
        const target = await prisma.clubMembership.findFirstOrThrow({
            where: { clubId: fixture.id, userId: targetId, state: 'ACTIVE' },
        });
        await transaction((tx) =>
            clubs.transfer(
                fixture.ownerId,
                fixture.id,
                { expectedVersion: root.version, targetMembershipId: target.id, reasonCode: 'OWNER_REQUEST' },
                tx
            )
        );
        const owners = await prisma.clubMembership.findMany({
            where: { clubId: fixture.id, state: 'ACTIVE', role: ClubRole.OWNER },
        });
        expect(owners).toHaveLength(1);
        const owner = owners[0];
        if (owner === undefined) throw new Error('Expected transferred owner');
        expect(owner.userId).toBe(targetId);
        await expect(
            transaction((tx) =>
                clubs.leave(
                    targetId,
                    fixture.id,
                    owner.id,
                    { expectedClubVersion: root.version + 1, expectedRevision: owner.revision },
                    tx
                )
            )
        ).rejects.toMatchObject({ code: 'CLUB_OWNER_REQUIRED' });
    });

    it('materializes each calendar position once and creates no match for an archived club', async () => {
        const fixture = await club(ClubMembershipPolicyDto.APPROVAL);
        await transaction((tx) => clubs.linkVenue(fixture.ownerId, fixture.id, venueId, 0, tx));
        const root = await prisma.club.findUniqueOrThrow({ where: { id: fixture.id } });
        const rule = (await transaction((tx) =>
            clubs.createRule(
                fixture.ownerId,
                fixture.id,
                {
                    expectedVersion: root.version,
                    frequency: 'WEEKLY',
                    intervalWeeks: 1,
                    weekdays: [1],
                    localStartTime: '12:00',
                    timeZone: 'Europe/Moscow',
                    dstGapPolicy: 'SKIP',
                    dstOverlapPolicy: RecurringOverlapPolicyDto.EARLIER_OFFSET,
                    startsOn: '2026-09-11',
                    endsOn: '2026-10-20',
                    template: {
                        format: MatchFormatDto.SINGLES,
                        visibility: MatchVisibilityDto.PUBLIC,
                        joinMode: MatchJoinModeDto.AUTO,
                        venueId,
                        skillMin: 1,
                        skillMax: 5,
                        description: 'Независимая клубная встреча',
                        bookingState: BookingStateDto.NOT_BOOKED,
                    },
                },
                tx
            )
        )) as { id: string };

        expect(await generator.runOnce(now)).toBeGreaterThan(0);
        const firstCount = await prisma.recurringMatchOccurrence.count({ where: { ruleId: rule.id } });
        const firstMatches = await prisma.match.count({ where: { recurringRuleId: rule.id } });
        expect(firstMatches).toBeGreaterThan(0);
        await expect(generator.runOnce(now)).resolves.toBe(0);
        await expect(prisma.recurringMatchOccurrence.count({ where: { ruleId: rule.id } })).resolves.toBe(firstCount);
        await expect(prisma.match.count({ where: { recurringRuleId: rule.id } })).resolves.toBe(firstMatches);
        const generatedMatches = await prisma.match.findMany({
            where: { recurringRuleId: rule.id },
            orderBy: { startsAt: 'asc' },
        });
        const cancelled = generatedMatches[0];
        if (cancelled === undefined) throw new Error('Expected a recurring match');
        await transaction((tx) => matches.cancel(fixture.ownerId, cancelled.id, cancelled.version, tx));
        await expect(prisma.match.findUniqueOrThrow({ where: { id: cancelled.id } })).resolves.toMatchObject({
            state: MatchState.CANCELLED,
        });
        const unaffected = generatedMatches[1];
        if (unaffected !== undefined)
            await expect(prisma.match.findUniqueOrThrow({ where: { id: unaffected.id } })).resolves.toMatchObject({
                state: MatchState.PUBLISHED,
            });
        await expect(prisma.recurringMatchRule.findUniqueOrThrow({ where: { id: rule.id } })).resolves.toMatchObject({
            state: 'ACTIVE',
        });

        const archived = await club();
        await transaction((tx) => clubs.linkVenue(archived.ownerId, archived.id, venueId, 0, tx));
        const archivedRoot = await prisma.club.findUniqueOrThrow({ where: { id: archived.id } });
        const archivedRule = (await transaction((tx) =>
            clubs.createRule(
                archived.ownerId,
                archived.id,
                {
                    expectedVersion: archivedRoot.version,
                    frequency: 'WEEKLY',
                    intervalWeeks: 1,
                    weekdays: [1],
                    localStartTime: '12:00',
                    timeZone: 'Europe/Moscow',
                    dstGapPolicy: 'SKIP',
                    dstOverlapPolicy: RecurringOverlapPolicyDto.EARLIER_OFFSET,
                    startsOn: '2026-09-11',
                    endsOn: '2026-09-30',
                    template: {
                        format: MatchFormatDto.SINGLES,
                        visibility: MatchVisibilityDto.PUBLIC,
                        joinMode: MatchJoinModeDto.AUTO,
                        venueId,
                        skillMin: 1,
                        skillMax: 5,
                        description: 'Архивная серия',
                        bookingState: BookingStateDto.NOT_BOOKED,
                    },
                },
                tx
            )
        )) as { id: string };
        const beforeArchive = await prisma.club.findUniqueOrThrow({ where: { id: archived.id } });
        await transaction((tx) =>
            clubs.state(
                archived.ownerId,
                archived.id,
                ClubState.ARCHIVED,
                { expectedVersion: beforeArchive.version, reasonCode: 'OWNER_REQUEST' },
                tx
            )
        );
        await generator.runOnce(now);
        await expect(prisma.match.count({ where: { recurringRuleId: archivedRule.id } })).resolves.toBe(0);
        await expect(prisma.club.findUniqueOrThrow({ where: { id: archived.id } })).resolves.toMatchObject({
            state: 'ARCHIVED',
            membershipPolicy: ClubMembershipPolicy.OPEN,
        });
    });

    it('resolves a merged venue in the club card without rewriting historical matches', async () => {
        const fixture = await club();
        const previousVenueId = uuidV7();
        const survivorVenueId = uuidV7();
        for (const [id, suffix] of [
            [previousVenueId, 'duplicate'],
            [survivorVenueId, 'survivor'],
        ] as const)
            await prisma.venue.create({
                data: {
                    id,
                    name: `Verification ${suffix}`,
                    normalizedAddress: `Москва, ${suffix}`,
                    locality: 'Москва',
                    timeZone: 'Europe/Moscow',
                    longitude: 37.62,
                    latitude: 55.76,
                    verificationState: VenueVerificationState.MODERATOR_VERIFIED,
                    lastVerifiedAt: now,
                },
            });
        await transaction((tx) => clubs.linkVenue(fixture.ownerId, fixture.id, previousVenueId, 0, tx));
        const created = (await transaction((tx) =>
            clubs.createMatch(
                fixture.ownerId,
                fixture.id,
                {
                    expectedVersion: 1,
                    match: {
                        format: MatchFormatDto.SINGLES,
                        visibility: MatchVisibilityDto.PUBLIC,
                        joinMode: MatchJoinModeDto.AUTO,
                        startsAt: '2026-09-20T09:00:00.000Z',
                        timeZone: 'Europe/Moscow',
                        venueId: previousVenueId,
                        skillMin: 1,
                        skillMax: 5,
                        description: 'Historical venue reference',
                        bookingState: BookingStateDto.NOT_BOOKED,
                    },
                },
                tx
            )
        )) as { id: string };
        await prisma.venue.update({
            where: { id: previousVenueId },
            data: { canonicalVenueId: survivorVenueId, publicationState: 'MERGED' },
        });

        await expect(clubs.detail(fixture.id)).resolves.toMatchObject({
            venues: [{ clubId: fixture.id, venueId: survivorVenueId }],
        });
        await expect(prisma.match.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({
            clubId: fixture.id,
            venueId: previousVenueId,
        });
        await expect(prisma.venue.findUnique({ where: { id: previousVenueId } })).resolves.not.toBeNull();
    });

    it('completes join to recurring match to confirmed club metric exactly once', async () => {
        const fixture = await club();
        const opponentId = await player();
        await transaction((tx) => clubs.join(opponentId, fixture.id, { expectedVersion: 0 }, tx));
        await transaction((tx) => clubs.linkVenue(fixture.ownerId, fixture.id, venueId, 1, tx));
        const root = await prisma.club.findUniqueOrThrow({ where: { id: fixture.id } });
        const rule = (await transaction((tx) =>
            clubs.createRule(
                fixture.ownerId,
                fixture.id,
                {
                    expectedVersion: root.version,
                    frequency: 'WEEKLY',
                    intervalWeeks: 1,
                    weekdays: [1],
                    localStartTime: '12:00',
                    timeZone: 'Europe/Moscow',
                    dstGapPolicy: 'SKIP',
                    dstOverlapPolicy: RecurringOverlapPolicyDto.EARLIER_OFFSET,
                    startsOn: '2026-09-11',
                    endsOn: '2026-10-20',
                    template: {
                        format: MatchFormatDto.SINGLES,
                        visibility: MatchVisibilityDto.PUBLIC,
                        joinMode: MatchJoinModeDto.AUTO,
                        venueId,
                        skillMin: 1,
                        skillMax: 5,
                        description: 'Verification end-to-end',
                        bookingState: BookingStateDto.NOT_BOOKED,
                    },
                },
                tx
            )
        )) as { id: string };
        await generator.runOnce(now);
        const occurrence = await prisma.recurringMatchOccurrence.findFirstOrThrow({
            where: { ruleId: rule.id, state: 'MATERIALIZED' },
            orderBy: { startsAt: 'asc' },
        });
        if (occurrence.matchId === null || occurrence.startsAt === null) throw new Error('Expected materialized match');
        const matchId = occurrence.matchId;
        const published = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
        await transaction((tx) =>
            matches.join(
                opponentId,
                matchId,
                { expectedVersion: published.version, teamChoice: MatchTeamChoiceDto.TEAM_B },
                tx
            )
        );
        clock.advance(occurrence.startsAt.getTime() - clock.now().getTime());
        const ready = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
        await transaction((tx) => matches.start(fixture.ownerId, matchId, ready.version, tx));
        const started = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
        const result = (await transaction((tx) =>
            matches.proposeResult(
                fixture.ownerId,
                matchId,
                { expectedVersion: started.version, mode: MatchResultModeDto.PLAYED_WITHOUT_SCORE },
                tx
            )
        )) as { id: string; version: number };
        await expect(clubMetrics.confirmedMatches(fixture.id)).resolves.toMatchObject({ total: 0 });
        const awaiting = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
        await transaction((tx) =>
            matches.resolveResult(
                opponentId,
                matchId,
                result.id,
                { expectedVersion: awaiting.version, resultVersion: result.version },
                'CONFIRMED',
                tx
            )
        );
        await expect(clubMetrics.confirmedMatches(fixture.id)).resolves.toEqual({
            total: 1,
            byOrigin: { CLUB: 0, RECURRING_RULE: 1 },
            byFormat: { DOUBLES: 0, SINGLES: 1 },
        });
        await expect(
            transaction((tx) =>
                matches.resolveResult(
                    opponentId,
                    matchId,
                    result.id,
                    { expectedVersion: awaiting.version, resultVersion: result.version },
                    'CONFIRMED',
                    tx
                )
            )
        ).rejects.toMatchObject({ code: 'MATCH_VERSION_CONFLICT' });
        await expect(clubMetrics.confirmedMatches(fixture.id)).resolves.toMatchObject({ total: 1 });
    });
});
