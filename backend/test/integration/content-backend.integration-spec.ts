import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { Queue, QueueEvents } from 'bullmq';

import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ENVIRONMENT } from '../../src/common/config/config.module';
import type { Environment } from '../../src/common/config/environment';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { ApplicationLogger } from '../../src/common/logging/application-logger.service';
import { RedisService } from '../../src/common/redis/redis.service';
import { ContentIngestionQueueService } from '../../src/content/content-ingestion-queue.service';
import { ContentIngestionWorkerService } from '../../src/content/content-ingestion-worker.service';
import { ContentIngestionService } from '../../src/content/content-ingestion.service';
import {
    type ContentFetchPolicy,
    type ContentFetchResult,
    ContentSourceAdapterPort,
} from '../../src/content/content-source.adapter';
import { ContentService } from '../../src/content/content.service';

class ControlledContentSourceAdapter extends ContentSourceAdapterPort {
    readonly fetch = jest.fn<Promise<ContentFetchResult>, [ContentFetchPolicy]>();
}

describe('content backend publication and concurrency', () => {
    let application: INestApplication;
    let prisma: PrismaService;
    let content: ContentService;
    let ingestion: ContentIngestionService;
    let redis: RedisService;
    let adapter: ControlledContentSourceAdapter;
    let editorId: string;
    let categoryId: string;

    beforeAll(async () => {
        const builder = Test.createTestingModule({ imports: [AppModule] });
        adapter = new ControlledContentSourceAdapter();
        const module = await builder.overrideProvider(ContentSourceAdapterPort).useValue(adapter).compile();
        application = module.createNestApplication();
        configureApplication(application);
        await application.init();
        prisma = application.get(PrismaService);
        content = application.get(ContentService);
        ingestion = application.get(ContentIngestionService);
        redis = application.get(RedisService);
        editorId = uuidV7();
        categoryId = uuidV7();
        await prisma.user.create({ data: { id: editorId, completedAt: new Date() } });
        await prisma.contentCategory.create({
            data: { id: categoryId, slug: `integration-${categoryId.slice(-8)}`, locale: 'ru', name: 'Интеграция' },
        });
    });

    afterAll(async () => application.close());

    function transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    function checklist(): Record<string, unknown> {
        return {
            version: '1.0.0',
            factsChecked: true,
            textRightsChecked: true,
            mediaRightsChecked: true,
            attributionChecked: true,
            privacyChecked: true,
            accessibilityChecked: true,
            languageChecked: true,
            selfReview: true,
        };
    }

    async function approvedArticle(): Promise<{ articleId: string; revisionId: string }> {
        const created = (await transaction((tx) => content.createArticle(editorId, 'ORIGINAL', undefined, tx))) as {
            id: string;
        };
        const slug = `runtime-${created.id.slice(-12)}`;
        const revision = (await transaction((tx) =>
            content.createRevision(
                editorId,
                created.id,
                {
                    expectedArticleVersion: 0,
                    locale: 'ru',
                    slug,
                    title: 'Проверяемая публикация',
                    summary: 'Материал для интеграционной проверки.',
                    body: {
                        format: 'SAFE_RICH_TEXT_V1',
                        blocks: [{ kind: 'PARAGRAPH', inlines: [{ text: 'Безопасный текст статьи.' }] }],
                    },
                    categoryId,
                    tagIds: [],
                    originKind: 'ORIGINAL',
                    origins: [],
                    media: [],
                    seo: {
                        title: 'Проверяемая публикация',
                        description: 'Материал для интеграционной проверки.',
                        canonicalUrl: `https://content.example.test/articles/ru/${slug}`,
                        indexable: false,
                        openGraphImageUrl: null,
                    },
                },
                tx
            )
        )) as { id: string };
        await transaction((tx) =>
            content.decideArticle(
                editorId,
                created.id,
                {
                    expectedArticleVersion: 1,
                    revisionId: revision.id,
                    decision: 'SUBMIT_REVIEW',
                    reason: 'EDITORIAL_READY',
                },
                tx
            )
        );
        await transaction((tx) =>
            content.decideArticle(
                editorId,
                created.id,
                {
                    expectedArticleVersion: 2,
                    revisionId: revision.id,
                    decision: 'APPROVE',
                    reason: 'EDITORIAL_READY',
                    checklist: checklist(),
                },
                tx
            )
        );
        return { articleId: created.id, revisionId: revision.id };
    }

    async function publishedArticle(): Promise<{ articleId: string; revisionId: string }> {
        const approved = await approvedArticle();
        await transaction((tx) =>
            content.decideArticle(
                editorId,
                approved.articleId,
                {
                    expectedArticleVersion: 3,
                    revisionId: approved.revisionId,
                    decision: 'PUBLISH',
                    reason: 'EDITORIAL_READY',
                    checklist: checklist(),
                },
                tx
            )
        );
        return approved;
    }

    async function enabledSource(): Promise<{ sourceId: string; checkpointKey: string }> {
        const sourceId = uuidV7();
        const policyId = uuidV7();
        await prisma.contentSource.create({
            data: {
                id: sourceId,
                integrationKind: 'RSS',
                legalName: `Integration source ${sourceId}`,
                displayName: 'Integration source',
                canonicalOrigin: `https://source-${sourceId}.example.test`,
                endpoint: `https://source-${sourceId}.example.test/feed.xml`,
            },
        });
        await prisma.contentSourcePolicy.create({
            data: {
                id: policyId,
                sourceId,
                version: '1.0.0',
                useClasses: ['METADATA', 'EXCERPT'],
                maximumExcerptCharacters: 500,
                termsUrl: `https://source-${sourceId}.example.test/terms`,
                termsVersion: 'integration-v1',
                rightsBasis: 'Synthetic integration fixture',
                attributionTemplate: 'Synthetic source',
                territory: 'RU',
                languages: ['ru'],
                validFrom: new Date(Date.now() - 60_000),
                reviewDueAt: new Date(Date.now() + 60 * 60_000),
                reviewedAt: new Date(),
                legalReview: 'APPROVED',
                securityReview: 'APPROVED',
                privacyReview: 'APPROVED',
                commercialReview: 'APPROVED',
                evidenceCiphertext: Buffer.from('synthetic-integration-evidence'),
                encryptionKeyVersion: 1,
                createdByUserId: editorId,
            },
        });
        await prisma.contentSource.update({
            where: { id: sourceId },
            data: { currentPolicyId: policyId, state: 'ENABLED', reviewedByUserId: editorId },
        });
        return { sourceId, checkpointKey: `content:checkpoint:${sourceId}` };
    }

    it('publishes only the committed safe revision and emits a body-free event', async () => {
        const fixture = await publishedArticle();
        const projection = await prisma.contentPublicProjection.findUniqueOrThrow({
            where: { articleId: fixture.articleId },
        });
        expect(projection.articleRevisionId).toBe(fixture.revisionId);
        await expect(content.article('ru', projection.slug)).resolves.toMatchObject({
            id: fixture.articleId,
            body: { format: 'SAFE_RICH_TEXT_V1' },
        });
        await expect(content.search('проверяемая', 'ru', { limit: 20 })).resolves.toMatchObject({
            items: [{ id: fixture.articleId }],
        });
        const event = await prisma.outboxEvent.findFirstOrThrow({
            where: {
                type: 'content.article.published.v1',
                payload: { path: ['articleId'], equals: fixture.articleId },
            },
            orderBy: { occurredAt: 'desc' },
        });
        expect(JSON.stringify(event.payload)).not.toMatch(/Безопасный|Проверяемая|body|title/iu);
    });

    it('keeps an approved draft out of the public projection, search and reader API', async () => {
        const fixture = await approvedArticle();
        await expect(
            prisma.contentPublicProjection.findUnique({ where: { articleId: fixture.articleId } })
        ).resolves.toBeNull();
        await expect(content.search('проверяемая', 'ru', { limit: 20 })).resolves.toMatchObject({ items: [] });
        await expect(content.article('ru', `runtime-${fixture.articleId.slice(-12)}`)).rejects.toMatchObject({
            code: 'ARTICLE_NOT_AVAILABLE',
        });
        await expect(
            prisma.auditEntry.count({ where: { targetType: 'ARTICLE', targetId: fixture.articleId } })
        ).resolves.toBeGreaterThanOrEqual(4);
        await expect(
            prisma.articleRevision.update({
                where: { id: fixture.revisionId },
                data: { title: 'Переписано без редакции' },
            })
        ).rejects.toBeDefined();
    });

    it('converges concurrent bookmark writes to the database-owned unique row', async () => {
        const fixture = await publishedArticle();
        const results = await Promise.allSettled([
            transaction((tx) => content.putBookmark(editorId, fixture.articleId, tx)),
            transaction((tx) => content.putBookmark(editorId, fixture.articleId, tx)),
        ]);
        expect(results.some(({ status }) => status === 'fulfilled')).toBe(true);
        await expect(
            prisma.bookmark.count({ where: { userId: editorId, articleId: fixture.articleId } })
        ).resolves.toBe(1);
    });

    it('removes projection and search visibility atomically on unpublish', async () => {
        const fixture = await publishedArticle();
        await transaction((tx) =>
            content.decideArticle(
                editorId,
                fixture.articleId,
                {
                    expectedArticleVersion: 4,
                    revisionId: fixture.revisionId,
                    decision: 'UNPUBLISH',
                    reason: 'CORRECTION',
                },
                tx
            )
        );
        await expect(
            prisma.contentPublicProjection.findUnique({ where: { articleId: fixture.articleId } })
        ).resolves.toBeNull();
        await expect(content.search('проверяемая', 'ru', { limit: 20 })).resolves.toMatchObject({ items: [] });
        const event = await prisma.outboxEvent.findFirstOrThrow({
            where: {
                type: 'content.article.unpublished.v1',
                payload: { path: ['articleId'], equals: fixture.articleId },
            },
        });
        expect(JSON.stringify(event.payload)).not.toMatch(/Безопасный|Проверяемая|body|title/iu);
    });

    it('publishes a due scheduled revision exactly once under concurrent scheduler runs', async () => {
        const fixture = await approvedArticle();
        const scheduledFor = new Date(Date.now() + 250);
        await transaction((tx) =>
            content.decideArticle(
                editorId,
                fixture.articleId,
                {
                    expectedArticleVersion: 3,
                    revisionId: fixture.revisionId,
                    decision: 'SCHEDULE',
                    reason: 'EDITORIAL_READY',
                    checklist: checklist(),
                    scheduledFor: scheduledFor.toISOString(),
                },
                tx
            )
        );
        await new Promise((resolve) => setTimeout(resolve, 300));

        const outcomes = await Promise.all([content.publishScheduled(), content.publishScheduled()]);

        expect(outcomes.reduce((sum, value) => sum + value, 0)).toBe(1);
        await expect(prisma.article.findUniqueOrThrow({ where: { id: fixture.articleId } })).resolves.toMatchObject({
            state: 'PUBLISHED',
            publishedRevisionId: fixture.revisionId,
            scheduledRevisionId: null,
        });
        await expect(
            prisma.contentPublicationDecision.count({
                where: { articleId: fixture.articleId, decision: 'PUBLISH' },
            })
        ).resolves.toBe(1);
    });

    it('deduplicates source redelivery and recovers without loss after an unavailable-source attempt', async () => {
        const source = await enabledSource();
        const item = {
            providerId: 'integration-item-1',
            canonicalUrl: 'https://publisher.example.test/integration-item-1',
            title: 'Материал из интеграционного источника',
            author: null,
            publisher: 'Synthetic publisher',
            excerpt: 'Разрешённая синтетическая выдержка.',
            originallyPublishedAt: new Date('2026-09-01T10:00:00.000Z'),
        };
        adapter.fetch.mockRejectedValueOnce(new Error('SOURCE_UNAVAILABLE'));

        await expect(ingestion.pollEnabledSources()).resolves.toEqual({ attempted: 1, succeeded: 0 });
        await expect(prisma.ingestCandidate.count({ where: { sourceId: source.sourceId } })).resolves.toBe(0);
        const deferred = JSON.parse((await redis.client.get(source.checkpointKey)) ?? '{}') as {
            failureCount?: number;
        };
        expect(deferred.failureCount).toBe(1);

        await redis.client.del(source.checkpointKey);
        adapter.fetch.mockResolvedValue({ outcome: 'SUCCESS', etag: 'integration-etag', items: [item] });
        await expect(ingestion.pollEnabledSources()).resolves.toEqual({ attempted: 1, succeeded: 1 });
        await redis.client.del(source.checkpointKey);
        await expect(ingestion.pollEnabledSources()).resolves.toEqual({ attempted: 1, succeeded: 1 });

        const candidate = await prisma.ingestCandidate.findFirstOrThrow({
            where: { sourceId: source.sourceId },
        });
        await expect(prisma.ingestCandidateRevision.count({ where: { candidateId: candidate.id } })).resolves.toBe(1);
        await redis.client.del(source.checkpointKey);
    });

    it('keeps an ETag checkpoint on 304 and creates no candidate for an unchanged source', async () => {
        const source = await enabledSource();
        await redis.client.set(
            source.checkpointKey,
            JSON.stringify({ etag: '"revision-1"', lastModified: 'Mon, 14 Sep 2026 10:00:00 GMT' })
        );
        adapter.fetch.mockResolvedValue({
            outcome: 'NOT_MODIFIED',
            etag: '"revision-1"',
            lastModified: 'Mon, 14 Sep 2026 10:00:00 GMT',
            items: [],
        });

        await expect(ingestion.pollEnabledSources()).resolves.toEqual({ attempted: 1, succeeded: 1 });
        expect(adapter.fetch).toHaveBeenLastCalledWith(
            expect.objectContaining({
                etag: '"revision-1"',
                lastModified: 'Mon, 14 Sep 2026 10:00:00 GMT',
            })
        );
        await expect(prisma.ingestCandidate.count({ where: { sourceId: source.sourceId } })).resolves.toBe(0);
        const checkpoint = JSON.parse((await redis.client.get(source.checkpointKey)) ?? '{}') as {
            etag?: string;
            failureCount?: number;
        };
        expect(checkpoint).toMatchObject({ etag: '"revision-1"', failureCount: 0 });
        await redis.client.del(source.checkpointKey);
    });

    it('keeps one BullMQ scheduler and redelivers a failed closed-payload ingestion job', async () => {
        const baseEnvironment = application.get<Environment>(ENVIRONMENT);
        const workerEnvironment: Environment = {
            ...baseEnvironment,
            APP_ROLE: 'worker',
            REDIS_NAMESPACE: `content-${uuidV7().replaceAll('-', '')}`,
            CONTENT_FETCH_INTERVAL_MS: 60_000,
        };
        const queueService = new ContentIngestionQueueService(workerEnvironment, redis);
        const pollEnabledSources = jest
            .fn<Promise<{ attempted: number; succeeded: number }>, []>()
            .mockRejectedValueOnce(new Error('TRANSIENT_SOURCE_FAILURE'))
            .mockResolvedValue({ attempted: 1, succeeded: 1 });
        const ingestionMock = {
            pollEnabledSources,
        } as unknown as ContentIngestionService;
        const worker = new ContentIngestionWorkerService(
            workerEnvironment,
            redis,
            queueService,
            ingestionMock,
            application.get(ApplicationLogger)
        );
        const queue = new Queue<Record<string, never>>(queueService.name, { connection: redis.client });
        const eventConnection = redis.client.duplicate({ maxRetriesPerRequest: null });
        const events = new QueueEvents(queueService.name, { connection: eventConnection });
        try {
            await events.waitUntilReady();
            await queueService.onApplicationBootstrap();
            await queueService.onApplicationBootstrap();
            worker.onApplicationBootstrap();
            const schedulers = await queue.getJobSchedulers(0, 10, true);
            expect(schedulers.filter(({ key }) => key === 'content-source-poll-v1')).toHaveLength(1);
            const job = await queue.add(
                'content.source.poll.v1',
                {},
                { attempts: 2, backoff: { type: 'fixed', delay: 10 } }
            );

            await expect(job.waitUntilFinished(events, 5000)).resolves.toEqual({ attempted: 1, succeeded: 1 });
            expect(pollEnabledSources).toHaveBeenCalledTimes(2);
        } finally {
            await worker.onModuleDestroy();
            await queueService.onModuleDestroy();
            await queue.removeJobScheduler('content-source-poll-v1');
            await queue.drain(true);
            await events.close();
            eventConnection.disconnect(false);
            await queue.close();
        }
    });
});
