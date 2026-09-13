import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type ContentSource, type ContentSourcePolicy } from '@prisma/client';
import { createHash } from 'node:crypto';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RedisService } from '../common/redis/redis.service';
import { type ContentSourceItem, ContentSourceAdapterPort } from './content-source.adapter';

interface Checkpoint {
    etag?: string;
    lastModified?: string;
    nextAllowedAt?: string;
}

@Injectable()
export class ContentIngestionService {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly adapter: ContentSourceAdapterPort
    ) {}

    async pollEnabledSources(): Promise<{ attempted: number; succeeded: number }> {
        const sources = await this.prisma.contentSource.findMany({
            where: { state: 'ENABLED', currentPolicyId: { not: null } },
            include: { currentPolicy: true },
            orderBy: { id: 'asc' },
            take: 100,
        });
        let succeeded = 0;
        for (const source of sources) {
            if (source.currentPolicy === null) continue;
            try {
                if (await this.poll(source, source.currentPolicy)) succeeded += 1;
            } catch {
                await this.defer(source.id);
            }
        }
        return { attempted: sources.length, succeeded };
    }

    private async poll(source: ContentSource, policy: ContentSourcePolicy): Promise<boolean> {
        if (!this.currentRights(policy)) return false;
        const checkpoint = await this.checkpoint(source.id);
        if (checkpoint.nextAllowedAt !== undefined && new Date(checkpoint.nextAllowedAt) > new Date()) return false;
        const result = await this.adapter.fetch({
            sourceId: source.id,
            endpoint: source.endpoint,
            integrationKind: source.integrationKind,
            maximumExcerptCharacters: policy.maximumExcerptCharacters,
            useClasses: policy.useClasses,
            timeoutMs: this.environment.CONTENT_FETCH_TIMEOUT_MS ?? 5000,
            ...(checkpoint.etag === undefined ? {} : { etag: checkpoint.etag }),
            ...(checkpoint.lastModified === undefined ? {} : { lastModified: checkpoint.lastModified }),
        });
        if (result.outcome === 'SUCCESS') {
            for (const item of result.items) await this.persist(source, policy, item);
        }
        await this.writeCheckpoint(source.id, {
            ...(result.etag === undefined ? {} : { etag: result.etag }),
            ...(result.lastModified === undefined ? {} : { lastModified: result.lastModified }),
            nextAllowedAt: new Date(
                Date.now() + (this.environment.CONTENT_SOURCE_MIN_INTERVAL_MS ?? 60_000)
            ).toISOString(),
        });
        return true;
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
            policy.commercialReview === 'APPROVED'
        );
    }

    private async persist(source: ContentSource, policy: ContentSourcePolicy, item: ContentSourceItem): Promise<void> {
        const normalized = {
            providerId: item.providerId,
            canonicalUrl: item.canonicalUrl,
            title: item.title,
            author: item.author,
            publisher: item.publisher,
            excerpt: item.excerpt,
            originallyPublishedAt: item.originallyPublishedAt?.toISOString() ?? null,
        };
        const canonicalUrlHash = this.hash(item.canonicalUrl);
        const fingerprint = this.hash(JSON.stringify({ title: item.title.toLowerCase(), excerpt: item.excerpt }));
        const sourceHash = this.hash(JSON.stringify(normalized));
        await this.prisma.$transaction(
            async (tx) => {
                const candidates = await tx.ingestCandidate.findMany({
                    where: { sourceId: source.id },
                    include: { currentRevision: true },
                    orderBy: { createdAt: 'asc' },
                });
                let candidate = candidates.find(
                    ({ currentRevision }) =>
                        (item.providerId !== null && currentRevision?.providerId === item.providerId) ||
                        currentRevision?.canonicalUrlHash === canonicalUrlHash
                );
                if (candidate?.currentRevision?.sourceHash === sourceHash) return;
                candidate ??= await tx.ingestCandidate.create({
                    data: { id: uuidV7(), sourceId: source.id },
                    include: { currentRevision: true },
                });
                const duplicate = candidates.find(
                    ({ id, currentRevision }) =>
                        id !== candidate.id &&
                        (currentRevision?.canonicalUrlHash === canonicalUrlHash ||
                            (item.providerId !== null && currentRevision?.providerId === item.providerId) ||
                            currentRevision?.fingerprint === fingerprint)
                );
                const revision = await tx.ingestCandidateRevision.create({
                    data: {
                        id: uuidV7(),
                        candidateId: candidate.id,
                        revision: (candidate.currentRevision?.revision ?? 0n) + 1n,
                        sourcePolicyId: policy.id,
                        providerId: item.providerId,
                        canonicalUrl: item.canonicalUrl,
                        canonicalUrlHash,
                        title: item.title,
                        author: item.author,
                        publisher: item.publisher,
                        excerpt: item.excerpt,
                        originallyPublishedAt: item.originallyPublishedAt,
                        receivedAt: new Date(),
                        fingerprint,
                        sourceHash,
                    },
                });
                await tx.ingestCandidate.update({
                    where: { id: candidate.id },
                    data: {
                        currentRevisionId: revision.id,
                        version: { increment: 1 },
                        updatedAt: new Date(),
                        ...(duplicate === undefined
                            ? {}
                            : {
                                  state: 'DUPLICATE',
                                  duplicateGroupId: duplicate.duplicateGroupId ?? duplicate.id,
                                  duplicateKind:
                                      duplicate.currentRevision?.canonicalUrlHash === canonicalUrlHash
                                          ? 'CANONICAL_URL'
                                          : duplicate.currentRevision?.providerId === item.providerId
                                            ? 'PROVIDER_ID'
                                            : 'FINGERPRINT',
                              }),
                    },
                });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    private async checkpoint(sourceId: string): Promise<Checkpoint> {
        try {
            const value = await this.redis.client.get(`content:checkpoint:${sourceId}`);
            return value === null ? {} : (JSON.parse(value) as Checkpoint);
        } catch {
            return {};
        }
    }

    private async writeCheckpoint(sourceId: string, checkpoint: Checkpoint): Promise<void> {
        try {
            await this.redis.client.set(`content:checkpoint:${sourceId}`, JSON.stringify(checkpoint));
        } catch {
            // Database deduplication remains authoritative if the removable checkpoint is unavailable.
        }
    }

    private async defer(sourceId: string): Promise<void> {
        const checkpoint = await this.checkpoint(sourceId);
        await this.writeCheckpoint(sourceId, {
            ...checkpoint,
            nextAllowedAt: new Date(
                Date.now() + (this.environment.CONTENT_SOURCE_MIN_INTERVAL_MS ?? 60_000) * 4
            ).toISOString(),
        });
    }

    private hash(value: string): string {
        return createHash('sha256').update(value).digest('hex');
    }
}
