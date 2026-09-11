import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClubMembershipPolicy, ClubRole, ClubState, Prisma, VenueVerificationState } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ClubMembershipPolicyDto, RecurringOverlapPolicyDto } from '../../src/clubs/club.dto';
import { ClubService } from '../../src/clubs/club.service';
import { RecurringMatchGeneratorService } from '../../src/clubs/recurring-match-generator.service';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { Clock } from '../../src/identity/clock';
import { BookingStateDto, MatchFormatDto, MatchJoinModeDto, MatchVisibilityDto } from '../../src/matches/match.dto';
import { FakeClock } from '../fakes/fake-clock';

describe('clubs backend concurrency and recurrence', () => {
    const now = new Date('2026-09-11T06:00:00.000Z');
    const clock = new FakeClock(now);
    let application: INestApplication;
    let prisma: PrismaService;
    let clubs: ClubService;
    let generator: RecurringMatchGeneratorService;
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
        generator = application.get(RecurringMatchGeneratorService);
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
});
