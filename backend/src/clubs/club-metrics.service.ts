import { Injectable } from '@nestjs/common';
import { ClubMatchOrigin, MatchFormat, MatchMetricType } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';

export interface ConfirmedClubMatchMetrics {
    readonly total: number;
    readonly byOrigin: Readonly<Record<ClubMatchOrigin, number>>;
    readonly byFormat: Readonly<Record<MatchFormat, number>>;
}

/**
 * Internal operational projection. It deliberately derives completion from the unique match metric marker instead
 * of mutable match state or analytics delivery, so retry and provider availability cannot inflate club metrics.
 */
@Injectable()
export class ClubMetricsService {
    constructor(private readonly prisma: PrismaService) {}

    async confirmedMatches(clubId: string): Promise<ConfirmedClubMatchMetrics> {
        const rows = await this.prisma.matchMetricMarker.findMany({
            where: { match: { clubId }, metricType: MatchMetricType.CONFIRMED_MATCH },
            select: { match: { select: { clubOrigin: true, format: true } } },
        });
        const byOrigin = { CLUB: 0, RECURRING_RULE: 0 } satisfies Record<ClubMatchOrigin, number>;
        const byFormat = { DOUBLES: 0, SINGLES: 0 } satisfies Record<MatchFormat, number>;
        for (const { match } of rows) {
            if (match.clubOrigin !== null) byOrigin[match.clubOrigin] += 1;
            if (match.format !== null) byFormat[match.format] += 1;
        }
        return { total: rows.length, byOrigin, byFormat };
    }
}
