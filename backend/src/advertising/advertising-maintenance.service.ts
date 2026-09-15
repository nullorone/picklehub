import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';

@Injectable()
export class AdvertisingMaintenanceService {
    constructor(private readonly prisma: PrismaService) {}

    async run(
        now = new Date()
    ): Promise<{ released: number; deletedEvents: number; deletedCounters: number; deletedReceipts: number }> {
        await this.advanceCampaigns(now);
        await this.reconcileReports(now);
        const released = await this.releaseExpired(now);
        const expiredDeliveries = await this.prisma.adDeliveryEvent.findMany({
            where: { expiresAt: { lte: now } },
            select: { deliveryId: true },
            distinct: ['deliveryId'],
            take: 10_000,
        });
        const [events, counters, receipts] = await this.prisma.$transaction([
            this.prisma.adDeliveryEvent.deleteMany({
                where: { deliveryId: { in: expiredDeliveries.map(({ deliveryId }) => deliveryId) } },
            }),
            this.prisma.deliveryCounter.deleteMany({ where: { expiresAt: { lte: now } } }),
            this.prisma.advertisingOperationReceipt.deleteMany({ where: { expiresAt: { lte: now } } }),
        ]);
        return {
            released,
            deletedEvents: events.count,
            deletedCounters: counters.count,
            deletedReceipts: receipts.count,
        };
    }

    private async advanceCampaigns(now: Date): Promise<void> {
        await this.prisma.campaign.updateMany({
            where: { state: 'SCHEDULED', startsAt: { lte: now }, endsAt: { gt: now } },
            data: { state: 'ACTIVE', version: { increment: 1 }, updatedAt: now },
        });
        await this.prisma.campaign.updateMany({
            where: { state: { in: ['SCHEDULED', 'ACTIVE', 'PAUSED'] }, endsAt: { lte: now } },
            data: { state: 'COMPLETED', version: { increment: 1 }, updatedAt: now },
        });
        await this.prisma.$executeRaw`
            UPDATE campaigns SET state = 'EXHAUSTED', version = version + 1, updated_at = ${now}
            WHERE state = 'ACTIVE' AND spent_minor >= budget_minor
        `;
    }

    private async reconcileReports(now: Date): Promise<void> {
        const since = new Date(now.getTime() - 30 * 86_400_000);
        await this.prisma.$executeRaw`
            INSERT INTO ad_report_daily (
                day, campaign_id, creative_id, placement_id, eligible, served, viewable,
                valid_clicks, invalid_events, spend_minor, updated_at
            )
            SELECT date_trunc('day', occurred_at)::date, campaign_id, creative_id, placement_id,
                count(*) FILTER (WHERE kind = 'ISSUED'), count(*) FILTER (WHERE kind = 'ISSUED'),
                count(*) FILTER (WHERE kind = 'VIEWABLE_IMPRESSION'),
                count(*) FILTER (WHERE kind = 'VALID_CLICK'), count(*) FILTER (WHERE kind = 'INVALID_CLICK'),
                COALESCE(sum(finalized_minor), 0), ${now}
            FROM ad_delivery_events
            WHERE occurred_at >= ${since}
            GROUP BY 1, campaign_id, creative_id, placement_id
            ON CONFLICT (day, campaign_id, creative_id, placement_id) DO UPDATE SET
                eligible = EXCLUDED.eligible, served = EXCLUDED.served, viewable = EXCLUDED.viewable,
                valid_clicks = EXCLUDED.valid_clicks, invalid_events = EXCLUDED.invalid_events,
                spend_minor = EXCLUDED.spend_minor, updated_at = EXCLUDED.updated_at
        `;
    }

    private async releaseExpired(now: Date): Promise<number> {
        const unsettled = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT issued.id
            FROM ad_delivery_events issued
            WHERE issued.kind = 'ISSUED' AND issued.token_expires_at <= ${now} AND issued.reserved_minor > 0
              AND NOT EXISTS (
                  SELECT 1 FROM ad_delivery_events settled
                  WHERE settled.delivery_id = issued.delivery_id
                    AND (
                        settled.kind = 'RESERVATION_RELEASED'
                        OR (settled.kind IN ('VIEWABLE_IMPRESSION', 'VALID_CLICK') AND settled.finalized_minor > 0)
                    )
              )
            ORDER BY issued.token_expires_at ASC
            LIMIT 200
        `;
        const rows = await this.prisma.adDeliveryEvent.findMany({
            where: { id: { in: unsettled.map(({ id }) => id) } },
            orderBy: { tokenExpiresAt: 'asc' },
            take: 200,
        });
        let released = 0;
        for (const row of rows) {
            try {
                await this.prisma.$transaction(
                    async (tx) => {
                        const existing = await tx.adDeliveryEvent.findUnique({
                            where: { deliveryId_kind: { deliveryId: row.deliveryId, kind: 'RESERVATION_RELEASED' } },
                        });
                        if (existing !== null) return;
                        const occurredAt = now;
                        await tx.adDeliveryEvent.create({
                            data: {
                                id: uuidV7(),
                                deliveryId: row.deliveryId,
                                kind: 'RESERVATION_RELEASED',
                                source: row.source,
                                campaignId: row.campaignId,
                                campaignRevisionId: row.campaignRevisionId,
                                creativeId: row.creativeId,
                                placementId: row.placementId,
                                deliveryCounterId: row.deliveryCounterId,
                                timingBucket: `${occurredAt.toISOString().slice(0, 13)}:00Z`,
                                policyVersion: row.policyVersion,
                                occurredAt,
                                expiresAt: new Date(occurredAt.getTime() + 30 * 86_400_000),
                            },
                        });
                    },
                    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
                );
                released += 1;
            } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
                    continue;
                throw error;
            }
        }
        return released;
    }
}
