import { Injectable } from '@nestjs/common';

export interface AdministrationAlert {
    name: 'ADMIN_QUEUE_AGE' | 'ADMIN_AUDIT_WRITE_FAILED' | 'ADMIN_REPEATED_UNAUTHORIZED_ACCESS';
    severity: 'warning' | 'critical';
}

@Injectable()
export class AdministrationMetricsService {
    private readonly counters = new Map<string, number>();
    private readonly alerts = new Map<AdministrationAlert['name'], AdministrationAlert>();

    increment(metric: string, labels: Readonly<Record<string, string>> = {}): number {
        const suffix = Object.entries(labels)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        const key = `${metric}{${suffix}}`;
        const value = (this.counters.get(key) ?? 0) + 1;
        this.counters.set(key, value);
        return value;
    }

    authorizationDenied(role: string, action: string): void {
        const count = this.increment('admin_authorization_denied_total', { action, role });
        if (count >= 5) {
            this.alerts.set('ADMIN_REPEATED_UNAUTHORIZED_ACCESS', {
                name: 'ADMIN_REPEATED_UNAUTHORIZED_ACCESS',
                severity: 'critical',
            });
        }
    }

    auditFailed(): void {
        this.increment('admin_audit_write_failed_total');
        this.alerts.set('ADMIN_AUDIT_WRITE_FAILED', { name: 'ADMIN_AUDIT_WRITE_FAILED', severity: 'critical' });
    }

    observeOldestQueueItem(ageMilliseconds: number): void {
        const bucket = ageMilliseconds < 3_600_000 ? 'LT_1_HOUR' : ageMilliseconds < 86_400_000 ? 'H1_24' : 'GTE_1_DAY';
        this.increment('admin_queue_observation_total', { age: bucket });
        if (ageMilliseconds >= 86_400_000) {
            this.alerts.set('ADMIN_QUEUE_AGE', { name: 'ADMIN_QUEUE_AGE', severity: 'warning' });
        }
    }

    snapshot(): ReadonlyMap<string, number> {
        return new Map(this.counters);
    }

    activeAlerts(): readonly AdministrationAlert[] {
        return [...this.alerts.values()];
    }
}
