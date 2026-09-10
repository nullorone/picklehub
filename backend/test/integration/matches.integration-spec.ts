import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MatchFormat, MatchJoinMode, MatchState, MatchTeamCode, Prisma, VenueVerificationState } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { Clock } from '../../src/identity/clock';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import {
    MatchResultModeDto,
    MatchSeriesFormatDto,
    MatchTeamChoiceDto,
    MatchTeamDto,
} from '../../src/matches/match.dto';
import { MatchService } from '../../src/matches/match.service';
import { MatchIdempotencyService } from '../../src/matches/match-idempotency.service';
import { MatchStatisticsWorkerService } from '../../src/matches/match-statistics-worker.service';
import { FakeClock } from '../fakes/fake-clock';

interface MatchFixture {
    readonly matchId: string;
    readonly organizerId: string;
}

describe('matches concurrent workflows', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const clock = new FakeClock(now);
    let application: INestApplication;
    let prisma: PrismaService;
    let matches: MatchService;
    let idempotency: MatchIdempotencyService;
    let crypto: IdentityCryptoService;
    let statistics: MatchStatisticsWorkerService;
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
        matches = application.get(MatchService);
        idempotency = application.get(MatchIdempotencyService);
        crypto = application.get(IdentityCryptoService);
        statistics = application.get(MatchStatisticsWorkerService);
        venueId = uuidV7();
        await prisma.venue.create({
            data: {
                id: venueId,
                name: 'Матчевый integration-корт',
                normalizedAddress: 'Москва, Проверочная улица, 1',
                locality: 'Москва',
                timeZone: 'Europe/Moscow',
                longitude: 37.6173,
                latitude: 55.7558,
                verificationState: VenueVerificationState.MODERATOR_VERIFIED,
                lastVerifiedAt: now,
            },
        });
    });

    afterAll(async () => {
        await application.close();
    });

    async function player(): Promise<string> {
        const id = uuidV7();
        await prisma.user.create({
            data: {
                id,
                completedAt: now,
                draft: {
                    create: {
                        displayName: `Игрок ${id.slice(-6)}`,
                        timeZone: 'Europe/Moscow',
                        gameFormats: ['SINGLES', 'DOUBLES'],
                        skillSelfAssessment: 3,
                        completedAt: now,
                        updatedAt: now,
                    },
                },
            },
        });
        return id;
    }

    async function fixture(
        joinMode: MatchJoinMode,
        state: MatchState = MatchState.PUBLISHED,
        format: MatchFormat = MatchFormat.SINGLES,
        visibility: 'PUBLIC' | 'UNLISTED' = 'PUBLIC'
    ): Promise<MatchFixture> {
        const organizerId = await player();
        const matchId = uuidV7();
        const capacity = format === MatchFormat.SINGLES ? 1 : 2;
        await prisma.match.create({
            data: {
                id: matchId,
                organizerId,
                version: 1,
                state,
                format,
                visibility,
                joinMode,
                startsAt: new Date(now.getTime() + 600_000),
                timeZone: 'Europe/Moscow',
                venueId,
                skillMin: 1,
                skillMax: 5,
                description: 'Конкурентный integration-сценарий',
                policyVersion: 'matches-v1',
                publishedAt: now,
                updatedAt: now,
                teams: {
                    create: [
                        { code: MatchTeamCode.TEAM_A, capacity },
                        { code: MatchTeamCode.TEAM_B, capacity },
                    ],
                },
                participants: {
                    create: {
                        id: uuidV7(),
                        userId: organizerId,
                        team: MatchTeamCode.TEAM_A,
                        isOrganizer: true,
                        joinedAt: now,
                    },
                },
            },
        });
        return { matchId, organizerId };
    }

    function transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    it('serializes AUTO joins and promotes exactly the FIFO head after a player leaves', async () => {
        const { matchId } = await fixture(MatchJoinMode.AUTO);
        const contenders = await Promise.all([player(), player()]);
        const claims = await Promise.allSettled(
            contenders.map((userId) =>
                transaction((tx) =>
                    matches.join(userId, matchId, { expectedVersion: 1, teamChoice: MatchTeamChoiceDto.TEAM_B }, tx)
                )
            )
        );
        expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(1);
        await expect(
            prisma.matchParticipant.count({ where: { matchId, team: MatchTeamCode.TEAM_B, state: 'ACTIVE' } })
        ).resolves.toBe(1);

        const active = await prisma.matchParticipant.findFirstOrThrow({
            where: { matchId, team: MatchTeamCode.TEAM_B, state: 'ACTIVE' },
        });
        const waitingPlayer = contenders.find((id) => id !== active.userId);
        if (waitingPlayer === undefined) throw new Error('Expected the losing contender');
        const version = (await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).version;
        await transaction((tx) =>
            matches.join(
                waitingPlayer,
                matchId,
                { expectedVersion: version, teamChoice: MatchTeamChoiceDto.TEAM_B },
                tx
            )
        );
        const beforeLeave = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
        await transaction((tx) => matches.leave(active.userId, matchId, active.id, beforeLeave.version, tx));

        await expect(
            prisma.waitlistEntry.findFirstOrThrow({ where: { matchId, playerId: waitingPlayer } })
        ).resolves.toMatchObject({ state: 'PROMOTED', sequence: 1n });
        await expect(
            prisma.matchParticipant.count({ where: { matchId, team: MatchTeamCode.TEAM_B, state: 'ACTIVE' } })
        ).resolves.toBe(1);
    });

    it('serializes APPROVAL decisions and preserves offer-before-promotion semantics', async () => {
        const { matchId, organizerId } = await fixture(MatchJoinMode.APPROVAL);
        const applicants = await Promise.all([player(), player()]);
        for (const applicant of applicants) {
            const version = (await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).version;
            await transaction((tx) =>
                matches.join(
                    applicant,
                    matchId,
                    { expectedVersion: version, teamChoice: MatchTeamChoiceDto.TEAM_B },
                    tx
                )
            );
        }
        const requests = await prisma.joinRequest.findMany({ where: { matchId }, orderBy: { createdAt: 'asc' } });
        const firstRequest = requests[0];
        const secondRequest = requests[1];
        if (firstRequest === undefined || secondRequest === undefined) throw new Error('Expected two requests');

        let version = (await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).version;
        const decisions = await Promise.allSettled([
            transaction((tx) => matches.decideRequest(organizerId, matchId, firstRequest.id, version, 'APPROVED', tx)),
            transaction((tx) => matches.decideRequest(organizerId, matchId, secondRequest.id, version, 'APPROVED', tx)),
        ]);
        expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1);
        const pendingRequest = await prisma.joinRequest.findFirstOrThrow({ where: { matchId, state: 'PENDING' } });
        const approvedRequest = await prisma.joinRequest.findFirstOrThrow({ where: { matchId, state: 'APPROVED' } });
        version = (await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).version;
        await transaction((tx) =>
            matches.decideRequest(organizerId, matchId, pendingRequest.id, version, 'APPROVED', tx)
        );
        const participant = await prisma.matchParticipant.findFirstOrThrow({
            where: { matchId, userId: approvedRequest.requesterId, state: 'ACTIVE' },
        });
        const beforeLeave = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
        await transaction((tx) => matches.leave(participant.userId, matchId, participant.id, beforeLeave.version, tx));

        const offered = await prisma.waitlistEntry.findFirstOrThrow({
            where: { matchId, playerId: pendingRequest.requesterId },
        });
        expect(offered).toMatchObject({ state: 'OFFERED', offeredTeam: MatchTeamCode.TEAM_B, sequence: 1n });
        version = (await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).version;
        await transaction((tx) => matches.promoteWaitlist(organizerId, matchId, offered.id, version, tx));
        await expect(
            prisma.matchParticipant.count({ where: { matchId, team: MatchTeamCode.TEAM_B, state: 'ACTIVE' } })
        ).resolves.toBe(1);
    });

    it('allows only one concurrent start/cancel transition', async () => {
        const { matchId, organizerId } = await fixture(MatchJoinMode.AUTO);
        const opponent = await player();
        await prisma.matchParticipant.create({
            data: { id: uuidV7(), matchId, userId: opponent, team: MatchTeamCode.TEAM_B, joinedAt: now },
        });

        const outcomes = await Promise.allSettled([
            transaction((tx) => matches.start(organizerId, matchId, 1, tx)),
            transaction((tx) => matches.cancel(organizerId, matchId, 1, tx)),
        ]);
        expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
        const stored = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
        expect([MatchState.IN_PROGRESS, MatchState.CANCELLED]).toContain(stored.state);
        await expect(
            prisma.outboxEvent.count({
                where: {
                    type: { in: ['match.started.v1', 'match.cancelled.v1'] },
                    payload: { path: ['data', 'matchId'], equals: matchId },
                },
            })
        ).resolves.toBe(1);
    });

    it('replays a mutation once and keeps UNLISTED matches outside public reads and discovery', async () => {
        const { matchId, organizerId } = await fixture(
            MatchJoinMode.AUTO,
            MatchState.PUBLISHED,
            MatchFormat.SINGLES,
            'UNLISTED'
        );
        const strangerId = await player();
        const token = crypto.secret();
        await prisma.matchInvite.create({
            data: {
                id: uuidV7(),
                matchId,
                version: 1,
                tokenHash: crypto.hash(`MATCH_INVITE:${token}`),
                keyVersion: 1,
                createdAt: now,
                expiresAt: new Date(now.getTime() + 86_400_000),
            },
        });
        await expect(matches.detail(matchId)).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' });
        await expect(matches.inviteDetail('b'.repeat(43))).rejects.toMatchObject({ code: 'INVITE_INVALID' });
        await expect(matches.inviteDetail(token)).resolves.toMatchObject({ id: matchId, visibility: 'UNLISTED' });
        const search = (await matches.search({ limit: 100 })) as { items: { id: string }[] };
        expect(search.items).not.toContainEqual(expect.objectContaining({ id: matchId }));
        await expect(transaction((tx) => matches.cancel(strangerId, matchId, 1, tx))).rejects.toMatchObject({
            code: 'REQUEST_NOT_ALLOWED',
        });

        const key = 'a4d00a1a-550d-4b68-a86c-5217bb2e289f';
        const execute = () =>
            idempotency.execute(
                organizerId,
                key,
                'POST',
                `/v1/matches/${matchId}/cancel`,
                { expectedVersion: 1 },
                (tx) => matches.cancel(organizerId, matchId, 1, tx),
                matchId
            );
        await expect(execute()).resolves.toMatchObject({ replayed: false });
        await expect(execute()).resolves.toMatchObject({ replayed: true });
        await expect(
            prisma.outboxEvent.count({
                where: { type: 'match.cancelled.v1', payload: { path: ['data', 'matchId'], equals: matchId } },
            })
        ).resolves.toBe(1);
        const record = await prisma.matchIdempotencyRecord.findFirstOrThrow({ where: { matchId } });
        expect(Buffer.from(record.responseCiphertext).toString('utf8')).not.toContain(matchId);
    });

    it('confirms the result, emits the main metric once and applies statistics once on redelivery', async () => {
        const { matchId, organizerId } = await fixture(MatchJoinMode.AUTO, MatchState.IN_PROGRESS, MatchFormat.DOUBLES);
        const opponentId = await player();
        await prisma.matchParticipant.create({
            data: { id: uuidV7(), matchId, userId: opponentId, team: MatchTeamCode.TEAM_B, joinedAt: now },
        });
        await prisma.matchGuestSlot.create({
            data: {
                id: uuidV7(),
                matchId,
                team: MatchTeamCode.TEAM_A,
                label: 'Гость',
                createdBy: organizerId,
                createdAt: now,
            },
        });
        const proposed = (await transaction((tx) =>
            matches.proposeResult(
                organizerId,
                matchId,
                {
                    expectedVersion: 1,
                    mode: MatchResultModeDto.SCORED,
                    seriesFormat: MatchSeriesFormatDto.BEST_OF_1,
                    winningTeam: MatchTeamDto.TEAM_A,
                    games: [{ gameNumber: 1, teamAPoints: 11, teamBPoints: 7 }],
                },
                tx
            )
        )) as { id: string; version: number };
        await transaction((tx) =>
            matches.resolveResult(
                opponentId,
                matchId,
                proposed.id,
                { expectedVersion: 2, resultVersion: proposed.version },
                'CONFIRMED',
                tx
            )
        );
        await expect(
            transaction((tx) =>
                matches.resolveResult(
                    opponentId,
                    matchId,
                    proposed.id,
                    { expectedVersion: 2, resultVersion: proposed.version },
                    'CONFIRMED',
                    tx
                )
            )
        ).rejects.toMatchObject({ code: 'MATCH_VERSION_CONFLICT' });

        const completion = await prisma.outboxEvent.findFirstOrThrow({
            where: { type: 'match.completed.confirmed.v1', payload: { path: ['data', 'matchId'], equals: matchId } },
        });
        await statistics.process({
            eventId: completion.id,
            type: completion.type,
            schemaVersion: completion.schemaVersion,
        });
        await statistics.process({
            eventId: completion.id,
            type: completion.type,
            schemaVersion: completion.schemaVersion,
        });

        await expect(prisma.matchMetricMarker.count({ where: { matchId } })).resolves.toBe(1);
        await expect(
            prisma.outboxEvent.count({
                where: {
                    type: 'match.completed.confirmed.v1',
                    payload: { path: ['data', 'matchId'], equals: matchId },
                },
            })
        ).resolves.toBe(1);
        await expect(prisma.matchStatisticsReceipt.count({ where: { eventId: completion.id } })).resolves.toBe(1);
        await expect(
            prisma.playerMatchStatistic.count({ where: { userId: { in: [organizerId, opponentId] } } })
        ).resolves.toBe(2);
        await expect(
            prisma.playerMatchStatistic.aggregate({
                _sum: { playedCount: true },
                where: { userId: { in: [organizerId, opponentId] } },
            })
        ).resolves.toMatchObject({
            _sum: { playedCount: 2 },
        });
    });

    it('serializes confirmation against dispute without producing a mismatched metric', async () => {
        const { matchId, organizerId } = await fixture(MatchJoinMode.AUTO, MatchState.IN_PROGRESS);
        const opponentId = await player();
        await prisma.matchParticipant.create({
            data: { id: uuidV7(), matchId, userId: opponentId, team: MatchTeamCode.TEAM_B, joinedAt: now },
        });
        const proposals = await Promise.allSettled([
            transaction((tx) =>
                matches.proposeResult(
                    organizerId,
                    matchId,
                    { expectedVersion: 1, mode: MatchResultModeDto.PLAYED_WITHOUT_SCORE },
                    tx
                )
            ),
            transaction((tx) =>
                matches.proposeResult(
                    organizerId,
                    matchId,
                    { expectedVersion: 1, mode: MatchResultModeDto.PLAYED_WITHOUT_SCORE },
                    tx
                )
            ),
        ]);
        expect(proposals.filter((proposal) => proposal.status === 'fulfilled')).toHaveLength(1);
        const proposed = proposals.find((proposal) => proposal.status === 'fulfilled')?.value as
            | { id: string; version: number }
            | undefined;
        if (proposed === undefined) throw new Error('Expected one proposed result');
        const body = { expectedVersion: 2, resultVersion: proposed.version };
        const resolutions = await Promise.allSettled([
            transaction((tx) => matches.resolveResult(opponentId, matchId, proposed.id, body, 'CONFIRMED', tx)),
            transaction((tx) => matches.resolveResult(opponentId, matchId, proposed.id, body, 'DISPUTED', tx)),
        ]);
        expect(resolutions.filter((resolution) => resolution.status === 'fulfilled')).toHaveLength(1);
        const stored = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
        const markers = await prisma.matchMetricMarker.count({ where: { matchId } });
        expect(markers).toBe(stored.state === MatchState.COMPLETED ? 1 : 0);
        await expect(prisma.resultConfirmation.count({ where: { resultId: proposed.id } })).resolves.toBe(1);
    });
});
