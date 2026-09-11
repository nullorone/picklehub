import { Injectable } from '@nestjs/common';

@Injectable()
export class TrustSafetyMetricsService {
    private readonly counters = new Map<string, number>();

    increment(metric: string, labels: Readonly<Record<string, string>> = {}): void {
        const suffix = Object.entries(labels)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        this.counters.set(`${metric}{${suffix}}`, (this.counters.get(`${metric}{${suffix}}`) ?? 0) + 1);
    }

    snapshot(): ReadonlyMap<string, number> {
        return new Map(this.counters);
    }
}
