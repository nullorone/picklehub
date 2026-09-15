import { Inject, Injectable } from '@nestjs/common';
import {
    Prisma,
    type Article,
    type ArticleRevision,
    type ContentPublicationDecision,
    type ContentSource,
    type ContentSourcePolicy,
    type IngestCandidate,
    type IngestCandidateRevision,
} from '@prisma/client';
import { createHash } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { OutboxService } from '../outbox/outbox.service';
import { ContentCursorService } from './content-cursor.service';
import { contentError } from './content.errors';
import { assertSafeRichText, richTextHash, richTextPlainText, type SafeRichTextDocument } from './content-rich-text';

type JsonRecord = Record<string, unknown>;

interface PageInput {
    limit: number;
    cursor?: string;
}

interface PublicFilter extends PageInput {
    locale?: string;
    category?: string;
    tag?: string;
}

interface SourceInput extends JsonRecord {
    expectedVersion: number;
    integrationKind: 'RSS' | 'API';
    legalName: string;
    displayName: string;
    canonicalOrigin: string;
    endpoint: string;
    attributionTemplate: string;
    licenseNotice?: string;
    policyVersion: string;
    rights: JsonRecord;
}

interface RevisionInput extends JsonRecord {
    expectedArticleVersion: number;
    locale: string;
    slug: string;
    title: string;
    subtitle?: string;
    summary: string;
    body: unknown;
    categoryId: string;
    tagIds: string[];
    originKind: 'ORIGINAL' | 'DERIVED';
    origins: JsonRecord[];
    media: JsonRecord[];
    seo: JsonRecord;
    correctionNote?: string;
    translationOfRevisionId?: string;
}

interface DecisionInput extends JsonRecord {
    expectedArticleVersion: number;
    revisionId: string;
    decision: string;
    reason: string;
    checklist?: JsonRecord;
    scheduledFor?: string;
}

