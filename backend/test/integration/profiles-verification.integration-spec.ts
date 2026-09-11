import { createHash } from 'node:crypto';

import { type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
    MatchFormat,
    MatchParticipantState,
    MatchResultMode,
    MatchResultState,
    MatchState,
    MatchTeamCode,
} from '@prisma/client';

import { AuditModule } from '../../src/audit/audit.module';
import { TypedConfigModule } from '../../src/common/config/config.module';
import { DatabaseModule } from '../../src/common/database/database.module';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { RequestContextModule } from '../../src/common/request-context/request-context.module';
import { Clock } from '../../src/identity/clock';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import { OutboxService } from '../../src/outbox/outbox.service';
import { type AvatarUploadPolicyInput, ProfileAvatarStorage } from '../../src/profiles/profile-avatar-storage';
import { ProfileCursorService } from '../../src/profiles/profile-cursor.service';
import { ProfileProjectionService } from '../../src/profiles/profile-projection.service';
import { ProfileService } from '../../src/profiles/profile.service';
import { FakeClock } from '../fakes/fake-clock';

const EMPTY_CHECKSUM = createHash('sha256').update('').digest('hex');

class CapturingAvatarStorage extends ProfileAvatarStorage {
    readonly uploads: AvatarUploadPolicyInput[] = [];

    createUploadPolicy(input: AvatarUploadPolicyInput): Promise<{ uploadUrl: string }> {
        this.uploads.push(input);
        return Promise.resolve({ uploadUrl: `https://media.example.test/${input.objectKey}` });
    }

    createReadUrl(objectKey: string): Promise<string> {
        return Promise.resolve(`https://media.example.test/${objectKey}`);
    }
}

