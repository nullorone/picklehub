import { ClubMatchOrigin, MatchFormat, MatchMetricType } from '@prisma/client';

import { ClubMetricsService } from '../../src/clubs/club-metrics.service';
import type { PrismaService } from '../../src/common/database/prisma.service';

describe('club confirmed-match metrics', () => {
    it('uses only the authoritative unique confirmation marker and safe dimensions', async () => {
        const findMany = jest
            .fn()
            .mockResolvedValue([
                { match: { clubOrigin: ClubMatchOrigin.CLUB, format: MatchFormat.SINGLES } },
                { match: { clubOrigin: ClubMatchOrigin.RECURRING_RULE, format: MatchFormat.DOUBLES } },
            ]);
        const metrics = new ClubMetricsService({ matchMetricMarker: { findMany } } as unknown as PrismaService);

        await expect(metrics.confirmedMatches('club-a')).resolves.toEqual({
            total: 2,
            byOrigin: { CLUB: 1, RECURRING_RULE: 1 },
            byFormat: { DOUBLES: 1, SINGLES: 1 },
        });
        expect(findMany).toHaveBeenCalledWith({
            where: { match: { clubId: 'club-a' }, metricType: MatchMetricType.CONFIRMED_MATCH },
            select: { match: { select: { clubOrigin: true, format: true } } },
        });
    });

    it('returns zero buckets when no confirmation marker exists', async () => {
        const metrics = new ClubMetricsService({
            matchMetricMarker: { findMany: jest.fn().mockResolvedValue([]) },
        } as unknown as PrismaService);

        await expect(metrics.confirmedMatches('club-a')).resolves.toEqual({
            total: 0,
            byOrigin: { CLUB: 0, RECURRING_RULE: 0 },
            byFormat: { DOUBLES: 0, SINGLES: 0 },
        });
    });
});