const ARTICLE_STATES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'];
const SOURCE_STATES = ['PROPOSED', 'ENABLED', 'PAUSED', 'REVOKED'];
const CANDIDATE_STATES = ['NEW', 'DUPLICATE', 'DISMISSED', 'SELECTED', 'RIGHTS_HOLD'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DECISION_REASONS = new Set([
    'EDITORIAL_READY',
    'EDITORIAL_REVISION_REQUIRED',
    'SCHEDULE_CHANGED',
    'CORRECTION',
    'RIGHTS_REVOKED',
    'LEGAL_TAKEDOWN',
    'SAFETY_REQUEST',
    'SOURCE_UNAVAILABLE',
    'ARCHIVE_POLICY',
]);
const USE_CLASSES = new Set([
    'FETCH_METADATA',
    'STORE_METADATA',
    'STORE_EXCERPT',
    'TRANSFORM',
    'PUBLISH_ATTRIBUTION',
    'STORE_FULL_TEXT',
    'PUBLISH_FULL_TEXT',
    'STORE_MEDIA',
    'PUBLISH_MEDIA',
    'CACHE',
]);
const REVIEW_STATES = new Set(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
const REVISION_INCLUDE = {
    category: true,
    tags: { include: { tag: true } },
    media: true,
    origins: { include: { source: true, sourcePolicy: true } },
} satisfies Prisma.ArticleRevisionInclude;
const PUBLIC_INCLUDE = {
    article: true,
    articleRevision: { include: REVISION_INCLUDE },
} satisfies Prisma.ContentPublicProjectionInclude;
type RevisionWithRelations = Prisma.ArticleRevisionGetPayload<{ include: typeof REVISION_INCLUDE }>;
type ProjectionWithRelations = Prisma.ContentPublicProjectionGetPayload<{ include: typeof PUBLIC_INCLUDE }>;

@Injectable()
export class ContentService {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly prisma: PrismaService,
        private readonly cursor: ContentCursorService,
        private readonly crypto: IdentityCryptoService,
        private readonly audit: AuditService,
        private readonly context: RequestContextService,
        private readonly outbox: OutboxService
    ) {}

    async feed(input: PublicFilter): Promise<object> {
        const scope = this.scope('feed', input.locale, input.category, input.tag);
        const decoded = input.cursor === undefined ? undefined : this.cursor.decode(input.cursor, scope);
        const snapshotAt = decoded?.snapshot === undefined ? new Date() : new Date(decoded.snapshot);
        const rows = await this.prisma.contentPublicProjection.findMany({
            where: {
                publishedAt: {
                    lte: snapshotAt,
                    ...(decoded === undefined ? {} : { lte: new Date(decoded.at) }),
                },
                ...(decoded === undefined
                    ? {}
                    : {
                          OR: [
                              { publishedAt: { lt: new Date(decoded.at) } },
                              { publishedAt: new Date(decoded.at), articleId: { lt: decoded.id } },
                          ],
                      }),
                ...(input.locale === undefined ? {} : { locale: input.locale }),
                ...(input.category === undefined ? {} : { articleRevision: { category: { slug: input.category } } }),
                ...(input.tag === undefined
                    ? {}
                    : { articleRevision: { tags: { some: { tag: { slug: input.tag } } } } }),
            },
            include: this.publicInclude(),
            orderBy: [{ publishedAt: 'desc' }, { articleId: 'desc' }],
            take: input.limit + 1,
        });
        const page = rows.slice(0, input.limit);
        const last = page.at(-1);
        return {
            items: page.map((row) => this.articleCard(row)),
            pageInfo: {
                hasNext: rows.length > input.limit,
                nextCursor:
                    rows.length > input.limit && last !== undefined
                        ? this.cursor.encode({
                              scope,
                              at: last.publishedAt.toISOString(),
                              id: last.articleId,
                              snapshot: snapshotAt.toISOString(),
                          })
                        : null,
            },
            snapshotAt: snapshotAt.toISOString(),
        };
    }

    async article(locale: string, slug: string): Promise<object> {
        const row = await this.prisma.contentPublicProjection.findUnique({
            where: { locale_slug: { locale, slug } },
            include: this.publicInclude(),
        });
        if (row === null) throw contentError('ARTICLE_NOT_AVAILABLE', 404);
        const alternatives = await this.prisma.contentPublicProjection.findMany({
            where: { articleId: row.articleId, articleRevisionId: { not: row.articleRevisionId } },
            select: { locale: true, slug: true },
        });
        return {
            ...this.articleCard(row),
            body: row.articleRevision.body,
            seo: {
                title: row.articleRevision.seoTitle,
                description: row.articleRevision.seoDescription,
                canonicalUrl: row.articleRevision.canonicalUrl,
                indexable: true,
                openGraphImageUrl: this.mediaUrl(row.articleRevision.media[0]?.objectKey),
            },
            correctionNote: row.articleRevision.correctionNote,
            languageAlternatives: alternatives.map((alternative) => ({
                locale: alternative.locale,
                slug: alternative.slug,
                canonicalUrl: this.canonicalUrl(alternative.locale, alternative.slug),
            })),
        };
    }

    async search(query: string, locale: string, page: PageInput, category?: string, tag?: string): Promise<object> {
        const normalized = query.normalize('NFC').trim();
        if (normalized.length < 2 || normalized.length > 120) throw contentError('VALIDATION_FAILED', 400);
        const scope = this.scope('search', locale, category, tag, this.hash(normalized.toLocaleLowerCase(locale)));
        const decoded = page.cursor === undefined ? undefined : this.cursor.decode(page.cursor, scope);
        const offset = decoded === undefined ? 0 : Number(decoded.id);
        if (!Number.isInteger(offset) || offset < 0) throw contentError('INVALID_CURSOR', 400);
        const snapshotAt = decoded?.snapshot === undefined ? new Date() : new Date(decoded.snapshot);
        try {
            const ids = await this.prisma.$queryRaw<{ article_id: string }[]>`
                SELECT p.article_id
                FROM content_public_projections p
                JOIN article_revisions r ON r.id = p.article_revision_id
                JOIN content_categories c ON c.id = r.category_id
                WHERE p.locale = ${locale}
                  AND p.published_at <= ${snapshotAt}
                  AND p.search_document @@ websearch_to_tsquery('simple', ${normalized})
                  AND (${category ?? null}::text IS NULL OR c.slug = ${category ?? null})
                  AND (${tag ?? null}::text IS NULL OR EXISTS (
                      SELECT 1 FROM article_revision_tags rt JOIN content_tags t ON t.id = rt.tag_id
                      WHERE rt.article_revision_id = r.id AND t.slug = ${tag ?? null}
                  ))
                ORDER BY ts_rank_cd(p.search_document, websearch_to_tsquery('simple', ${normalized})) DESC,
                         p.published_at DESC, p.article_id DESC
                OFFSET ${offset} LIMIT ${page.limit + 1}`;
            const rows = await this.prisma.contentPublicProjection.findMany({
                where: { articleId: { in: ids.map(({ article_id }) => article_id) } },
                include: this.publicInclude(),
            });
            const byId = new Map(rows.map((row) => [row.articleId, row]));
            const ordered = ids.map(({ article_id }) => byId.get(article_id)).filter((row) => row !== undefined);
            const items = ordered.slice(0, page.limit);
            return {
                items: items.map((row) => this.articleCard(row)),
                pageInfo: {
                    hasNext: ordered.length > page.limit,
                    nextCursor:
                        ordered.length > page.limit
                            ? this.cursor.encode({
                                  scope,
                                  at: new Date(0).toISOString(),
                                  id: String(offset + page.limit),
                                  snapshot: snapshotAt.toISOString(),
                              })
                            : null,
                },
                snapshotAt: snapshotAt.toISOString(),
            };
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError)
                throw contentError('CONTENT_SEARCH_UNAVAILABLE', 503);
            throw error;
        }
    }

    async bookmarks(userId: string, page: PageInput): Promise<object> {
        const scope = 'bookmarks';
        const decoded = page.cursor === undefined ? undefined : this.cursor.decode(page.cursor, scope);
        const rows = await this.prisma.bookmark.findMany({
            where: {
                userId,
                ...(decoded === undefined
                    ? {}
                    : {
                          OR: [
                              { createdAt: { lt: new Date(decoded.at) } },
                              { createdAt: new Date(decoded.at), articleId: { lt: decoded.id } },
                          ],
                      }),
            },
            include: { article: { include: { publicProjection: { include: this.publicInclude() } } } },
            orderBy: [{ createdAt: 'desc' }, { articleId: 'desc' }],
            take: page.limit + 1,
        });
        const items = rows.slice(0, page.limit);
        const last = items.at(-1);
        return {
            items: items.map((bookmark) => ({
                articleId: bookmark.articleId,
                available: bookmark.article.publicProjection !== null,
                article:
                    bookmark.article.publicProjection === null
                        ? null
                        : this.articleCard(bookmark.article.publicProjection),
                createdAt: bookmark.createdAt.toISOString(),
            })),
            pageInfo: {
                hasNext: rows.length > page.limit,
                nextCursor:
                    rows.length > page.limit && last !== undefined
                        ? this.cursor.encode({ scope, at: last.createdAt.toISOString(), id: last.articleId })
                        : null,
            },
        };
    }

    async putBookmark(userId: string, articleId: string, tx: Prisma.TransactionClient): Promise<object> {
        if ((await tx.contentPublicProjection.findUnique({ where: { articleId } })) === null)
            throw contentError('ARTICLE_NOT_AVAILABLE', 404);
        const bookmark = await tx.bookmark.upsert({
            where: { userId_articleId: { userId, articleId } },
            create: { userId, articleId },
            update: {},
        });
        return { articleId, bookmarked: true, changedAt: bookmark.createdAt.toISOString() };
    }

    async removeBookmark(userId: string, articleId: string, tx: Prisma.TransactionClient): Promise<object> {
        await tx.bookmark.deleteMany({ where: { userId, articleId } });
        return {};
    }

    async listSources(page: PageInput): Promise<object> {
        const scope = 'admin-content-sources';
        const decoded = page.cursor === undefined ? undefined : this.cursor.decode(page.cursor, scope);
        const rows = await this.prisma.contentSource.findMany({
            where:
                decoded === undefined
                    ? {}
                    : {
                          OR: [
                              { createdAt: { lt: new Date(decoded.at) } },
                              { createdAt: new Date(decoded.at), id: { lt: decoded.id } },
                          ],
                      },
            include: { currentPolicy: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: page.limit + 1,
        });
        return this.keysetPage(
            rows,
            page.limit,
            scope,
            (source) => source.createdAt,
            (source) => source.id,
            (source) => this.source(source, source.currentPolicy)
        );
    }

    async createSource(actorId: string, input: SourceInput, tx: Prisma.TransactionClient): Promise<object> {
        this.assertSourceInput(input);
        const sourceId = uuidV7();
        const policyId = uuidV7();
        const source = await tx.contentSource.create({
            data: {
                id: sourceId,
                integrationKind: input.integrationKind,
                legalName: this.text(input.legalName, 200),
                displayName: this.text(input.displayName, 120),
                canonicalOrigin: this.https(input.canonicalOrigin),
                endpoint: this.https(input.endpoint),
                currentPolicyId: null,
            },
        });
        const policy = await tx.contentSourcePolicy.create({
            data: this.policyData(policyId, sourceId, actorId, input),
        });
        await tx.contentSource.update({ where: { id: sourceId }, data: { currentPolicyId: policyId } });
        await this.auditEntry(tx, actorId, 'content.source.proposed', 'CONTENT_SOURCE', sourceId, ['state', 'policy']);
        return this.source(source, policy);
    }

    async updateSource(
        actorId: string,
        sourceId: string,
        input: SourceInput,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        this.assertSourceInput(input);
        const current = await tx.contentSource.findUnique({
            where: { id: sourceId },
            include: { currentPolicy: true },
        });
        if (current === null) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        if (Number(current.version) !== input.expectedVersion) throw contentError('REVISION_CONFLICT', 409);
        if (current.state === 'REVOKED') throw contentError('INVALID_STATE_TRANSITION', 400);
        const policyId = uuidV7();
        const policy = await tx.contentSourcePolicy.create({
            data: this.policyData(policyId, sourceId, actorId, input),
        });
        const source = await tx.contentSource.update({
            where: { id: sourceId },
            data: {
                integrationKind: input.integrationKind,
                legalName: this.text(input.legalName, 200),
                displayName: this.text(input.displayName, 120),
                canonicalOrigin: this.https(input.canonicalOrigin),
                endpoint: this.https(input.endpoint),
                currentPolicyId: policyId,
                version: { increment: 1 },
                updatedAt: new Date(),
                ...(current.state === 'ENABLED' ? { state: 'PAUSED' } : {}),
            },
        });
        await this.auditEntry(tx, actorId, 'content.source.policy_versioned', 'CONTENT_SOURCE', sourceId, ['policy']);
        return this.source(source, policy);
    }

    async changeSourceState(
        actorId: string,
        sourceId: string,
        expectedVersion: number,
        state: string,
        reason: string,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        if (!SOURCE_STATES.includes(state) || state === 'PROPOSED') throw contentError('INVALID_STATE_TRANSITION', 400);
        this.assertReason(reason);
        const current = await tx.contentSource.findUnique({
            where: { id: sourceId },
            include: { currentPolicy: true },
        });
        if (!current?.currentPolicy) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        if (Number(current.version) !== expectedVersion) throw contentError('REVISION_CONFLICT', 409);
        this.assertSourceTransition(current.state, state);
        if (state === 'ENABLED' && !this.currentRights(current.currentPolicy)) throw contentError('RIGHTS_HOLD', 409);
        if (state === 'REVOKED') await this.unpublishForSource(tx, actorId, sourceId, reason);
        const source = await tx.contentSource.update({
            where: { id: sourceId },
            data: {
                state: state as ContentSource['state'],
                version: { increment: 1 },
                reviewedByUserId: actorId,
                updatedAt: new Date(),
            },
        });
        await this.auditEntry(
            tx,
            actorId,
            `content.source.${state.toLowerCase()}`,
            'CONTENT_SOURCE',
            sourceId,
            ['state'],
            reason
        );
        return this.source(source, current.currentPolicy);
    }

    async pauseSource(
        actorId: string,
        sourceId: string,
        expectedVersion: number,
        reason: string,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const current = await tx.contentSource.findUnique({
            where: { id: sourceId },
            include: { currentPolicy: true },
        });
        if (!current?.currentPolicy) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        if (Number(current.version) !== expectedVersion) throw contentError('REVISION_CONFLICT', 409);
        if (current.state === 'REVOKED') throw contentError('INVALID_STATE_TRANSITION', 400);
        const source =
            current.state === 'PAUSED'
                ? current
                : await tx.contentSource.update({
                      where: { id: sourceId },
                      data: { state: 'PAUSED', version: { increment: 1 }, updatedAt: new Date() },
                  });
        await this.auditEntry(tx, actorId, 'content.source.paused', 'CONTENT_SOURCE', sourceId, ['state'], reason);
        return this.source(source, current.currentPolicy);
    }

    async listCandidates(page: PageInput, state?: string): Promise<object> {
        if (state !== undefined && !CANDIDATE_STATES.includes(state)) throw contentError('VALIDATION_FAILED', 400);
        const scope = this.scope('admin-content-candidates', state);
        const decoded = page.cursor === undefined ? undefined : this.cursor.decode(page.cursor, scope);
        const rows = await this.prisma.ingestCandidate.findMany({
            where: {
                ...(state === undefined ? {} : { state: state as IngestCandidate['state'] }),
                ...(decoded === undefined
                    ? {}
                    : {
                          OR: [
                              { createdAt: { lt: new Date(decoded.at) } },
                              { createdAt: new Date(decoded.at), id: { lt: decoded.id } },
                          ],
                      }),
            },
            include: { currentRevision: { include: { sourcePolicy: true } } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: page.limit + 1,
        });
        return this.keysetPage(
            rows,
            page.limit,
            scope,
            (candidate) => candidate.createdAt,
            (candidate) => candidate.id,
            (candidate) => this.candidate(candidate, candidate.currentRevision)
        );
    }

    async candidateById(candidateId: string): Promise<object> {
        const candidate = await this.prisma.ingestCandidate.findUnique({
            where: { id: candidateId },
            include: { currentRevision: { include: { sourcePolicy: true } } },
        });
        if (candidate === null) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        return this.candidate(candidate, candidate.currentRevision);
    }

    async decideCandidate(
        actorId: string,
        candidateId: string,
        input: JsonRecord,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        this.assertExact(input, [
            'expectedVersion',
            'state',
            'duplicateGroupId',
            'duplicateKind',
            'selectedArticleId',
            'reason',
        ]);
        const candidate = await tx.ingestCandidate.findUnique({
            where: { id: candidateId },
            include: { currentRevision: { include: { sourcePolicy: true } } },
        });
        if (candidate === null) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        if (!Number.isInteger(input.expectedVersion) || Number(input.expectedVersion) < 0)
            throw contentError('VALIDATION_FAILED', 400);
        if (Number(candidate.version) !== input.expectedVersion) throw contentError('REVISION_CONFLICT', 409);
        if (candidate.state === 'SELECTED' || candidate.state === 'DISMISSED')
            throw contentError('INVALID_STATE_TRANSITION', 400);
        const state = String(input.state);
        this.assertReason(input.reason);
        if (!CANDIDATE_STATES.includes(state) || state === 'NEW') throw contentError('INVALID_STATE_TRANSITION', 400);
        if (state === 'SELECTED' && typeof input.selectedArticleId !== 'string')
            throw contentError('VALIDATION_FAILED', 400);
        if (
            state === 'DUPLICATE' &&
            (typeof input.duplicateGroupId !== 'string' || typeof input.duplicateKind !== 'string')
        )
            throw contentError('VALIDATION_FAILED', 400);
        const updated = await tx.ingestCandidate.update({
            where: { id: candidateId },
            data: {
                state: state as IngestCandidate['state'],
                version: { increment: 1 },
                updatedAt: new Date(),
                duplicateGroupId: state === 'DUPLICATE' ? String(input.duplicateGroupId) : null,
                duplicateKind:
                    state === 'DUPLICATE' ? (String(input.duplicateKind) as IngestCandidate['duplicateKind']) : null,
                selectedArticleId: state === 'SELECTED' ? String(input.selectedArticleId) : null,
            },
        });
        await this.auditEntry(
            tx,
            actorId,
            'content.candidate.decided',
            'INGEST_CANDIDATE',
            candidateId,
            ['state'],
            input.reason
        );
        return this.candidate(updated, candidate.currentRevision);
    }

    async createArticle(
        actorId: string,
        originKind: string,
        candidateId: string | undefined,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        if (originKind !== 'ORIGINAL' && originKind !== 'DERIVED') throw contentError('VALIDATION_FAILED', 400);
        if (candidateId !== undefined && !UUID.test(candidateId)) throw contentError('VALIDATION_FAILED', 400);
        if (originKind === 'DERIVED' && candidateId === undefined) throw contentError('ORIGIN_REQUIRED', 422);
        const article = await tx.article.create({
            data: { id: uuidV7(), originKind, createdByUserId: actorId },
        });
        if (candidateId !== undefined) {
            const result = await tx.ingestCandidate.updateMany({
                where: { id: candidateId, state: { in: ['NEW', 'DUPLICATE'] }, selectedArticleId: null },
                data: {
                    state: 'SELECTED',
                    selectedArticleId: article.id,
                    version: { increment: 1 },
                    updatedAt: new Date(),
                },
            });
            if (result.count !== 1) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        }
        await this.auditEntry(tx, actorId, 'content.article.created', 'ARTICLE', article.id, ['originKind']);
        return this.adminArticle(article);
    }

    async listArticles(page: PageInput, state?: string): Promise<object> {
        if (state !== undefined && !ARTICLE_STATES.includes(state)) throw contentError('VALIDATION_FAILED', 400);
        const scope = this.scope('admin-content-articles', state);
        const decoded = page.cursor === undefined ? undefined : this.cursor.decode(page.cursor, scope);
        const rows = await this.prisma.article.findMany({
            where: {
                ...(state === undefined ? {} : { state: state as Article['state'] }),
                ...(decoded === undefined
                    ? {}
                    : {
                          OR: [
                              { updatedAt: { lt: new Date(decoded.at) } },
                              { updatedAt: new Date(decoded.at), id: { lt: decoded.id } },
                          ],
                      }),
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: page.limit + 1,
        });
        return this.keysetPage(
            rows,
            page.limit,
            scope,
            (article) => article.updatedAt,
            (article) => article.id,
            (article) => this.adminArticle(article)
        );
    }

    async adminArticleById(articleId: string): Promise<object> {
        const article = await this.prisma.article.findUnique({ where: { id: articleId } });
        if (article === null) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        return this.adminArticle(article);
    }

    async revisions(articleId: string, page: PageInput): Promise<object> {
        const scope = this.scope('admin-content-revisions', articleId);
        const decoded = page.cursor === undefined ? undefined : this.cursor.decode(page.cursor, scope);
        if (decoded !== undefined && !/^[1-9][0-9]*$/u.test(decoded.id)) throw contentError('INVALID_CURSOR', 400);
        const beforeRevision = decoded === undefined ? undefined : BigInt(decoded.id);
        const rows = await this.prisma.articleRevision.findMany({
            where: { articleId, ...(beforeRevision === undefined ? {} : { revision: { lt: beforeRevision } }) },
            orderBy: { revision: 'desc' },
            take: page.limit + 1,
        });
        const items = rows.slice(0, page.limit);
        const last = items.at(-1);
        return {
            items: items.map((revision) => this.revisionSummary(revision)),
            pageInfo: {
                hasNext: rows.length > page.limit,
                nextCursor:
                    rows.length > page.limit && last !== undefined
                        ? this.cursor.encode({ scope, at: last.createdAt.toISOString(), id: String(last.revision) })
                        : null,
            },
        };
    }

    async revision(articleId: string, revisionId: string): Promise<object> {
        const revision = await this.prisma.articleRevision.findFirst({
            where: { id: revisionId, articleId },
            include: this.revisionInclude(),
        });
        if (revision === null) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        return this.articleRevision(revision);
    }

    async createRevision(
        actorId: string,
        articleId: string,
        input: RevisionInput,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        assertSafeRichText(input.body);
        this.assertRevisionInput(input);
        const article = await tx.article.findUnique({ where: { id: articleId } });
        if (article === null) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        if (Number(article.version) !== input.expectedArticleVersion) throw contentError('REVISION_CONFLICT', 409);
        if (article.originKind !== input.originKind) throw contentError('VALIDATION_FAILED', 400);
        if (input.originKind === 'DERIVED' && input.origins.length === 0) throw contentError('ORIGIN_REQUIRED', 422);
        if (input.originKind === 'ORIGINAL' && input.origins.length !== 0) throw contentError('VALIDATION_FAILED', 400);
        if (input.media.length !== 0) throw contentError('RIGHTS_HOLD', 409);
        const existing = await tx.articleRevision.findFirst({ where: { articleId }, orderBy: { revision: 'desc' } });
        const revisionId = uuidV7();
        const revision = await tx.articleRevision.create({
            data: {
                id: revisionId,
                articleId,
                revision: (existing?.revision ?? 0n) + 1n,
                locale: input.locale,
                slug: input.slug,
                title: this.text(input.title, 300),
                subtitle: input.subtitle === undefined ? null : this.text(input.subtitle, 300),
                summary: this.text(input.summary, 600),
                body: input.body as unknown as Prisma.InputJsonValue,
                bodyHash: richTextHash(input.body),
                categoryId: input.categoryId,
                originKind: input.originKind,
                seoTitle: this.text(String(input.seo.title), 70),
                seoDescription: this.text(String(input.seo.description), 170),
                canonicalUrl: this.https(String(input.seo.canonicalUrl)),
                correctionNote: input.correctionNote === undefined ? null : this.text(input.correctionNote, 1000),
                translationOfRevisionId: input.translationOfRevisionId ?? null,
                changedFields: this.changedFields(existing, input),
                createdByUserId: actorId,
            },
        });
        for (const tagId of [...new Set(input.tagIds)]) {
            await tx.articleRevisionTag.create({ data: { articleRevisionId: revisionId, tagId } });
        }
        for (const origin of input.origins) await this.createOrigin(tx, revisionId, origin);
        await tx.article.update({
            where: { id: articleId },
            data: {
                currentDraftRevisionId: revisionId,
                version: { increment: 1 },
                updatedAt: new Date(),
                ...(article.state === 'ARCHIVED' || article.state === 'UNPUBLISHED' || article.state === 'APPROVED'
                    ? { state: 'DRAFT' }
                    : {}),
            },
        });
        await this.auditEntry(
            tx,
            actorId,
            'content.article.revision_created',
            'ARTICLE',
            articleId,
            revision.changedFields
        );
        const hydrated = await tx.articleRevision.findUnique({
            where: { id: revisionId },
            include: this.revisionInclude(),
        });
        if (hydrated === null) throw new Error('Created content revision is missing');
        return this.articleRevision(hydrated);
    }

    async decideArticle(
        actorId: string,
        articleId: string,
        input: DecisionInput,
        tx: Prisma.TransactionClient,
        operationId = uuidV7()
    ): Promise<object> {
        this.assertExact(input, [
            'expectedArticleVersion',
            'revisionId',
            'decision',
            'reason',
            'checklist',
            'scheduledFor',
            'reauthenticationProof',
        ]);
        this.assertReason(input.reason);
        if (
            !Number.isInteger(input.expectedArticleVersion) ||
            input.expectedArticleVersion < 0 ||
            !UUID.test(input.revisionId) ||
            ![
                'SUBMIT_REVIEW',
                'RETURN_TO_DRAFT',
                'APPROVE',
                'SCHEDULE',
                'CANCEL_SCHEDULE',
                'PUBLISH',
                'UNPUBLISH',
                'ARCHIVE',
            ].includes(input.decision)
        )
            throw contentError('VALIDATION_FAILED', 400);
        const article = await tx.article.findUnique({ where: { id: articleId } });
        const revision = await tx.articleRevision.findFirst({
            where: { id: input.revisionId, articleId },
            include: this.revisionInclude(),
        });
        if (article === null || revision === null) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        if (Number(article.version) !== input.expectedArticleVersion) throw contentError('REVISION_CONFLICT', 409);
        const transition = this.transition(article.state, input.decision);
        const checklist = this.checklist(input.decision, input.checklist);
        if (['APPROVE', 'SCHEDULE', 'PUBLISH'].includes(input.decision)) this.assertPublishable(revision);
        const scheduledFor = input.decision === 'SCHEDULE' ? this.scheduleTime(input.scheduledFor) : null;
        const nextVersion = article.version + 1n;
        const decision = await tx.contentPublicationDecision.create({
            data: {
                id: uuidV7(),
                articleId,
                articleRevisionId: revision.id,
                articleVersion: nextVersion,
                decision: input.decision as ContentPublicationDecision['decision'],
                reasonCode: input.reason,
                checklistVersion: checklist === null ? null : this.checklistVersion(),
                ...(checklist === null ? {} : { checklist: checklist as Prisma.InputJsonValue }),
                actorUserId: actorId,
                reviewerUserId: ['APPROVE', 'SCHEDULE', 'PUBLISH'].includes(input.decision) ? actorId : null,
                selfReview: checklist?.selfReview === true,
                scheduledFor,
                operationId,
            },
        });
        const update: Prisma.ArticleUpdateInput = {
            state: transition,
            version: nextVersion,
            updatedAt: new Date(),
        };
        if (input.decision === 'SUBMIT_REVIEW') update.currentDraftRevision = { connect: { id: revision.id } };
        if (input.decision === 'APPROVE') update.approvedRevision = { connect: { id: revision.id } };
        if (input.decision === 'SCHEDULE') {
            update.scheduledRevision = { connect: { id: revision.id } };
            update.scheduledFor = scheduledFor;
        }
        if (input.decision === 'CANCEL_SCHEDULE') {
            update.scheduledRevision = { disconnect: true };
            update.scheduledFor = null;
        }
        if (input.decision === 'PUBLISH') {
            update.publishedRevision = { connect: { id: revision.id } };
            update.scheduledRevision = { disconnect: true };
            update.scheduledFor = null;
            update.firstPublishedAt = article.firstPublishedAt ?? new Date();
        }
        if (input.decision === 'UNPUBLISH') update.publishedRevision = { disconnect: true };
        await tx.article.update({ where: { id: articleId }, data: update });
        if (input.decision === 'PUBLISH') await this.publishProjection(tx, article, revision, decision);
        if (input.decision === 'UNPUBLISH') await this.removeProjection(tx, article, revision, nextVersion);
        await this.auditEntry(
            tx,
            actorId,
            `content.article.${input.decision.toLowerCase()}`,
            'ARTICLE',
            articleId,
            ['state', 'revisionPointer'],
            input.reason,
            operationId
        );
        return this.publicationDecision(decision);
    }

    async publishScheduled(): Promise<number> {
        const due = await this.prisma.article.findMany({
            where: { state: 'SCHEDULED', scheduledFor: { lte: new Date() }, scheduledRevisionId: { not: null } },
            orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
            take: 50,
        });
        let published = 0;
        for (const article of due) {
            if (article.scheduledRevisionId === null) continue;
            try {
                await this.prisma.$transaction(
                    async (tx) => {
                        await tx.$executeRaw`SELECT id FROM content_articles WHERE id = ${article.id}::uuid FOR UPDATE`;
                        const current = await tx.article.findUnique({ where: { id: article.id } });
                        if (
                            current?.state !== 'SCHEDULED' ||
                            current.scheduledRevisionId !== article.scheduledRevisionId ||
                            current.scheduledFor === null ||
                            current.scheduledFor > new Date()
                        )
                            return;
                        if (current.scheduledRevisionId === null) return;
                        const scheduledRevisionId = current.scheduledRevisionId;
                        const scheduledFor = current.scheduledFor;
                        const scheduleDecision = await tx.contentPublicationDecision.findFirst({
                            where: {
                                articleId: current.id,
                                articleRevisionId: scheduledRevisionId,
                                decision: 'SCHEDULE',
                                scheduledFor,
                            },
                            orderBy: { committedAt: 'desc' },
                        });
                        if (
                            scheduleDecision === null ||
                            typeof scheduleDecision.checklist !== 'object' ||
                            scheduleDecision.checklist === null ||
                            Array.isArray(scheduleDecision.checklist)
                        )
                            throw contentError('CHECKLIST_REQUIRED', 422);
                        await this.decideArticle(
                            scheduleDecision.actorUserId,
                            current.id,
                            {
                                expectedArticleVersion: Number(current.version),
                                revisionId: scheduledRevisionId,
                                decision: 'PUBLISH',
                                reason: 'EDITORIAL_READY',
                                checklist: scheduleDecision.checklist as JsonRecord,
                            },
                            tx,
                            this.schedulerOperationId(current.id, scheduledRevisionId, scheduledFor)
                        );
                        published += 1;
                    },
                    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
                );
            } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
                throw error;
            }
        }
        return published;
    }

    async purgeExpiredData(): Promise<{ receipts: number; excerpts: number }> {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
        const [receipts, excerpts] = await this.prisma.$transaction([
            this.prisma.contentOperationReceipt.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
            this.prisma.$executeRaw`
                UPDATE ingest_candidate_revisions r SET excerpt = NULL
                FROM ingest_candidates c
                WHERE r.candidate_id = c.id
                  AND (
                      (c.state IN ('DISMISSED', 'DUPLICATE') AND r.created_at <= ${cutoff})
                      OR (
                          c.state = 'SELECTED'
                          AND EXISTS (
                              SELECT 1 FROM content_articles a
                              WHERE a.id = c.selected_article_id AND a.state = 'PUBLISHED'
                          )
                      )
                  )`,
        ]);
        return { receipts: receipts.count, excerpts };
    }

    private async publishProjection(
        tx: Prisma.TransactionClient,
        article: Article,
        revision: ArticleRevision,
        decision: ContentPublicationDecision
    ): Promise<void> {
        const slug = await tx.contentCanonicalSlug.findUnique({
            where: { locale_slug: { locale: revision.locale, slug: revision.slug } },
        });
        if (slug !== null && slug.articleId !== article.id) throw contentError('SLUG_CONFLICT', 409);
        if (slug === null) {
            const old = await tx.contentCanonicalSlug.findFirst({
                where: { articleId: article.id, locale: revision.locale, active: true },
            });
            const created = await tx.contentCanonicalSlug.create({
                data: { id: uuidV7(), articleId: article.id, locale: revision.locale, slug: revision.slug },
            });
            if (old !== null) {
                await tx.contentCanonicalSlug.update({
                    where: { id: old.id },
                    data: { active: false, replacedById: created.id },
                });
            }
        }
        const publishedAt = new Date();
        const searchText = [
            revision.title,
            revision.subtitle,
            revision.summary,
            richTextPlainText(revision.body as unknown as SafeRichTextDocument),
        ]
            .filter(Boolean)
            .join(' ');
        await tx.$executeRaw`
            INSERT INTO content_public_projections
                (article_id, article_revision_id, publication_decision_id, locale, slug, published_at, updated_at, search_document)
            VALUES (${article.id}::uuid, ${revision.id}::uuid, ${decision.id}::uuid, ${revision.locale}, ${revision.slug},
                    ${publishedAt}, ${publishedAt}, to_tsvector('simple', ${searchText}))
            ON CONFLICT (article_id) DO UPDATE SET
                article_revision_id = EXCLUDED.article_revision_id,
                publication_decision_id = EXCLUDED.publication_decision_id,
                locale = EXCLUDED.locale,
                slug = EXCLUDED.slug,
                published_at = EXCLUDED.published_at,
                updated_at = EXCLUDED.updated_at,
                search_document = EXCLUDED.search_document`;
        await this.event(
            tx,
            'content.article.published.v1',
            article.id,
            revision.id,
            decision.articleVersion,
            'PUBLISHED'
        );
    }

    private async removeProjection(
        tx: Prisma.TransactionClient,
        article: Article,
        revision: ArticleRevision,
        version: bigint
    ): Promise<void> {
        await tx.contentPublicProjection.deleteMany({ where: { articleId: article.id } });
        await this.event(tx, 'content.article.unpublished.v1', article.id, revision.id, version, 'UNPUBLISHED');
    }

    private async event(
        tx: Prisma.TransactionClient,
        type: string,
        articleId: string,
        revisionId: string,
        version: bigint,
        outcome: string
    ): Promise<void> {
        const correlationId = this.context.get()?.correlationId ?? uuidV7();
        const occurredAt = new Date();
        await this.outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: occurredAt.toISOString(),
                correlationId,
                causationId: null,
                data: { articleId, revisionId, articleVersion: version.toString(), outcome },
            },
            correlationId,
            occurredAt,
        });
    }

    private async unpublishForSource(
        tx: Prisma.TransactionClient,
        actorId: string,
        sourceId: string,
        reason: string
    ): Promise<void> {
        const affected = await tx.article.findMany({
            where: { state: 'PUBLISHED', publishedRevision: { origins: { some: { sourceId } } } },
        });
        for (const article of affected) {
            if (article.publishedRevisionId === null) continue;
            const revision = await tx.articleRevision.findUnique({ where: { id: article.publishedRevisionId } });
            if (revision === null) continue;
            const nextVersion = article.version + 1n;
            await tx.contentPublicProjection.deleteMany({ where: { articleId: article.id } });
            await tx.article.update({
                where: { id: article.id },
                data: { state: 'UNPUBLISHED', publishedRevisionId: null, version: nextVersion, updatedAt: new Date() },
            });
            await tx.contentPublicationDecision.create({
                data: {
                    id: uuidV7(),
                    articleId: article.id,
                    articleRevisionId: revision.id,
                    articleVersion: nextVersion,
                    decision: 'UNPUBLISH',
                    reasonCode: reason,
                    actorUserId: actorId,
                    operationId: uuidV7(),
                },
            });
            await this.event(tx, 'content.article.unpublished.v1', article.id, revision.id, nextVersion, 'UNPUBLISHED');
        }
    }

    private transition(state: string, decision: string): Article['state'] {
        const transitions: Record<string, Partial<Record<string, Article['state']>>> = {
            DRAFT: { SUBMIT_REVIEW: 'IN_REVIEW' },
            IN_REVIEW: { RETURN_TO_DRAFT: 'DRAFT', APPROVE: 'APPROVED' },
            APPROVED: { SCHEDULE: 'SCHEDULED', PUBLISH: 'PUBLISHED', RETURN_TO_DRAFT: 'DRAFT' },
            SCHEDULED: { CANCEL_SCHEDULE: 'APPROVED', PUBLISH: 'PUBLISHED', UNPUBLISH: 'UNPUBLISHED' },
            PUBLISHED: { UNPUBLISH: 'UNPUBLISHED' },
            UNPUBLISHED: { RETURN_TO_DRAFT: 'DRAFT', ARCHIVE: 'ARCHIVED' },
            ARCHIVED: { RETURN_TO_DRAFT: 'DRAFT' },
        };
        const result = transitions[state]?.[decision];
        if (result === undefined) throw contentError('INVALID_STATE_TRANSITION', 400);
        return result;
    }

    private assertSourceTransition(current: ContentSource['state'], next: string): void {
        const transitions: Record<ContentSource['state'], readonly ContentSource['state'][]> = {
            PROPOSED: ['ENABLED', 'PAUSED', 'REVOKED'],
            ENABLED: ['PAUSED', 'REVOKED'],
            PAUSED: ['ENABLED', 'REVOKED'],
            REVOKED: [],
        };
        if (!transitions[current].includes(next as ContentSource['state']))
            throw contentError('INVALID_STATE_TRANSITION', 400);
    }

    private currentRights(policy: ContentSourcePolicy): boolean {
        const now = new Date();
        return (
            policy.validFrom <= now &&
            (policy.validUntil === null || policy.validUntil > now) &&
            policy.reviewDueAt > now &&
            policy.legalReview === 'APPROVED' &&
            policy.securityReview === 'APPROVED' &&
            policy.privacyReview === 'APPROVED' &&
            policy.commercialReview === 'APPROVED' &&
            policy.useClasses.includes('FETCH_METADATA') &&
            policy.useClasses.includes('STORE_METADATA')
        );
    }

    private checklist(decision: string, value?: JsonRecord): JsonRecord | null {
        if (!['APPROVE', 'SCHEDULE', 'PUBLISH'].includes(decision)) return null;
        const required = [
            'factsChecked',
            'textRightsChecked',
            'mediaRightsChecked',
            'attributionChecked',
            'privacyChecked',
            'accessibilityChecked',
            'languageChecked',
        ];
        if (
            value === undefined ||
            value.version !== this.checklistVersion() ||
            !required.every((key) => value[key] === true) ||
            typeof value.selfReview !== 'boolean'
        )
            throw contentError('CHECKLIST_REQUIRED', 422);
        return value;
    }

    private assertPublishable(revision: RevisionWithRelations): void {
        assertSafeRichText(revision.body);
        if (!revision.category.visible || revision.category.locale !== revision.locale)
            throw contentError('CHECKLIST_REQUIRED', 422);
        if (revision.tags.some(({ tag }) => !tag.visible || tag.locale !== revision.locale))
            throw contentError('CHECKLIST_REQUIRED', 422);
        if (revision.media.length > 0 && this.environment.CONTENT_MEDIA_BASE_URL === undefined)
            throw contentError('RIGHTS_HOLD', 409);
        if (revision.canonicalUrl !== this.canonicalUrl(revision.locale, revision.slug))
            throw contentError('CHECKLIST_REQUIRED', 422);
        if (revision.originKind === 'DERIVED') {
            if (revision.origins.length === 0) throw contentError('ORIGIN_REQUIRED', 422);
            const now = new Date();
            if (
                revision.origins.some(
                    ({ source, sourcePolicy }) =>
                        source.state !== 'ENABLED' ||
                        source.currentPolicyId !== sourcePolicy.id ||
                        sourcePolicy.reviewDueAt <= now ||
                        sourcePolicy.validFrom > now ||
                        (sourcePolicy.validUntil !== null && sourcePolicy.validUntil <= now) ||
                        [
                            sourcePolicy.legalReview,
                            sourcePolicy.securityReview,
                            sourcePolicy.privacyReview,
                            sourcePolicy.commercialReview,
                        ].some((review) => review !== 'APPROVED')
                )
            )
                throw contentError('RIGHTS_HOLD', 409);
        }
    }

    private scheduleTime(value?: string): Date {
        const scheduled = value === undefined ? new Date(Number.NaN) : new Date(value);
        if (Number.isNaN(scheduled.getTime()) || scheduled <= new Date()) throw contentError('VALIDATION_FAILED', 400);
        return scheduled;
    }

    private schedulerOperationId(articleId: string, revisionId: string, scheduledFor: Date): string {
        const hash = createHash('sha256')
            .update(`CONTENT_SCHEDULE:${articleId}:${revisionId}:${scheduledFor.toISOString()}`)
            .digest('hex');
        return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    }

    private assertSourceInput(input: SourceInput): void {
        this.assertExact(input, [
            'expectedVersion',
            'integrationKind',
            'legalName',
            'displayName',
            'canonicalOrigin',
            'endpoint',
            'attributionTemplate',
            'licenseNotice',
            'policyVersion',
            'rights',
        ]);
        this.assertExact(input.rights, [
            'useClasses',
            'maximumExcerptCharacters',
            'fullTextLicenseEvidenceId',
            'mediaLicenseEvidenceId',
            'termsUrl',
            'termsVersion',
            'rightsBasis',
            'territory',
            'languages',
            'validFrom',
            'validUntil',
            'reviewedAt',
            'reviewDueAt',
            'legalReview',
            'securityReview',
            'privacyReview',
            'commercialReview',
        ]);
        const useClasses = input.rights.useClasses;
        const reviews = [
            input.rights.legalReview,
            input.rights.securityReview,
            input.rights.privacyReview,
            input.rights.commercialReview,
        ];
        if (
            !Number.isInteger(input.expectedVersion) ||
            input.expectedVersion < 0 ||
            !['RSS', 'API'].includes(input.integrationKind) ||
            !/^[1-9][0-9]*\.[0-9]+\.[0-9]+$/u.test(input.policyVersion) ||
            typeof input.rights !== 'object' ||
            !Array.isArray(useClasses) ||
            useClasses.some((value) => typeof value !== 'string' || !USE_CLASSES.has(value)) ||
            new Set(useClasses).size !== useClasses.length ||
            !Number.isInteger(input.rights.maximumExcerptCharacters) ||
            Number(input.rights.maximumExcerptCharacters) < 0 ||
            Number(input.rights.maximumExcerptCharacters) > 2000 ||
            reviews.some((value) => typeof value !== 'string' || !REVIEW_STATES.has(value)) ||
            !Array.isArray(input.rights.languages) ||
            input.rights.languages.some((value) => typeof value !== 'string') ||
            ((useClasses.includes('STORE_FULL_TEXT') || useClasses.includes('PUBLISH_FULL_TEXT')) &&
                typeof input.rights.fullTextLicenseEvidenceId !== 'string') ||
            ((useClasses.includes('STORE_MEDIA') || useClasses.includes('PUBLISH_MEDIA')) &&
                typeof input.rights.mediaLicenseEvidenceId !== 'string')
        )
            throw contentError('VALIDATION_FAILED', 400);
        this.https(input.canonicalOrigin);
        this.https(input.endpoint);
    }

    private policyData(
        id: string,
        sourceId: string,
        actorId: string,
        input: SourceInput
    ): Prisma.ContentSourcePolicyUncheckedCreateInput {
        const rights = input.rights;
        const useClasses = Array.isArray(rights.useClasses)
            ? rights.useClasses.filter((value): value is string => typeof value === 'string')
            : [];
        const validFrom = new Date(String(rights.validFrom));
        const validUntilValue = this.optionalString(rights.validUntil);
        const reviewedAtValue = this.optionalString(rights.reviewedAt);
        const validUntil = validUntilValue === null ? null : new Date(validUntilValue);
        const reviewedAt = reviewedAtValue === null ? null : new Date(reviewedAtValue);
        const reviewDueAt = new Date(String(rights.reviewDueAt));
        if (
            [
                validFrom,
                reviewDueAt,
                ...(validUntil === null ? [] : [validUntil]),
                ...(reviewedAt === null ? [] : [reviewedAt]),
            ].some((date) => Number.isNaN(date.getTime()))
        )
            throw contentError('VALIDATION_FAILED', 400);
        return {
            id,
            sourceId,
            version: input.policyVersion,
            useClasses,
            maximumExcerptCharacters: Number(rights.maximumExcerptCharacters),
            fullTextLicenseEvidenceId:
                typeof rights.fullTextLicenseEvidenceId === 'string' ? rights.fullTextLicenseEvidenceId : null,
            mediaLicenseEvidenceId:
                typeof rights.mediaLicenseEvidenceId === 'string' ? rights.mediaLicenseEvidenceId : null,
            termsUrl: this.https(String(rights.termsUrl)),
            termsVersion: this.text(String(rights.termsVersion), 120),
            rightsBasis: this.text(String(rights.rightsBasis), 500),
            attributionTemplate: this.text(input.attributionTemplate, 500),
            licenseNotice: input.licenseNotice === undefined ? null : this.text(input.licenseNotice, 500),
            territory: this.text(String(rights.territory), 120),
            languages: Array.isArray(rights.languages) ? rights.languages.map(String) : [],
            validFrom,
            validUntil,
            reviewedAt,
            reviewDueAt,
            legalReview: String(rights.legalReview) as ContentSourcePolicy['legalReview'],
            securityReview: String(rights.securityReview) as ContentSourcePolicy['securityReview'],
            privacyReview: String(rights.privacyReview) as ContentSourcePolicy['privacyReview'],
            commercialReview: String(rights.commercialReview) as ContentSourcePolicy['commercialReview'],
            evidenceCiphertext: this.crypto.encrypt(JSON.stringify({ policyVersion: input.policyVersion, rights })),
            encryptionKeyVersion: 1,
            createdByUserId: actorId,
        };
    }

    private assertRevisionInput(input: RevisionInput): void {
        this.assertExact(input, [
            'expectedArticleVersion',
            'locale',
            'slug',
            'title',
            'subtitle',
            'summary',
            'body',
            'categoryId',
            'tagIds',
            'originKind',
            'origins',
            'media',
            'seo',
            'correctionNote',
            'translationOfRevisionId',
        ]);
        this.assertExact(input.seo, ['title', 'description', 'canonicalUrl', 'indexable', 'openGraphImageUrl']);
        if (!Array.isArray(input.tagIds) || !Array.isArray(input.origins) || !Array.isArray(input.media))
            throw contentError('VALIDATION_FAILED', 400);
        for (const origin of input.origins)
            this.assertExact(origin, [
                'id',
                'sourceId',
                'sourcePolicyVersion',
                'candidateRevisionId',
                'originalTitle',
                'originalAuthor',
                'originalPublisher',
                'canonicalUrl',
                'originallyPublishedAt',
                'receivedAt',
                'transformationKind',
                'rightsBasis',
                'licenseNotice',
            ]);
        if (
            !Number.isInteger(input.expectedArticleVersion) ||
            input.expectedArticleVersion < 0 ||
            typeof input.locale !== 'string' ||
            input.locale.length < 2 ||
            input.locale.length > 35 ||
            typeof input.slug !== 'string' ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.slug) ||
            input.slug.length > 96 ||
            input.tagIds.length > 20 ||
            input.origins.length > 20 ||
            input.media.length > 20 ||
            input.tagIds.some((tagId) => typeof tagId !== 'string' || !UUID.test(tagId)) ||
            typeof input.seo.canonicalUrl !== 'string' ||
            !input.seo.canonicalUrl.startsWith('https://') ||
            input.origins.some(
                (origin) =>
                    typeof origin.sourceId !== 'string' ||
                    !UUID.test(origin.sourceId) ||
                    typeof origin.sourcePolicyVersion !== 'string' ||
                    !/^[1-9][0-9]*\.[0-9]+\.[0-9]+$/u.test(origin.sourcePolicyVersion)
            )
        )
            throw contentError('VALIDATION_FAILED', 400);
    }

    private async createOrigin(tx: Prisma.TransactionClient, revisionId: string, origin: JsonRecord): Promise<void> {
        const sourceId = String(origin.sourceId);
        const sourcePolicy = await tx.contentSourcePolicy.findFirst({
            where: { sourceId, version: String(origin.sourcePolicyVersion) },
        });
        if (sourcePolicy === null) throw contentError('RIGHTS_HOLD', 409);
        const source = await tx.contentSource.findUnique({ where: { id: sourceId } });
        if (source === null) throw contentError('RIGHTS_HOLD', 409);
        const canonicalUrl = this.https(String(origin.canonicalUrl));
        await tx.articleOrigin.create({
            data: {
                id: uuidV7(),
                articleRevisionId: revisionId,
                sourceId,
                sourcePolicyId: sourcePolicy.id,
                candidateRevisionId: typeof origin.candidateRevisionId === 'string' ? origin.candidateRevisionId : null,
                originalTitle: this.text(String(origin.originalTitle), 300),
                originalAuthor: this.optionalText(origin.originalAuthor, 200),
                originalPublisher: this.optionalText(origin.originalPublisher, 200),
                canonicalUrl,
                canonicalUrlHash: this.hash(canonicalUrl),
                originallyPublishedAt: this.optionalDate(origin.originallyPublishedAt),
                receivedAt: new Date(String(origin.receivedAt)),
                transformationKind: String(
                    origin.transformationKind
                ) as Prisma.ArticleOriginUncheckedCreateInput['transformationKind'],
                rightsBasis: this.text(String(origin.rightsBasis), 500),
                attributionText: sourcePolicy.attributionTemplate,
                licenseNotice: this.optionalText(origin.licenseNotice, 500),
            },
        });
    }

    private changedFields(previous: ArticleRevision | null, input: RevisionInput): string[] {
        if (previous === null)
            return ['body', 'category', 'locale', 'origins', 'seo', 'slug', 'summary', 'tags', 'title'];
        const changed: string[] = [];
        const comparisons: [string, unknown, unknown][] = [
            ['locale', previous.locale, input.locale],
            ['slug', previous.slug, input.slug],
            ['title', previous.title, input.title],
            ['subtitle', previous.subtitle, input.subtitle ?? null],
            ['summary', previous.summary, input.summary],
            ['body', previous.bodyHash, richTextHash(input.body as SafeRichTextDocument)],
            ['category', previous.categoryId, input.categoryId],
            ['seo', previous.canonicalUrl, input.seo.canonicalUrl],
            ['origins', null, input.origins],
            ['tags', null, input.tagIds],
        ];
        for (const [name, before, after] of comparisons)
            if (JSON.stringify(before) !== JSON.stringify(after)) changed.push(name);
        return changed;
    }

    private articleCard(row: ProjectionWithRelations): object {
        const revision = row.articleRevision;
        return {
            id: row.articleId,
            version: Number(row.article.version),
            locale: row.locale,
            slug: row.slug,
            title: revision.title,
            subtitle: revision.subtitle,
            summary: revision.summary,
            category: {
                id: revision.category.id,
                slug: revision.category.slug,
                locale: revision.category.locale,
                name: revision.category.name,
            },
            tags: revision.tags.map(({ tag }) => ({ id: tag.id, slug: tag.slug, locale: tag.locale, name: tag.name })),
            originKind: revision.originKind,
            attribution: revision.origins.map(({ source, sourcePolicy, ...origin }) => ({
                sourceId: source.id,
                sourceDisplayName: source.displayName,
                originalTitle: origin.originalTitle,
                originalAuthor: origin.originalAuthor,
                originalPublisher: origin.originalPublisher,
                canonicalUrl: origin.canonicalUrl,
                originallyPublishedAt: origin.originallyPublishedAt?.toISOString() ?? null,
                licenseNotice: origin.licenseNotice,
                transformationKind: origin.transformationKind,
                sourceAvailable: source.state === 'ENABLED' && source.currentPolicyId === sourcePolicy.id,
            })),
            coverMedia: revision.media[0] === undefined ? null : this.media(revision.media[0]),
            publishedAt: row.publishedAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        };
    }

    private source(source: ContentSource, policy: ContentSourcePolicy | null): object {
        if (policy === null) throw new Error('Content source current policy is missing');
        return {
            id: source.id,
            version: Number(source.version),
            state: source.state,
            integrationKind: source.integrationKind,
            legalName: source.legalName,
            displayName: source.displayName,
            canonicalOrigin: source.canonicalOrigin,
            endpoint: source.endpoint,
            attributionTemplate: policy.attributionTemplate,
            licenseNotice: policy.licenseNotice,
            policyVersion: policy.version,
            rights: {
                useClasses: policy.useClasses,
                maximumExcerptCharacters: policy.maximumExcerptCharacters,
                fullTextLicenseEvidenceId: policy.fullTextLicenseEvidenceId,
                mediaLicenseEvidenceId: policy.mediaLicenseEvidenceId,
                termsUrl: policy.termsUrl,
                termsVersion: policy.termsVersion,
                rightsBasis: policy.rightsBasis,
                territory: policy.territory,
                languages: policy.languages,
                validFrom: policy.validFrom.toISOString(),
                validUntil: policy.validUntil?.toISOString() ?? null,
                reviewedAt: policy.reviewedAt?.toISOString() ?? null,
                reviewDueAt: policy.reviewDueAt.toISOString(),
                legalReview: policy.legalReview,
                securityReview: policy.securityReview,
                privacyReview: policy.privacyReview,
                commercialReview: policy.commercialReview,
            },
            reviewedByUserId: source.reviewedByUserId,
            createdAt: source.createdAt.toISOString(),
            updatedAt: source.updatedAt.toISOString(),
        };
    }

    private candidate(
        candidate: IngestCandidate,
        revision: (IngestCandidateRevision & { sourcePolicy?: ContentSourcePolicy }) | null
    ): object {
        if (revision === null) throw contentError('CONTENT_RESOURCE_NOT_FOUND', 404);
        return {
            id: candidate.id,
            sourceId: candidate.sourceId,
            state: candidate.state,
            version: Number(candidate.version),
            currentRevision: {
                id: revision.id,
                revision: Number(revision.revision),
                sourcePolicyVersion: revision.sourcePolicy?.version ?? '',
                providerId: revision.providerId,
                canonicalUrl: revision.canonicalUrl,
                title: revision.title,
                author: revision.author,
                publisher: revision.publisher,
                excerpt: revision.excerpt,
                originallyPublishedAt: revision.originallyPublishedAt?.toISOString() ?? null,
                receivedAt: revision.receivedAt.toISOString(),
                fingerprint: revision.fingerprint,
                sourceHash: revision.sourceHash,
            },
            duplicateGroupId: candidate.duplicateGroupId,
            duplicateKind: candidate.duplicateKind,
            selectedArticleId: candidate.selectedArticleId,
            createdAt: candidate.createdAt.toISOString(),
            updatedAt: candidate.updatedAt.toISOString(),
        };
    }

    private adminArticle(article: Article): object {
        return {
            id: article.id,
            version: Number(article.version),
            state: article.state,
            currentDraftRevisionId: article.currentDraftRevisionId,
            approvedRevisionId: article.approvedRevisionId,
            publishedRevisionId: article.publishedRevisionId,
            scheduledRevisionId: article.scheduledRevisionId,
            scheduledFor: article.scheduledFor?.toISOString() ?? null,
            firstPublishedAt: article.firstPublishedAt?.toISOString() ?? null,
            updatedAt: article.updatedAt.toISOString(),
        };
    }

    private revisionSummary(revision: ArticleRevision): object {
        return {
            id: revision.id,
            revision: Number(revision.revision),
            locale: revision.locale,
            slug: revision.slug,
            changedFields: revision.changedFields,
            createdByUserId: revision.createdByUserId,
            createdAt: revision.createdAt.toISOString(),
        };
    }

    private articleRevision(revision: RevisionWithRelations): object {
        return {
            id: revision.id,
            articleId: revision.articleId,
            revision: Number(revision.revision),
            locale: revision.locale,
            slug: revision.slug,
            title: revision.title,
            subtitle: revision.subtitle,
            summary: revision.summary,
            body: revision.body,
            categoryId: revision.categoryId,
            tagIds: revision.tags.map(({ tagId }) => tagId),
            originKind: revision.originKind,
            origins: revision.origins.map((origin) => ({
                id: origin.id,
                sourceId: origin.sourceId,
                sourcePolicyVersion: origin.sourcePolicy.version,
                candidateRevisionId: origin.candidateRevisionId,
                originalTitle: origin.originalTitle,
                originalAuthor: origin.originalAuthor,
                originalPublisher: origin.originalPublisher,
                canonicalUrl: origin.canonicalUrl,
                originallyPublishedAt: origin.originallyPublishedAt?.toISOString() ?? null,
                receivedAt: origin.receivedAt.toISOString(),
                transformationKind: origin.transformationKind,
                rightsBasis: origin.rightsBasis,
                licenseNotice: origin.licenseNotice,
            })),
            media: revision.media.map((item) => this.media(item)),
            seo: {
                title: revision.seoTitle,
                description: revision.seoDescription,
                canonicalUrl: revision.canonicalUrl,
                indexable: false,
                openGraphImageUrl: this.mediaUrl(revision.media[0]?.objectKey),
            },
            correctionNote: revision.correctionNote,
            translationOfRevisionId: revision.translationOfRevisionId,
            changedFields: revision.changedFields,
            createdByUserId: revision.createdByUserId,
            createdAt: revision.createdAt.toISOString(),
        };
    }

    private publicationDecision(decision: ContentPublicationDecision): object {
        return {
            id: decision.id,
            articleId: decision.articleId,
            revisionId: decision.articleRevisionId,
            articleVersion: Number(decision.articleVersion),
            decision: decision.decision,
            reason: decision.reasonCode,
            checklistVersion: decision.checklistVersion,
            actorUserId: decision.actorUserId,
            reviewerUserId: decision.reviewerUserId,
            selfReview: decision.selfReview,
            scheduledFor: decision.scheduledFor?.toISOString() ?? null,
            committedAt: decision.committedAt.toISOString(),
        };
    }

    private media(item: RevisionWithRelations['media'][number]): object {
        return {
            id: item.id,
            url: this.mediaUrl(item.objectKey),
            mediaType: item.mediaType,
            byteLength: Number(item.byteLength),
            sha256: item.sha256,
            rightsPolicyVersion: item.rightsPolicyVersion,
            altText: item.altText,
        };
    }

    private mediaUrl(objectKey?: string): string | null {
        if (objectKey === undefined || this.environment.CONTENT_MEDIA_BASE_URL === undefined) return null;
        return `${this.environment.CONTENT_MEDIA_BASE_URL.replace(/\/$/u, '')}/${objectKey}`;
    }

    private publicInclude(): typeof PUBLIC_INCLUDE {
        return PUBLIC_INCLUDE;
    }
    private revisionInclude(): typeof REVISION_INCLUDE {
        return REVISION_INCLUDE;
    }

    private keysetPage<T>(
        rows: T[],
        limit: number,
        scope: string,
        date: (row: T) => Date,
        id: (row: T) => string,
        map: (row: T) => object
    ): object {
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return {
            items: items.map(map),
            pageInfo: {
                hasNext: rows.length > limit,
                nextCursor:
                    rows.length > limit && last !== undefined
                        ? this.cursor.encode({ scope, at: date(last).toISOString(), id: id(last) })
                        : null,
            },
        };
    }

    private canonicalUrl(locale: string, slug: string): string {
        const baseUrl = this.environment.CONTENT_PUBLIC_BASE_URL ?? 'https://localhost/content/articles';
        return `${baseUrl.replace(/\/$/u, '')}/${encodeURIComponent(locale)}/${slug}`;
    }

    private scope(...values: (string | undefined)[]): string {
        return values.map((value) => value ?? '').join(':');
    }
    private hash(value: string): string {
        return createHash('sha256').update(value).digest('hex');
    }

    private https(value: string): string {
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new Error('scheme');
            return url.toString();
        } catch {
            throw contentError('VALIDATION_FAILED', 400);
        }
    }

    private text(value: string, maximum: number): string {
        const normalized = value.normalize('NFC').trim();
        if (normalized.length < 1 || normalized.length > maximum) throw contentError('VALIDATION_FAILED', 400);
        return normalized;
    }

    private assertExact(value: unknown, keys: readonly string[]): void {
        if (typeof value !== 'object' || value === null || Array.isArray(value))
            throw contentError('VALIDATION_FAILED', 400);
        if (Object.keys(value).some((key) => !keys.includes(key))) throw contentError('VALIDATION_FAILED', 400);
    }

    private optionalString(value: unknown): string | null {
        if (value === null || value === undefined) return null;
        if (typeof value !== 'string') throw contentError('VALIDATION_FAILED', 400);
        return value;
    }

    private optionalText(value: unknown, maximum: number): string | null {
        const text = this.optionalString(value);
        return text === null ? null : this.text(text, maximum);
    }

    private optionalDate(value: unknown): Date | null {
        const text = this.optionalString(value);
        if (text === null) return null;
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) throw contentError('VALIDATION_FAILED', 400);
        return date;
    }

    private async auditEntry(
        tx: Prisma.TransactionClient,
        actorId: string,
        action: string,
        targetType: string,
        targetId: string,
        changedFields: string[],
        reasonCode?: string,
        operationId?: string
    ): Promise<void> {
        const context = this.context.get();
        await this.audit.append(tx, {
            ...(operationId === undefined ? {} : { operationId }),
            actorType: 'USER',
            actorId,
            action,
            targetType,
            targetId,
            outcome: 'SUCCEEDED',
            ...(reasonCode === undefined ? {} : { reasonCode }),
            policyVersion: this.checklistVersion(),
            changedFields: { fields: changedFields },
            requestId: context?.requestId ?? uuidV7(),
            correlationId: context?.correlationId ?? uuidV7(),
            source: 'content',
        });
    }

    private checklistVersion(): string {
        return this.environment.CONTENT_CHECKLIST_VERSION ?? '1.0.0';
    }

    private assertReason(value: unknown): asserts value is string {
        if (typeof value !== 'string' || !DECISION_REASONS.has(value)) throw contentError('VALIDATION_FAILED', 400);
    }
}
