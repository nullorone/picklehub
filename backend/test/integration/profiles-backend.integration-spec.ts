import { type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MatchFormat, MatchTeamCode } from '@prisma/client';

import { AuditModule } from '../../src/audit/audit.module';
import { TypedConfigModule } from '../../src/common/config/config.module';
import { DatabaseModule } from '../../src/common/database/database.module';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { RequestContextModule } from '../../src/common/request-context/request-context.module';
import { Clock } from '../../src/identity/clock';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import { OutboxService } from '../../src/outbox/outbox.service';
import { ConfiguredProfileAvatarStorage, ProfileAvatarStorage } from '../../src/profiles/profile-avatar-storage';
import { ProfileCursorService } from '../../src/profiles/profile-cursor.service';
import { ProfileProjectionService } from '../../src/profiles/profile-projection.service';
import { ProfileService } from '../../src/profiles/profile.service';
import { FakeClock } from '../fakes/fake-clock';

describe('profiles backend projection and access', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    const clock = new FakeClock(now);
    let application: INestApplicationContext | undefined;
    let prisma: PrismaService;
    let projection: ProfileProjectionService;
    let profiles: ProfileService;
    let localityId: string;

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [TypedConfigModule, DatabaseModule, RequestContextModule, AuditModule],
            providers: [
                ProfileService,
                ProfileProjectionService,
                ProfileCursorService,
                IdentityCryptoService,
                OutboxService,
                { provide: Clock, useValue: clock },
                { provide: ProfileAvatarStorage, useClass: ConfiguredProfileAvatarStorage },
            ],
        }).compile();
        application = module;
        await application.init();
        prisma = module.get(PrismaService);
        projection = module.get(ProfileProjectionService);
        profiles = module.get(ProfileService);
        localityId = uuidV7();
        await prisma.onboardingLocality.create({
            data: { id: localityId, name: 'Москва', countryCode: 'RU', region: 'Москва', catalogueVersion: 1 },
        });
    });

    afterAll(async () => {
        await application?.close();
    });

    async function player(name: string): Promise<string> {
        const id = uuidV7();
        await prisma.user.create({
            data: {
                id,
                completedAt: now,
                draft: {
                    create: {
                        version: 1,
                        displayName: name,
                        timeZone: 'Europe/Moscow',
                        localityId,
                        gameFormats: ['SINGLES'],
                        skillSelfAssessment: 3,
                        completedAt: now,
                        updatedAt: now,
                    },
                },
            },
        });
        await prisma.playerProfile.create({
            data: {
                userId: id,
                version: 1,
                displayName: name,
                timeZone: 'Europe/Moscow',
                localityId,
                gameFormats: ['SINGLES'],
                skillSelfAssessment: 3,
                updatedAt: now,
            },
        });
        return id;
    }

    it('converges duplicate and out-of-order deliveries without counting a guest', async () => {
        const organizerId = await player('Организатор');
        const opponentId = await player('Соперник');
        const partnerId = await player('Партнёр');
        const matchId = uuidV7();
        const resultId = uuidV7();
        await prisma.match.create({
            data: {
                id: matchId,
                organizerId,
                version: 5,
                state: 'COMPLETED',
                format: MatchFormat.DOUBLES,
                visibility: 'PUBLIC',
                joinMode: 'AUTO',
                startsAt: new Date(now.getTime() - 3_600_000),
                timeZone: 'Europe/Moscow',
                skillMin: 1,
                skillMax: 5,
                description: 'Подтверждённый integration-матч',
                policyVersion: 'matches-v1',
                teams: {
                    create: [
                        { code: MatchTeamCode.TEAM_A, capacity: 2 },
                        { code: MatchTeamCode.TEAM_B, capacity: 2 },
                    ],
                },
                participants: {
                    create: [
                        {
                            id: uuidV7(),
                            userId: organizerId,
                            team: MatchTeamCode.TEAM_A,
                            state: 'PLAYED',
                            isOrganizer: true,
                        },
                        { id: uuidV7(), userId: partnerId, team: MatchTeamCode.TEAM_A, state: 'PLAYED' },
                        { id: uuidV7(), userId: opponentId, team: MatchTeamCode.TEAM_B, state: 'PLAYED' },
                    ],
                },
                guests: { create: { id: uuidV7(), team: MatchTeamCode.TEAM_B, label: 'Гость', createdBy: opponentId } },
                results: {
                    create: {
                        id: resultId,
                        version: 1,
                        state: 'CONFIRMED',
                        mode: 'SCORED',
                        seriesFormat: 'BEST_OF_3',
                        winningTeam: MatchTeamCode.TEAM_A,
                        proposedBy: organizerId,
                        resolvedAt: now,
                        games: {
                            create: [
                                { gameNumber: 1, teamAPoints: 11, teamBPoints: 7 },
                                { gameNumber: 2, teamAPoints: 11, teamBPoints: 9 },
                            ],
                        },
                    },
                },
                metricMarkers: {
                    create: {
                        id: uuidV7(),
                        resultId,
                        metricType: 'CONFIRMED_MATCH',
                        confirmationPath: 'PLAYER',
                        confirmedAt: now,
                    },
                },
            },
        });

        await Promise.all([
            projection.consume(uuidV7(), 'profile.statistics.source.changed.v1', matchId, 5n),
            projection.consume(uuidV7(), 'profile.statistics.source.changed.v1', matchId, 2n),
        ]);
        await projection.consume(uuidV7(), 'profile.statistics.source.changed.v1', matchId, 5n);

        const active = await prisma.profileProjectionGeneration.findFirstOrThrow({ where: { state: 'ACTIVE' } });
        const contributions = await prisma.playerStatisticContribution.findMany({
            where: { generationId: active.id, matchId },
        });
        expect(contributions).toHaveLength(3);
        await expect(profiles.ownStatistics(organizerId)).resolves.toMatchObject({
            totals: [
                {
                    slice: 'ALL',
                    played: '1',
                    wins: '1',
                    losses: '0',
                    gamesPlayed: '2',
                    pointsFor: '22',
                    pointsAgainst: '16',
                },
            ],
        });
    });

    it('uses the same unavailable response for privacy and both block directions', async () => {
        const subjectId = await player('Закрытый игрок');
        const viewerId = await player('Посетитель');
        await prisma.playerProfile.update({
            where: { userId: subjectId },
            data: { version: 2, visibility: 'PRIVATE' },
        });
        await expect(profiles.publicProfile(subjectId, viewerId)).rejects.toMatchObject({
            code: 'PROFILE_NOT_AVAILABLE',
        });
        await prisma.playerProfile.update({ where: { userId: subjectId }, data: { version: 3, visibility: 'PUBLIC' } });
        await prisma.communicationBlock.create({ data: { blockerId: subjectId, blockedUserId: viewerId } });
        await expect(profiles.publicProfile(subjectId, viewerId)).rejects.toMatchObject({
            code: 'PROFILE_NOT_AVAILABLE',
        });
        await expect(profiles.publicProfile(subjectId)).resolves.toMatchObject({ playerId: subjectId });
    });
});
