import { Injectable } from '@nestjs/common';

@Injectable()
export class IdentityMetricsService {
    private readonly counters = new Map<string, number>();

    increment(metric: string, labels: Readonly<Record<string, string>> = {}): void {
        const safeLabels = Object.entries(labels)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        const key = `${metric}{${safeLabels}}`;
        this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
    }

    snapshot(): ReadonlyMap<string, number> {
        return new Map(this.counters);
    }
}
