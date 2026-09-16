import { Injectable } from '@nestjs/common';

const DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2.5, 4, 10] as const;
const ALLOWED_SCENARIOS = new Set(['AUTHENTICATION', 'SEARCH', 'JOIN', 'CHAT', 'MATCH_COMPLETION', 'OTHER']);
const ALLOWED_OUTCOMES = new Set(['SUCCESS', 'REJECTED', 'ERROR']);
const ALLOWED_STATUS_CLASSES = new Set(['2xx', '3xx', '4xx', '5xx']);
const ALLOWED_PROVIDERS = new Set([
    'email_auth',
    'email_notification',
    'telegram_notification',
    'geocoder',
    'overpass',
]);

interface Series {
    count: number;
    sum: number;
    buckets: number[];
}

function labels(values: Record<string, string>): string {
    return `{${Object.entries(values)
        .map(([key, value]) => `${key}="${value}"`)
        .join(',')}}`;
}

@Injectable()
export class OperationalMetricsService {
    private readonly requests = new Map<string, Series>();
    private readonly providerRequests = new Map<string, number>();
    private readonly providerStates = new Map<string, 'closed' | 'open' | 'half_open'>();
    private redactionViolations = 0;

    observeHttp(scenario: string, outcome: string, statusClass: string, durationSeconds: number): void {
        if (
            !ALLOWED_SCENARIOS.has(scenario) ||
            !ALLOWED_OUTCOMES.has(outcome) ||
            !ALLOWED_STATUS_CLASSES.has(statusClass) ||
            !Number.isFinite(durationSeconds) ||
            durationSeconds < 0
        ) {
            this.redactionViolations += 1;
            return;
        }
        const key = `${scenario}|${outcome}|${statusClass}`;
        const series = this.requests.get(key) ?? { count: 0, sum: 0, buckets: DURATION_BUCKETS.map(() => 0) };
        series.count += 1;
        series.sum += durationSeconds;
        DURATION_BUCKETS.forEach((bucket, index) => {
            if (durationSeconds <= bucket) series.buckets[index] = (series.buckets[index] ?? 0) + 1;
        });
        this.requests.set(key, series);
    }

    observeProvider(
        provider: string,
        outcome: 'success' | 'failure' | 'circuit_open',
        state: 'closed' | 'open' | 'half_open'
    ): void {
        if (!ALLOWED_PROVIDERS.has(provider)) {
            this.redactionViolations += 1;
            return;
        }
        const key = `${provider}|${outcome}`;
        this.providerRequests.set(key, (this.providerRequests.get(key) ?? 0) + 1);
        this.providerStates.set(provider, state);
    }

    render(extra: readonly string[] = []): string {
        const lines = [
            '# HELP picklehub_http_requests_total Completed HTTP requests by bounded operational scenario.',
            '# TYPE picklehub_http_requests_total counter',
            '# HELP picklehub_http_request_duration_seconds Server request duration.',
            '# TYPE picklehub_http_request_duration_seconds histogram',
        ];
        for (const [key, series] of [...this.requests].sort(([left], [right]) => left.localeCompare(right))) {
            const [scenario = 'OTHER', outcome = 'ERROR', statusClass = '5xx'] = key.split('|');
            const base = { scenario, outcome, status_class: statusClass };
            lines.push(`picklehub_http_requests_total${labels(base)} ${String(series.count)}`);
            DURATION_BUCKETS.forEach((bucket, index) => {
                lines.push(
                    `picklehub_http_request_duration_seconds_bucket${labels({ ...base, le: String(bucket) })} ${String(series.buckets[index] ?? 0)}`
                );
            });
            lines.push(
                `picklehub_http_request_duration_seconds_bucket${labels({ ...base, le: '+Inf' })} ${String(series.count)}`,
                `picklehub_http_request_duration_seconds_sum${labels(base)} ${String(series.sum)}`,
                `picklehub_http_request_duration_seconds_count${labels(base)} ${String(series.count)}`
            );
        }
        const memory = process.memoryUsage();
        lines.push(
            '# HELP picklehub_provider_requests_total Outbound provider attempts by bounded adapter and outcome.',
            '# TYPE picklehub_provider_requests_total counter',
            ...[...this.providerRequests].map(([key, count]) => {
                const [provider = 'email_auth', outcome = 'failure'] = key.split('|');
                return `picklehub_provider_requests_total${labels({ provider, outcome })} ${String(count)}`;
            }),
            '# HELP picklehub_provider_circuit_state Current circuit state: closed=0, half-open=1, open=2.',
            '# TYPE picklehub_provider_circuit_state gauge',
            ...[...this.providerStates].map(
                ([provider, state]) =>
                    `picklehub_provider_circuit_state${labels({ provider })} ${String(state === 'open' ? 2 : state === 'half_open' ? 1 : 0)}`
            )
        );
        lines.push(
            '# HELP picklehub_process_resident_memory_bytes Resident memory used by this process.',
            '# TYPE picklehub_process_resident_memory_bytes gauge',
            `picklehub_process_resident_memory_bytes ${String(memory.rss)}`,
            '# HELP picklehub_process_heap_used_bytes JavaScript heap used by this process.',
            '# TYPE picklehub_process_heap_used_bytes gauge',
            `picklehub_process_heap_used_bytes ${String(memory.heapUsed)}`,
            '# HELP picklehub_telemetry_redaction_violations_total Rejected metric observations outside the label allowlist.',
            '# TYPE picklehub_telemetry_redaction_violations_total counter',
            `picklehub_telemetry_redaction_violations_total ${String(this.redactionViolations)}`,
            ...extra,
            '# EOF',
            ''
        );
        return lines.join('\n');
    }
}
