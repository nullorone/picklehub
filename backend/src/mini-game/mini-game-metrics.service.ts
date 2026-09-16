import { Injectable } from '@nestjs/common';

export type MiniGameMetric =
    | 'request.allowed'
    | 'request.rate_limited'
    | 'result.accepted'
    | 'result.impossible'
    | 'result.replayed'
    | 'reward.capped'
    | 'reward.granted'
    | 'reward.unavailable';

@Injectable()
export class MiniGameMetricsService {
    private readonly counters = new Map<MiniGameMetric, number>();

    increment(metric: MiniGameMetric): void {
        this.counters.set(metric, (this.counters.get(metric) ?? 0) + 1);
    }

    snapshot(): Readonly<Record<MiniGameMetric, number>> {
        return {
            'request.allowed': this.counters.get('request.allowed') ?? 0,
            'request.rate_limited': this.counters.get('request.rate_limited') ?? 0,
            'result.accepted': this.counters.get('result.accepted') ?? 0,
            'result.impossible': this.counters.get('result.impossible') ?? 0,
            'result.replayed': this.counters.get('result.replayed') ?? 0,
            'reward.capped': this.counters.get('reward.capped') ?? 0,
            'reward.granted': this.counters.get('reward.granted') ?? 0,
            'reward.unavailable': this.counters.get('reward.unavailable') ?? 0,
        };
    }
}
