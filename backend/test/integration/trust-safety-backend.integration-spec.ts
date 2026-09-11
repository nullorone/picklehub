import { type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MatchJoinMode, MatchState, MatchTeamCode, ModerationDecisionOutcome } from '@prisma/client';

import { AuditModule } from '../../src/audit/audit.module';
import { TypedConfigModule } from '../../src/common/config/config.module';
import { DatabaseModule } from '../../src/common/database/database.module';
import { InteractionPolicyService } from '../../src/common/database/interaction-policy.service';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { RequestContextModule } from '../../src/common/request-context/request-context.module';
import { CommunicationCryptoService } from '../../src/communications/communication-crypto.service';
import { CommunicationCursorService } from '../../src/communications/communication-cursor.service';
import { CommunicationMetricsService } from '../../src/communications/communication-metrics.service';
import { CommunicationService } from '../../src/communications/communication.service';
import { Clock } from '../../src/identity/clock';
import { CursorService } from '../../src/identity/cursor.service';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import { MatchTeamChoiceDto } from '../../src/matches/match.dto';
import { MatchPolicyService } from '../../src/matches/match.policy';
import { MatchService } from '../../src/matches/match.service';
import { OutboxService } from '../../src/outbox/outbox.service';
import { ModerationService } from '../../src/trust-safety/moderation.service';
import { TrustSafetyCryptoService } from '../../src/trust-safety/trust-safety-crypto.service';
import { TrustSafetyCursorService } from '../../src/trust-safety/trust-safety-cursor.service';
import { NoShowReasonDto, ReviewTagDto } from '../../src/trust-safety/trust-safety.dto';
import { TrustSafetyIdempotencyService } from '../../src/trust-safety/trust-safety-idempotency.service';
import { TrustSafetyMetricsService } from '../../src/trust-safety/trust-safety-metrics.service';
import { TrustSafetyService } from '../../src/trust-safety/trust-safety.service';
import { FakeClock } from '../fakes/fake-clock';

