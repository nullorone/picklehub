import { Injectable } from '@nestjs/common';

@Injectable()
export class VenueMetricsService {
    private readonly counters = new Map<string, number>();

    increment(name: string, amount = 1): void {
        this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
    }

    snapshot(): Readonly<Record<string, number>> {
        return Object.fromEntries(this.counters);
    }
}
