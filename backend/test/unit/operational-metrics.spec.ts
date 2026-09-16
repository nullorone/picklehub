import { OperationalMetricsService } from '../../src/operations/operational-metrics.service';

describe('OperationalMetricsService', () => {
    it('publishes only bounded labels and records rejected observations as redaction violations', () => {
        const metrics = new OperationalMetricsService();
        metrics.observeHttp('JOIN', 'SUCCESS', '2xx', 0.25);
        metrics.observeHttp('user-0181-secret', 'SUCCESS', '2xx', 0.1);

        const payload = metrics.render();
        expect(payload).toContain(
            'picklehub_http_requests_total{scenario="JOIN",outcome="SUCCESS",status_class="2xx"} 1'
        );
        expect(payload).toContain('picklehub_telemetry_redaction_violations_total 1');
        expect(payload).not.toContain('user-0181-secret');
        expect(payload.endsWith('# EOF\n')).toBe(true);
    });
});