describe('trust/safety privacy and concurrent workflows', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    const clock = new FakeClock(now);
    let application: INestApplicationContext;
    let prisma: PrismaService;
    let safety: TrustSafetyService;
    let moderation: ModerationService;
    let idempotency: TrustSafetyIdempotencyService;
    let communications: CommunicationService;
    let matches: MatchService;
    let interactionPolicy: InteractionPolicyService;
    let localityId: string;

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [TypedConfigModule, DatabaseModule, RequestContextModule, AuditModule],
            providers: [
                { provide: Clock, useValue: clock },
                IdentityCryptoService,
                CursorService,
                OutboxService,
                TrustSafetyCryptoService,
                TrustSafetyCursorService,
                TrustSafetyIdempotencyService,
                TrustSafetyMetricsService,
                TrustSafetyService,
                ModerationService,
                CommunicationCryptoService,
                CommunicationCursorService,
                CommunicationMetricsService,
                CommunicationService,
                MatchPolicyService,
                MatchService,
                InteractionPolicyService,
            ],
        }).compile();
        application = module;
        await application.init();
        prisma = application.get(PrismaService);
        safety = application.get(TrustSafetyService);
        moderation = application.get(ModerationService);
        idempotency = application.get(TrustSafetyIdempotencyService);
        communications = application.get(CommunicationService);
        matches = application.get(MatchService);
        interactionPolicy = application.get(InteractionPolicyService);
        localityId = uuidV7();
        await prisma.onboardingLocality.create({
            data: {
                id: localityId,
                name: `Safety ${localityId.slice(-6)}`,
                countryCode: 'RU',
                region: 'Москва',
                catalogueVersion: 1,
            },
        });
    });

    afterAll(async () => application.close());

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
                        localityId,
                        gameFormats: ['SINGLES'],
                        skillSelfAssessment: 3,
                        completedAt: now,
                    },
                },
            },
        });
        await prisma.playerProfile.create({
            data: {
                userId: id,
                version: 1,
                displayName: `Игрок ${id.slice(-6)}`,
                timeZone: 'Europe/Moscow',
                localityId,
                gameFormats: ['SINGLES'],
                skillSelfAssessment: 3,
            },
        });
        return id;
    }

    async function match(organizerId: string, opponentId: string, state: MatchState, startsAt: Date): Promise<string> {
        const id = uuidV7();
        await prisma.match.create({
            data: {
                id,
                organizerId,
                version: 3,
                state,
                format: 'SINGLES',
                visibility: 'PUBLIC',
                joinMode: MatchJoinMode.AUTO,
                startsAt,
                timeZone: 'Europe/Moscow',
                skillMin: 1,
                skillMax: 5,
                policyVersion: 'matches-v1',
                publishedAt: new Date(startsAt.getTime() - 86_400_000),
                teams: {
                    create: [
                        { code: 'TEAM_A', capacity: 1 },
                        { code: 'TEAM_B', capacity: 1 },
                    ],
                },
                participants: {
                    create: [
                        {
                            id: uuidV7(),
                            userId: organizerId,
                            team: MatchTeamCode.TEAM_A,
                            isOrganizer: true,
                            state: state === 'COMPLETED' ? 'PLAYED' : 'ACTIVE',
                        },
                        {
                            id: uuidV7(),
                            userId: opponentId,
                            team: MatchTeamCode.TEAM_B,
                            state: state === 'COMPLETED' ? 'PLAYED' : 'ACTIVE',
                        },
                    ],
                },
            },
        });
        if (state === MatchState.COMPLETED) {
            const resultId = uuidV7();
            await prisma.matchResult.create({
                data: {
                    id: resultId,
                    matchId: id,
                    version: 1,
                    state: 'CONFIRMED',
                    mode: 'PLAYED_WITHOUT_SCORE',
                    proposedBy: organizerId,
                    resolvedAt: now,
                },
            });
            await prisma.matchMetricMarker.create({
                data: {
                    id: uuidV7(),
                    matchId: id,
                    resultId,
                    metricType: 'CONFIRMED_MATCH',
                    confirmationPath: 'PLAYER',
                    confirmedAt: new Date(now.getTime() - 3_600_000),
                },
            });
        }
        return id;
    }

    it('keeps review text encrypted and exposes only the thresholded aggregate', async () => {
        const [authorId, subjectId] = await Promise.all([player(), player()]);
        const matchId = await match(authorId, subjectId, MatchState.COMPLETED, new Date(now.getTime() - 7_200_000));
        const canary = 'private-review-canary@example.test';
        await prisma.$transaction((tx) =>
            safety.submitReview(
                authorId,
                matchId,
                subjectId,
                { experienceRating: 4, tags: [ReviewTagDto.RESPECT], text: canary },
                tx
            )
        );

        const revision = await prisma.reviewRevision.findFirstOrThrow({
            where: { review: { authorId, subjectId, matchId } },
        });
        expect(Buffer.from(revision.textCiphertext ?? []).toString('utf8')).not.toContain(canary);
        await expect(safety.publicReputation(subjectId)).resolves.toMatchObject({
            available: false,
            averageRating: null,
            reviewCount: null,
        });
    });

    it('replays a concurrent no-show submission without duplicating signal or case effect', async () => {
        const [reporterId, subjectId] = await Promise.all([player(), player()]);
        const matchId = await match(reporterId, subjectId, MatchState.PUBLISHED, new Date(now.getTime() - 3_600_000));
        const key = 'dcd2cb45-9f28-4aa0-8f9a-11e64111cb21';
        const body = {
            subjectPlayerId: subjectId,
            reason: NoShowReasonDto.DID_NOT_ARRIVE,
            evidence: 'evidence-canary@example.test',
        };
        const submit = () =>
            idempotency.execute(reporterId, key, 'POST', `/v1/matches/${matchId}/no-show-reports`, body, 201, (tx) =>
                safety.submitNoShow(reporterId, matchId, body, tx)
            );
        const responses = await Promise.all([submit(), submit()]);
        expect(new Set(responses.map((response) => JSON.stringify(response.value))).size).toBe(1);
        const replayWithAnotherTransportKey = await idempotency.execute(
            reporterId,
            'e57c4838-2d22-4f3b-9ab6-3ecf04197631',
            'POST',
            `/v1/matches/${matchId}/no-show-reports`,
            body,
            201,
            (tx) => safety.submitNoShow(reporterId, matchId, body, tx)
        );
        expect(replayWithAnotherTransportKey.value).toEqual(responses[0].value);
        await expect(prisma.safetySignal.count({ where: { reporterId, kind: 'NO_SHOW' } })).resolves.toBe(1);
        const event = await prisma.outboxEvent.findFirstOrThrow({
            where: { type: 'safety.signal.received.v1' },
            orderBy: { occurredAt: 'desc' },
        });
        expect(JSON.stringify(event.payload)).not.toContain('evidence-canary');
    });

    it('enforces a two-way block before join and restricted evidence access', async () => {
        const [organizerId, blockedId, moderatorId, outsiderId] = await Promise.all([
            player(),
            player(),
            player(),
            player(),
        ]);
        const matchId = await match(
            organizerId,
            await player(),
            MatchState.PUBLISHED,
            new Date(now.getTime() + 3_600_000)
        );
        await prisma.$transaction((tx) => communications.block(organizerId, blockedId, tx));
        await expect(interactionPolicy.blocked(organizerId, blockedId)).resolves.toBe(true);
        await expect(interactionPolicy.blocked(blockedId, organizerId)).resolves.toBe(true);
        await expect(
            prisma.$transaction((tx) =>
                matches.join(blockedId, matchId, { expectedVersion: 3, teamChoice: MatchTeamChoiceDto.ANY }, tx)
            )
        ).rejects.toMatchObject({ code: 'REQUEST_NOT_ALLOWED' });

        const reportMatchId = await match(
            organizerId,
            blockedId,
            MatchState.PUBLISHED,
            new Date(now.getTime() - 3_600_000)
        );
        const receipt = (await prisma.$transaction((tx) =>
            safety.submitNoShow(
                organizerId,
                reportMatchId,
                { subjectPlayerId: blockedId, reason: NoShowReasonDto.DID_NOT_ARRIVE, evidence: 'restricted-canary' },
                tx
            )
        )) as { receiptId: string };
        const link = await prisma.moderationCaseSignal.findUniqueOrThrow({ where: { signalId: receipt.receiptId } });
        await moderation.triage(link.caseId, moderatorId, 0, 'NORMAL');
        await moderation.assign(link.caseId, moderatorId, moderatorId, 1);
        await expect(safety.getOwn(organizerId, receipt.receiptId)).resolves.toMatchObject({
            submittedEvidence: 'restricted-canary',
        });
        await expect(safety.getOwn(blockedId, receipt.receiptId)).resolves.toMatchObject({
            submittedEvidence: null,
        });
        await expect(safety.getOwn(outsiderId, receipt.receiptId)).rejects.toMatchObject({
            code: 'SAFETY_RECEIPT_NOT_FOUND',
        });
        await expect(moderation.readAssignedEvidence(outsiderId, link.caseId)).rejects.toMatchObject({
            code: 'INTERACTION_NOT_ALLOWED',
        });
        await expect(moderation.readAssignedEvidence(moderatorId, link.caseId)).resolves.toEqual([
            expect.objectContaining({ evidence: 'restricted-canary' }),
        ]);

        await prisma.$transaction((tx) => communications.unblock(organizerId, blockedId, tx));
        await expect(interactionPolicy.blocked(organizerId, blockedId)).resolves.toBe(false);
        await expect(interactionPolicy.blocked(blockedId, organizerId)).resolves.toBe(false);
    });

    it('audits every implemented moderation transition without narrative content', async () => {
        const [reporterId, subjectId, moderatorId] = await Promise.all([player(), player(), player()]);
        const matchId = await match(reporterId, subjectId, MatchState.PUBLISHED, new Date(now.getTime() - 3_600_000));
        const canary = 'transition-audit-canary@example.test';
        const receipt = (await prisma.$transaction((tx) =>
            safety.submitNoShow(
                reporterId,
                matchId,
                { subjectPlayerId: subjectId, reason: NoShowReasonDto.DID_NOT_ARRIVE, evidence: canary },
                tx
            )
        )) as { receiptId: string };
        const link = await prisma.moderationCaseSignal.findUniqueOrThrow({ where: { signalId: receipt.receiptId } });

        await moderation.triage(link.caseId, moderatorId, 0, 'NORMAL');
        await moderation.assign(link.caseId, moderatorId, moderatorId, 1);
        await moderation.beginInvestigation(link.caseId, moderatorId, 2);
        await moderation.recordDecision(moderatorId, link.caseId, 3, {
            outcome: ModerationDecisionOutcome.NO_VIOLATION,
            policyCode: 'NO_VIOLATION',
            policyVersion: 'safety-v1',
            scopeCode: 'CASE',
            basisChecksum: 'a'.repeat(64),
        });

        const audit = await prisma.auditEntry.findMany({
            where: { targetType: 'MODERATION_CASE', targetId: link.caseId },
            orderBy: { createdAt: 'asc' },
        });
        expect(audit.map((entry) => entry.action)).toEqual([
            'safety.case.triaged',
            'safety.case.assigned',
            'safety.case.investigation.started',
            'safety.decision.recorded',
        ]);
        expect(audit.every((entry) => entry.actorId === moderatorId && entry.outcome === 'SUCCEEDED')).toBe(true);
        expect(JSON.stringify(audit)).not.toContain(canary);
    });
});