describe('profiles verification', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    const clock = new FakeClock(now);
    let application: INestApplicationContext | undefined;
    let prisma: PrismaService;
    let projection: ProfileProjectionService;
    let profiles: ProfileService;
    let storage: CapturingAvatarStorage;
    let localityId: string;

    beforeAll(async () => {
        storage = new CapturingAvatarStorage();
        const module = await Test.createTestingModule({
            imports: [TypedConfigModule, DatabaseModule, RequestContextModule, AuditModule],
            providers: [
                ProfileService,
                ProfileProjectionService,
                ProfileCursorService,
                IdentityCryptoService,
                OutboxService,
                { provide: Clock, useValue: clock },
                { provide: ProfileAvatarStorage, useValue: storage },
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
        await prisma.user.create({ data: { id, completedAt: now } });
        await prisma.playerProfile.create({
            data: {
                userId: id,
                version: 1,
                displayName: name,
                timeZone: 'Europe/Moscow',
                localityId,
                gameFormats: ['SINGLES', 'DOUBLES'],
                skillSelfAssessment: 3,
                updatedAt: now,
            },
        });
        const documents = await prisma.consentDocument.findMany({ where: { isCurrent: true } });
        for (const document of documents) {
            await prisma.consent.create({
                data: {
                    id: uuidV7(),
                    userId: id,
                    purpose: document.purpose,
                    version: document.version,
                    action: 'ACCEPTED',
                    platform: 'WEB',
                    operationId: uuidV7(),
                    occurredAt: now,
                },
            });
        }
        return id;
    }

    async function match(
        organizerId: string,
        opponentId: string,
        options: {
            readonly mode?: MatchResultMode;
            readonly participantState?: MatchParticipantState;
            readonly resultState?: MatchResultState;
            readonly state: MatchState;
            readonly withGuest?: boolean;
            readonly withMarker?: boolean;
        }
    ): Promise<string> {
        const matchId = uuidV7();
        const resultState = options.resultState;
        const resultId = resultState === undefined ? undefined : uuidV7();
        await prisma.match.create({
            data: {
                id: matchId,
                organizerId,
                version: 1,
                state: options.state,
                format: MatchFormat.SINGLES,
                visibility: 'PUBLIC',
                joinMode: 'AUTO',
                startsAt: new Date(now.getTime() - 3_600_000),
                timeZone: 'Europe/Moscow',
                skillMin: 1,
                skillMax: 5,
                policyVersion: 'matches-v1',
                updatedAt: now,
                teams: {
                    create: [
                        { code: MatchTeamCode.TEAM_A, capacity: 1 },
                        { code: MatchTeamCode.TEAM_B, capacity: options.withGuest ? 2 : 1 },
                    ],
                },
                participants: {
                    create: [
                        {
                            id: uuidV7(),
                            userId: organizerId,
                            team: MatchTeamCode.TEAM_A,
                            state: options.participantState ?? MatchParticipantState.PLAYED,
                            isOrganizer: true,
                        },
                        {
                            id: uuidV7(),
                            userId: opponentId,
                            team: MatchTeamCode.TEAM_B,
                            state: options.participantState ?? MatchParticipantState.PLAYED,
                        },
                    ],
                },
                ...(options.withGuest
                    ? {
                          guests: {
                              create: {
                                  id: uuidV7(),
                                  team: MatchTeamCode.TEAM_B,
                                  label: 'Гость',
                                  createdBy: opponentId,
                              },
                          },
                      }
                    : {}),
                ...(resultState === undefined || resultId === undefined
                    ? {}
                    : {
                          results: {
                              create: {
                                  id: resultId,
                                  version: 1,
                                  state: resultState,
                                  mode: options.mode ?? MatchResultMode.SCORED,
                                  seriesFormat:
                                      options.mode === MatchResultMode.PLAYED_WITHOUT_SCORE ? null : 'BEST_OF_1',
                                  winningTeam:
                                      options.mode === MatchResultMode.PLAYED_WITHOUT_SCORE
                                          ? null
                                          : MatchTeamCode.TEAM_A,
                                  proposedBy: organizerId,
                                  resolvedAt: resultState === MatchResultState.PROPOSED ? null : now,
                                  ...(options.mode === MatchResultMode.PLAYED_WITHOUT_SCORE
                                      ? {}
                                      : { games: { create: { gameNumber: 1, teamAPoints: 11, teamBPoints: 8 } } }),
                              },
                          },
                      }),
                ...(resultId !== undefined && options.withMarker
                    ? {
                          metricMarkers: {
                              create: {
                                  id: uuidV7(),
                                  resultId,
                                  metricType: 'CONFIRMED_MATCH',
                                  confirmationPath: 'PLAYER',
                                  confirmedAt: now,
                              },
                          },
                      }
                    : {}),
            },
        });
        return matchId;
    }

    function allTotals(value: object): Record<string, unknown> {
        const statistics = value as { totals: Record<string, unknown>[] };
        return statistics.totals.find((item) => item.slice === 'ALL') ?? {};
    }

    it('includes only eligible confirmed outcomes and retracts a cancelled result', async () => {
        const playerId = await player('Игрок матрицы');
        const opponentId = await player('Соперник матрицы');
        const scoredId = await match(playerId, opponentId, {
            state: MatchState.COMPLETED,
            resultState: MatchResultState.CONFIRMED,
            mode: MatchResultMode.SCORED,
            withMarker: true,
            withGuest: true,
        });
        const playedId = await match(playerId, opponentId, {
            state: MatchState.COMPLETED,
            resultState: MatchResultState.CONFIRMED,
            mode: MatchResultMode.PLAYED_WITHOUT_SCORE,
            withMarker: true,
        });
        const excludedIds = await Promise.all([
            match(playerId, opponentId, {
                state: MatchState.AWAITING_CONFIRMATION,
                resultState: MatchResultState.PROPOSED,
            }),
            match(playerId, opponentId, {
                state: MatchState.DISPUTED,
                resultState: MatchResultState.DISPUTED,
            }),
            match(playerId, opponentId, { state: MatchState.CANCELLED }),
            match(playerId, opponentId, {
                state: MatchState.CANCELLED,
                participantState: MatchParticipantState.CANCELLED,
            }),
        ]);

        for (const matchId of [scoredId, playedId, ...excludedIds]) {
            await projection.consume(uuidV7(), 'profile.statistics.source.changed.v1', matchId, 1n);
        }
        await projection.consume(uuidV7(), 'profile.statistics.source.changed.v1', scoredId, 1n);

        expect(allTotals(await profiles.ownStatistics(playerId))).toMatchObject({
            played: '2',
            wins: '1',
            losses: '0',
            gamesPlayed: '1',
            pointsFor: '11',
            pointsAgainst: '8',
        });

        await prisma.$transaction([
            prisma.match.update({ where: { id: scoredId }, data: { state: 'VOIDED', version: 2, updatedAt: now } }),
            prisma.matchResult.updateMany({ where: { matchId: scoredId }, data: { state: 'VOIDED' } }),
        ]);
        await projection.consume(uuidV7(), 'profile.statistics.source.changed.v1', scoredId, 2n);

        expect(allTotals(await profiles.ownStatistics(playerId))).toMatchObject({
            played: '1',
            wins: '0',
            losses: '0',
            gamesPlayed: '0',
            pointsFor: '0',
            pointsAgainst: '0',
        });
        const active = await prisma.profileProjectionGeneration.findFirstOrThrow({ where: { state: 'ACTIVE' } });
        await expect(
            prisma.playerStatisticContribution.count({ where: { generationId: active.id, matchId: scoredId } })
        ).resolves.toBe(2);
        await expect(
            prisma.playerStatisticContribution.count({
                where: { generationId: active.id, matchId: scoredId, outcome: 'EXCLUDED' },
            })
        ).resolves.toBe(2);
    });

    it('makes rebuild and checkpoint resume equal to the incremental player state', async () => {
        const playerId = await player('Игрок перестроения');
        const opponentId = await player('Соперник перестроения');
        const ids = [
            await match(playerId, opponentId, {
                state: MatchState.COMPLETED,
                resultState: MatchResultState.CONFIRMED,
                mode: MatchResultMode.SCORED,
                withMarker: true,
            }),
            await match(playerId, opponentId, {
                state: MatchState.COMPLETED,
                resultState: MatchResultState.CONFIRMED,
                mode: MatchResultMode.PLAYED_WITHOUT_SCORE,
                withMarker: true,
            }),
        ];
        for (const matchId of ids) {
            await projection.consume(uuidV7(), 'profile.statistics.source.changed.v1', matchId, 1n);
        }
        const incremental = allTotals(await profiles.ownStatistics(playerId));

        await projection.rebuild('RECONCILIATION');
        expect(allTotals(await profiles.ownStatistics(playerId))).toEqual(incremental);

        const sentinelId = '00000000-0000-4000-8000-000000000001';
        await prisma.match.upsert({
            where: { id: sentinelId },
            create: { id: sentinelId, organizerId: playerId, state: 'DRAFT', version: 0, updatedAt: now },
            update: {},
        });
        const resumedId = uuidV7();
        await prisma.profileProjectionGeneration.create({
            data: {
                id: resumedId,
                snapshotCutoff: now,
                snapshotRevision: 1n,
                checkpointMatchId: sentinelId,
                contributionChecksum: EMPTY_CHECKSUM,
            },
        });
        await expect(projection.rebuild('RECONCILIATION')).resolves.toBe(resumedId);
        expect(allTotals(await profiles.ownStatistics(playerId))).toEqual(incremental);
        await expect(
            prisma.profileProjectionGeneration.findUniqueOrThrow({ where: { id: resumedId } })
        ).resolves.toMatchObject({ state: 'ACTIVE' });
    });

    it('allows one concurrent profile version and binds avatar upload to its authenticated owner', async () => {
        const playerId = await player('Конкурентный игрок');
        const updates = await Promise.allSettled([
            prisma.$transaction((transaction) =>
                profiles.update(playerId, { expectedVersion: 1, displayName: 'Первое имя' }, transaction)
            ),
            prisma.$transaction((transaction) =>
                profiles.update(playerId, { expectedVersion: 1, displayName: 'Второе имя' }, transaction)
            ),
        ]);
        expect(updates.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(updates.filter((result) => result.status === 'rejected')).toHaveLength(1);

        const upload = (await prisma.$transaction((transaction) =>
            profiles.createAvatarUpload(
                playerId,
                { expectedVersion: 2, contentType: 'image/png', contentLength: 128, sha256: 'a'.repeat(64) },
                transaction
            )
        )) as { objectKey: string; uploadUrl: string };
        expect(upload.objectKey).toMatch(new RegExp(`^profiles/${playerId}/avatars/[0-9a-f-]+/original$`, 'u'));
        expect(upload.uploadUrl).toContain(upload.objectKey);
        expect(storage.uploads.at(-1)).toMatchObject({ objectKey: upload.objectKey, contentLength: 128 });
        await expect(
            prisma.$transaction((transaction) =>
                profiles.createAvatarUpload(
                    playerId,
                    { expectedVersion: 1, contentType: 'image/png', contentLength: 128, sha256: 'b'.repeat(64) },
                    transaction
                )
            )
        ).rejects.toMatchObject({ code: 'PROFILE_VERSION_CONFLICT' });
    });

    it('keeps owner and public runtime DTOs separated across privacy and blocks', async () => {
        const playerId = await player('Публичный игрок');
        const viewerId = await player('Посетитель профиля');
        const own = (await profiles.own(playerId)) as Record<string, unknown>;
        const publicView = (await profiles.publicProfile(playerId, viewerId)) as Record<string, unknown>;
        expect(Object.keys(own).sort()).toEqual([
            'avatar',
            'displayName',
            'externalProfileLink',
            'gameFormats',
            'locality',
            'playerId',
            'skillSelfAssessment',
            'statistics',
            'timeZone',
            'updatedAt',
            'version',
            'visibility',
        ]);
        expect(Object.keys(publicView).sort()).toEqual([
            'avatarUrl',
            'displayName',
            'externalProfileLink',
            'gameFormats',
            'locality',
            'playerId',
            'skillSelfAssessment',
            'statistics',
            'updatedAt',
        ]);

        await prisma.communicationBlock.create({ data: { blockerId: viewerId, blockedUserId: playerId } });
        await expect(profiles.publicProfile(playerId, viewerId)).rejects.toMatchObject({
            code: 'PROFILE_NOT_AVAILABLE',
        });
        await prisma.communicationBlock.delete({
            where: { blockerId_blockedUserId: { blockerId: viewerId, blockedUserId: playerId } },
        });
        await prisma.playerProfile.update({ where: { userId: playerId }, data: { visibility: 'PRIVATE' } });
        await expect(profiles.publicProfile(playerId, viewerId)).rejects.toMatchObject({
            code: 'PROFILE_NOT_AVAILABLE',
        });
    });
});
