import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { AdvertisingIdempotencyService } from '../../src/advertising/advertising-idempotency.service';
import { AdvertisingService } from '../../src/advertising/advertising.service';
import type { CampaignInput, CampaignRevisionInput, DecisionContext } from '../../src/advertising/advertising.types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';

describe('advertising backend delivery invariants', () => {
    let application: INestApplication;
    let prisma: PrismaService;
    let advertising: AdvertisingService;
    let idempotency: AdvertisingIdempotencyService;
    let managerId: string;
    let reviewerId: string;

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        application = module.createNestApplication();
        configureApplication(application);
        await application.init();
        prisma = application.get(PrismaService);
        advertising = application.get(AdvertisingService);
        idempotency = application.get(AdvertisingIdempotencyService);
        managerId = uuidV7();
        reviewerId = uuidV7();
        await prisma.user.createMany({
            data: [
                { id: managerId, completedAt: new Date() },
                { id: reviewerId, completedAt: new Date() },
            ],
        });
    });

    afterAll(async () => application.close());

    function transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    function campaignInput(budgetMinor = 10_000, rateMinor = 1_000): CampaignInput {
        return {
            advertiserName: 'Synthetic advertiser',
            advertiserLegalId: `TEST-${uuidV7()}`,
            timezone: 'Europe/Moscow',
            startsAt: new Date(Date.now() - 60_000).toISOString(),
            endsAt: new Date(Date.now() + 3_600_000).toISOString(),
            currency: 'RUB',
            budgetMinor,
            billingModel: 'CPC',
            rateMinor,
            priorityTier: 'GUARANTEED_DIRECT',
            cap24Hours: 3,
            cap7Days: 10,
            placementIds: [],
            targetRules: [{ dimension: 'SURFACE', operator: 'INCLUDE', values: ['NEWS_FEED'] }],
            legalLabel: {
                label: 'Реклама',
                advertiserName: 'Synthetic advertiser',
                registrationToken: null,
                disclosure: 'Synthetic integration fixture',
            },
            policyVersion: '1.0.0',
        };
    }

    async function activeCampaign(
        budgetMinor = 10_000,
        rateMinor = 1_000,
        options: {
            readonly input?: Partial<CampaignInput>;
            readonly placement?: { readonly code: string; readonly id: string };
        } = {}
    ): Promise<{ campaignId: string; placementCode: string; placementId: string }> {
        const placementCode = options.placement?.code ?? `TEST_${uuidV7().replaceAll('-', '').toUpperCase()}`;
        const placement =
            options.placement ??
            ((await transaction((tx) =>
                advertising.createPlacement(
                    managerId,
                    {
                        expectedVersion: 0,
                        code: placementCode,
                        surface: 'NEWS_FEED',
                        format: 'STATIC_IMAGE',
                        enabled: true,
                        fallbackEnabled: false,
                        minimumWidth: 300,
                        minimumHeight: 120,
                    },
                    tx
                )
            )) as { id: string });
        const input = { ...campaignInput(budgetMinor, rateMinor), ...options.input };
        input.placementIds = [placement.id];
        const campaign = (await transaction((tx) => advertising.createCampaign(managerId, input, tx))) as {
            id: string;
        };
        const creative = (await transaction((tx) =>
            advertising.createCreative(
                managerId,
                {
                    campaignId: campaign.id,
                    expectedCampaignVersion: 0,
                    format: 'STATIC_IMAGE',
                    assetId: uuidV7(),
                    mediaType: 'image/webp',
                    byteLength: 1024,
                    sha256: 'a'.repeat(64),
                    altText: 'Тестовый рекламный материал',
                    landingUrl: 'https://ads.example.test/landing',
                    approvedRedirectHosts: ['ads.example.test'],
                },
                tx
            )
        )) as { id: string };
        const revision = (await transaction((tx) =>
            advertising.createRevision(
                managerId,
                campaign.id,
                {
                    ...input,
                    expectedVersion: 0,
                    creativeIds: [creative.id],
                } as CampaignRevisionInput,
                tx
            )
        )) as { id: string };
        await transaction((tx) =>
            advertising.decideCampaign(
                managerId,
                campaign.id,
                {
                    expectedVersion: 1,
                    revisionId: revision.id,
                    decision: 'SUBMIT',
                    reason: 'MANUAL',
                    checklistVersion: '1.0.0',
                    independentReviewer: false,
                },
                tx
            )
        );
        await transaction((tx) =>
            advertising.decideCampaign(
                reviewerId,
                campaign.id,
                {
                    expectedVersion: 2,
                    revisionId: revision.id,
                    decision: 'APPROVE',
                    reason: 'MANUAL',
                    checklistVersion: '1.0.0',
                    independentReviewer: true,
                },
                tx
            )
        );
        return { campaignId: campaign.id, placementCode, placementId: placement.id };
    }

    function context(placementCode: string, capToken = 'A'.repeat(43)): DecisionContext {
        return {
            placementCode,
            surface: 'NEWS_FEED',
            clientKind: 'WEB',
            locale: 'ru-RU',
            formFactor: 'REGULAR',
            connectivity: 'REGULAR',
            criticalState: false,
            providerConsent: false,
            capToken,
        };
    }

    it('serializes concurrent issuance against the hard campaign budget', async () => {
        const fixture = await activeCampaign(1_000, 1_000);
        const operations = ['B'.repeat(43), 'C'.repeat(43)].map((capToken, index) =>
            idempotency.execute(
                `parallel-${String(index)}`,
                uuidV7(),
                'POST',
                '/v1/advertising/decisions',
                { index },
                200,
                (tx) => advertising.decide(context(fixture.placementCode, capToken), `parallel-${String(index)}`, tx)
            )
        );
        const decisions = await Promise.all(operations);
        expect(decisions.map(({ value }) => (value as { source: string }).source).sort()).toEqual([
            'DIRECT',
            'NO_FILL',
        ]);
        const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
        expect(campaign.reservedMinor + campaign.spentMinor).toBeLessThanOrEqual(campaign.budgetMinor);
    });

    it('selects the highest priority eligible approved snapshot', async () => {
        const standard = await activeCampaign(10_000, 1_000, {
            input: { priorityTier: 'STANDARD_DIRECT' },
        });
        const emergency = await activeCampaign(10_000, 1_000, {
            input: { priorityTier: 'HOUSE_EMERGENCY' },
            placement: { code: standard.placementCode, id: standard.placementId },
        });

        await expect(
            transaction((tx) =>
                advertising.decide(context(standard.placementCode, 'P'.repeat(43)), 'priority-order', tx)
            )
        ).resolves.toMatchObject({ source: 'HOUSE', campaignId: emergency.campaignId });
    });

    it('normalizes offset timestamps to UTC and excludes a not-yet-started approved campaign', async () => {
        const scheduled = await activeCampaign(10_000, 1_000, {
            input: {
                timezone: 'Europe/Berlin',
                startsAt: '2026-10-25T02:30:00+02:00',
                endsAt: '2026-10-25T02:30:00+01:00',
            },
        });
        const stored = await prisma.campaign.findUniqueOrThrow({ where: { id: scheduled.campaignId } });

        expect(stored.state).toBe('SCHEDULED');
        expect(stored.startsAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');
        expect(stored.endsAt.toISOString()).toBe('2026-10-25T01:30:00.000Z');
        await expect(
            transaction((tx) =>
                advertising.decide(context(scheduled.placementCode, 'Q'.repeat(43)), 'scheduled-boundary', tx)
            )
        ).resolves.toMatchObject({ source: 'NO_FILL', reason: 'NO_ELIGIBLE_CAMPAIGN' });
    });

    it('enforces rolling viewable caps and stops delivery immediately after pause', async () => {
        const fixture = await activeCampaign();
        const sharedCap = 'D'.repeat(43);
        for (let index = 0; index < 3; index += 1) {
            const decision = (await transaction((tx) =>
                advertising.decide(context(fixture.placementCode, sharedCap), `cap-${String(index)}`, tx)
            )) as { deliveryToken: string };
            await transaction((tx) =>
                advertising.impression(
                    {
                        deliveryToken: decision.deliveryToken,
                        visiblePercent: 50,
                        continuousForegroundMilliseconds: 1000,
                    },
                    tx
                )
            );
            const backdated = new Date(Date.now() - 6 * 60_000);
            await prisma.deliveryCounter.updateMany({
                where: { campaignId: fixture.campaignId },
                data: { lastViewableAt: backdated, expiresAt: new Date(backdated.getTime() + 7 * 86_400_000) },
            });
        }
        await expect(
            transaction((tx) => advertising.decide(context(fixture.placementCode, sharedCap), 'cap-four', tx))
        ).resolves.toMatchObject({ source: 'NO_FILL', reason: 'FREQUENCY_CAPPED' });
        const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
        await transaction((tx) =>
            advertising.campaignState(
                managerId,
                fixture.campaignId,
                { expectedVersion: Number(campaign.version), reason: 'MANUAL' },
                false,
                tx
            )
        );
        await expect(
            transaction((tx) => advertising.decide(context(fixture.placementCode, 'E'.repeat(43)), 'paused', tx))
        ).resolves.toMatchObject({ source: 'NO_FILL' });
    });

    it('records one trusted click and returns a replay receipt without a second charge', async () => {
        const fixture = await activeCampaign(10_000, 1_000);
        const decision = (await transaction((tx) =>
            advertising.decide(context(fixture.placementCode, 'F'.repeat(43)), 'click-replay', tx)
        )) as { clickToken: string };

        const first = await transaction((tx) =>
            advertising.click({ clickToken: decision.clickToken, trustedActivation: true }, tx)
        );
        const replay = await transaction((tx) =>
            advertising.click({ clickToken: decision.clickToken, trustedActivation: true }, tx)
        );

        expect(first).toMatchObject({
            accepted: true,
            duplicate: false,
            redirectUrl: 'https://ads.example.test/landing',
        });
        expect(replay).toMatchObject({
            accepted: true,
            duplicate: true,
            redirectUrl: 'https://ads.example.test/landing',
        });
        await expect(
            prisma.adDeliveryEvent.count({ where: { campaignId: fixture.campaignId, kind: 'VALID_CLICK' } })
        ).resolves.toBe(1);
        const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
        expect(campaign.spentMinor).toBe(1_000n);
    });

    it('never redirects or charges an untrusted click, including its replay', async () => {
        const fixture = await activeCampaign(10_000, 1_000);
        const decision = (await transaction((tx) =>
            advertising.decide(context(fixture.placementCode, 'G'.repeat(43)), 'invalid-click', tx)
        )) as { clickToken: string };

        const first = await transaction((tx) =>
            advertising.click({ clickToken: decision.clickToken, trustedActivation: false }, tx)
        );
        const replay = await transaction((tx) =>
            advertising.click({ clickToken: decision.clickToken, trustedActivation: true }, tx)
        );

        expect(first).toMatchObject({
            accepted: false,
            duplicate: false,
            invalidReason: 'UNTRUSTED_ACTIVATION',
            redirectUrl: null,
        });
        expect(replay).toMatchObject({
            accepted: false,
            duplicate: true,
            invalidReason: 'UNTRUSTED_ACTIVATION',
            redirectUrl: null,
        });
        await expect(
            prisma.adDeliveryEvent.count({ where: { campaignId: fixture.campaignId, kind: 'INVALID_CLICK' } })
        ).resolves.toBe(1);
        const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
        expect(campaign.spentMinor).toBe(0n);
    });

    it('stores reporting facts consistently and suppresses a small API cohort', async () => {
        const fixture = await activeCampaign(10_000, 1_000);
        const decision = (await transaction((tx) =>
            advertising.decide(context(fixture.placementCode, 'H'.repeat(43)), 'report-reconcile', tx)
        )) as { deliveryToken: string; clickToken: string };
        await transaction((tx) =>
            advertising.impression(
                {
                    deliveryToken: decision.deliveryToken,
                    visiblePercent: 50,
                    continuousForegroundMilliseconds: 1000,
                },
                tx
            )
        );
        await transaction((tx) => advertising.click({ clickToken: decision.clickToken, trustedActivation: true }, tx));

        const stored = await prisma.adReportDaily.findFirstOrThrow({ where: { campaignId: fixture.campaignId } });
        expect(stored).toMatchObject({
            served: 1n,
            viewable: 1n,
            validClicks: 1n,
            invalidEvents: 0n,
            spendMinor: 1_000n,
        });
        const report = (await advertising.report({
            campaignId: fixture.campaignId,
            from: new Date(Date.now() - 86_400_000).toISOString(),
            until: new Date(Date.now() + 86_400_000).toISOString(),
        })) as { minimumCohortSize: number; rows: { served: number; suppressed: boolean; spendMinor: number }[] };
        expect(report.minimumCohortSize).toBe(20);
        expect(report.rows).toEqual([expect.objectContaining({ served: 1, suppressed: true, spendMinor: 0 })]);
    });
});
