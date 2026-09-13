import { Injectable } from '@nestjs/common';

export type GamificationMetric =
    | 'award.capped'
    | 'award.held'
    | 'award.posted'
    | 'award.reversed'
    | 'event.duplicate'
    | 'event.stale'
    | 'projection.rebuilt';

@Injectable()
export class GamificationMetricsService {
    private readonly counters = new Map<GamificationMetric, number>();

    increment(metric: GamificationMetric, value = 1): void {
        this.counters.set(metric, (this.counters.get(metric) ?? 0) + value);
    }

    snapshot(): Readonly<Record<GamificationMetric, number>> {
        return {
            'award.capped': this.counters.get('award.capped') ?? 0,
            'award.held': this.counters.get('award.held') ?? 0,
            'award.posted': this.counters.get('award.posted') ?? 0,
            'award.reversed': this.counters.get('award.reversed') ?? 0,
            'event.duplicate': this.counters.get('event.duplicate') ?? 0,
            'event.stale': this.counters.get('event.stale') ?? 0,
            'projection.rebuilt': this.counters.get('projection.rebuilt') ?? 0,
        };
    }
}
