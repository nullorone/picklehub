import { Injectable } from '@nestjs/common';
import { Prisma, VenuePublicationState, VenueSourceKind, VenueVerificationState } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { OutboxService } from '../outbox/outbox.service';
import { VenueMetricsService } from './venue-metrics.service';
import { normalizeDedupeKey, normalizeVenueAddress, normalizeVenueText } from './venue-normalization';
import { VenueCatalogImportPort, type ImportedVenue } from './venue-provider';

export interface VenueImportResult {
    runId: string;
    status: 'COMPLETED';
    dryRun: boolean;
    scannedCount: number;
    createdCount: number;
    deduplicatedCount: number;
    quarantinedCount: number;
}

interface ImportRunRow {
    id: string;
    dryRun: boolean;
    scannedCount: number;
    createdCount: number;
    deduplicatedCount: number;
    quarantinedCount: number;
}

@Injectable()
export class VenueImportService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly provider: VenueCatalogImportPort,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock,
        private readonly audit: AuditService,
        private readonly outbox: OutboxService,
        private readonly metrics: VenueMetricsService
    ) {}

    async import(scope: string, dryRun = false): Promise<VenueImportResult> {
        const scopeKey = this.crypto.hash(`VENUE_IMPORT_SCOPE:${scope}`).slice(0, 160);
        let fetched: Awaited<ReturnType<VenueCatalogImportPort['fetch']>>;
        try {
            fetched = await this.provider.fetch(scope);
        } catch (error) {
            this.metrics.increment('venue_import_provider_failures_total');
            throw error;
        }
        const completed = await this.prisma.$queryRaw<ImportRunRow[]>(Prisma.sql`
            SELECT id, dry_run AS "dryRun", scanned_count AS "scannedCount", created_count AS "createdCount",
                deduplicated_count AS "deduplicatedCount", quarantined_count AS "quarantinedCount"
            FROM venue_import_runs WHERE provider_key = 'openstreetmap' AND source_version = ${fetched.sourceVersion}
                AND scope_key = ${scopeKey} AND dry_run = ${dryRun} AND status = 'COMPLETED' LIMIT 1`);
        if (completed[0] !== undefined) return this.result(completed[0]);
        const previous = await this.prisma.$queryRaw<
            { sourceVersion: string; checkpoint: { offset?: unknown } }[]
        >(Prisma.sql`
            SELECT source_version AS "sourceVersion", checkpoint FROM venue_import_checkpoints
            WHERE provider_key = 'openstreetmap' AND scope_key = ${scopeKey}`);
        const offset =
            previous[0]?.sourceVersion === fetched.sourceVersion ? Number(previous[0].checkpoint.offset ?? 0) : 0;
        const runId = uuidV7();
        await this.prisma.$executeRaw`INSERT INTO venue_import_runs
            (id, provider_key, source_version, scope_key, dry_run, checkpoint)
            VALUES (${runId}::uuid, 'openstreetmap', ${fetched.sourceVersion}, ${scopeKey}, ${dryRun}, ${JSON.stringify({ offset })}::jsonb)`;
        const counts = { scannedCount: offset, createdCount: 0, deduplicatedCount: 0, quarantinedCount: 0 };
        try {
            for (let index = offset; index < fetched.items.length; index += 1) {
                const item = fetched.items[index];
                if (item === undefined) continue;
                const outcome = await this.process(item, runId, dryRun);
                counts.scannedCount += 1;
                counts[`${outcome}Count`] += 1;
                if ((index + 1) % 50 === 0 || index + 1 === fetched.items.length) {
                    await this.prisma.$transaction(async (transaction) => {
                        await transaction.$executeRaw`UPDATE venue_import_runs SET checkpoint = ${JSON.stringify({ offset: index + 1 })}::jsonb,
                            scanned_count = ${counts.scannedCount}, created_count = ${counts.createdCount},
                            deduplicated_count = ${counts.deduplicatedCount}, quarantined_count = ${counts.quarantinedCount}
                            WHERE id = ${runId}::uuid`;
                        await transaction.$executeRaw`INSERT INTO venue_import_checkpoints
                            (provider_key, scope_key, source_version, checkpoint, updated_at)
                            VALUES ('openstreetmap', ${scopeKey}, ${fetched.sourceVersion}, ${JSON.stringify({ offset: index + 1 })}::jsonb, ${this.clock.now()})
                            ON CONFLICT (provider_key, scope_key) DO UPDATE SET source_version = EXCLUDED.source_version,
                                checkpoint = EXCLUDED.checkpoint, updated_at = EXCLUDED.updated_at`;
                    });
                }
            }
            await this.prisma.$executeRaw`UPDATE venue_import_runs SET status = 'COMPLETED',
                checkpoint = ${JSON.stringify({ offset: fetched.items.length })}::jsonb, scanned_count = ${counts.scannedCount},
                created_count = ${counts.createdCount}, deduplicated_count = ${counts.deduplicatedCount},
                quarantined_count = ${counts.quarantinedCount}, finished_at = ${this.clock.now()} WHERE id = ${runId}::uuid`;
            this.metrics.increment('venue_import_completed_total');
            this.metrics.increment('venue_import_created_total', counts.createdCount);
            return this.result({ id: runId, dryRun, ...counts });
        } catch (error) {
            await this.prisma
                .$executeRaw`UPDATE venue_import_runs SET status = 'FAILED', failure_code = 'VENUE_IMPORT_ITEM_FAILED',
                scanned_count = ${counts.scannedCount}, created_count = ${counts.createdCount},
                deduplicated_count = ${counts.deduplicatedCount}, quarantined_count = ${counts.quarantinedCount},
                finished_at = ${this.clock.now()} WHERE id = ${runId}::uuid`;
            this.metrics.increment('venue_import_failures_total');
            throw error;
        }
    }

    private async process(
        item: ImportedVenue,
        runId: string,
        dryRun: boolean
    ): Promise<'created' | 'deduplicated' | 'quarantined'> {
        if (item.explicitlyPrivate || !item.provenance.storageAllowed) return 'quarantined';
        const name = normalizeVenueText(item.name);
        const address = normalizeVenueAddress(item.normalizedAddress);
        if (!name || !address || !item.locality) return 'quarantined';
        const external = await this.prisma.venueSource.findFirst({
            where: {
                providerKey: item.provenance.providerKey,
                externalSourceId: item.externalSourceId,
                venueId: { not: null },
            },
        });
        if (external !== null) return 'deduplicated';
        const nearby = await this.prisma.$queryRaw<
            { id: string; name: string; normalizedAddress: string }[]
        >(Prisma.sql`
            SELECT id, name, normalized_address AS "normalizedAddress" FROM venues
            WHERE publication_state <> 'MERGED'
              AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326)::geography, 100)
            ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326)::geography), id LIMIT 20`);
        const duplicate = nearby.find(
            (venue) => normalizeDedupeKey(venue.name, venue.normalizedAddress) === normalizeDedupeKey(name, address)
        );
        if (dryRun) return duplicate === undefined ? 'created' : 'deduplicated';
        await this.prisma.$transaction(async (transaction) => {
            const venueId = duplicate?.id ?? uuidV7();
            if (duplicate === undefined) {
                await transaction.venue.create({
                    data: {
                        id: venueId,
                        name,
                        normalizedAddress: address,
                        locality: normalizeVenueText(item.locality),
                        timeZone: item.timeZone,
                        longitude: item.longitude,
                        latitude: item.latitude,
                        publicationState: item.ambiguous
                            ? VenuePublicationState.PRIVACY_REVIEW
                            : VenuePublicationState.PUBLISHED,
                        verificationState: VenueVerificationState.IMPORTED_UNREVIEWED,
                        lastVerifiedAt: item.provenance.observedAt,
                    },
                });
                await this.outbox.enqueue(transaction, {
                    type: 'venue.verified.v1',
                    schemaVersion: 1,
                    payload: { venueId, verificationState: VenueVerificationState.IMPORTED_UNREVIEWED },
                    correlationId: runId,
                    occurredAt: this.clock.now(),
                });
            }
            await transaction.venueSource.create({
                data: {
                    id: uuidV7(),
                    venueId,
                    kind: VenueSourceKind.OPENSTREETMAP,
                    providerKey: item.provenance.providerKey,
                    externalSourceId: item.externalSourceId,
                    externalSourceVersion: item.externalSourceVersion ?? null,
                    importBatchId: runId,
                    observedAt: item.provenance.observedAt,
                    license: item.provenance.license,
                    policyVersion: item.provenance.policyVersion,
                    storageAllowed: true,
                    allowedFields: item.provenance.allowedFields,
                    attributionText: item.provenance.attributionText,
                    attributionLink: item.provenance.attributionLink ?? null,
                },
            });
            await this.audit.append(transaction, {
                actorType: 'SYSTEM',
                action: duplicate === undefined ? 'venue.import.created' : 'venue.import.deduplicated',
                targetType: 'VENUE',
                targetId: venueId,
                outcome: 'SUCCESS',
                changedFields: { provider: item.provenance.providerKey },
                requestId: runId,
                correlationId: runId,
                source: 'WORKER',
            });
        });
        return duplicate === undefined ? 'created' : 'deduplicated';
    }

    private result(run: ImportRunRow): VenueImportResult {
        return {
            runId: run.id,
            status: 'COMPLETED',
            dryRun: run.dryRun,
            scannedCount: run.scannedCount,
            createdCount: run.createdCount,
            deduplicatedCount: run.deduplicatedCount,
            quarantinedCount: run.quarantinedCount,
        };
    }
}
