import type { Environment } from '../../src/common/config/environment';
import { OverpassAdapter } from '../../src/venues/overpass.adapter';

const scope = JSON.stringify({
    south: 55.7,
    west: 37.5,
    north: 55.8,
    east: 37.7,
    locality: 'Москва',
    timeZone: 'Europe/Moscow',
});

function environment(): Environment {
    return {
        NODE_ENV: 'test',
        APP_ROLE: 'worker',
        HOST: '127.0.0.1',
        PORT: 3000,
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379/0',
        REDIS_NAMESPACE: 'test',
        LOG_LEVEL: 'silent',
        DEPENDENCY_TIMEOUT_MS: 1000,
        SHUTDOWN_GRACE_MS: 10_000,
        OUTBOX_BATCH_SIZE: 50,
        OUTBOX_POLL_INTERVAL_MS: 1000,
        OUTBOX_MAX_ATTEMPTS: 10,
        OUTBOX_CLAIM_TTL_MS: 30_000,
        IDENTITY_HMAC_KEY: 'test-identity-hmac-key-change-me-0001',
        IDENTITY_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        TELEGRAM_BOT_TOKEN: 'test-token',
        IDENTITY_ALLOWED_ORIGINS: 'https://localhost',
        MAGIC_LINK_BASE_URL: 'https://localhost/auth/email',
        VENUE_PROVIDER_POLICY_VERSION: 'review-test-v1',
        VENUE_OVERPASS_ENDPOINT: 'https://overpass.example.test/api/interpreter',
        VENUE_OVERPASS_USER_AGENT: 'PickleHub verification test',
        VENUE_OVERPASS_LICENSE: 'ODbL-1.0',
        VENUE_OVERPASS_ATTRIBUTION_TEXT: '© OpenStreetMap contributors',
        VENUE_OVERPASS_ATTRIBUTION_LINK: 'https://www.openstreetmap.org/copyright',
        VENUE_OVERPASS_STORAGE_ALLOWED: 'true',
        VENUE_OVERPASS_MIN_INTERVAL_MS: 1000,
        VENUE_GEOCODER_STORAGE_ALLOWED: 'false',
        MATCH_POLICY_VERSION: 'matches-v1',
        MATCH_PUBLISH_MINIMUM_LEAD_MINUTES: 30,
        MATCH_PUBLISH_HORIZON_DAYS: 90,
        MATCH_WAITLIST_OFFER_MINUTES: 30,
        MATCH_START_EARLY_MINUTES: 30,
        MATCH_START_LATE_HOURS: 6,
        MATCH_RESULT_DEADLINE_HOURS: 72,
        MATCH_CONFIRMATION_DEADLINE_HOURS: 48,
        COMMUNICATION_DELIVERY_POLL_INTERVAL_MS: 1000,
        COMMUNICATION_DELIVERY_MAX_ATTEMPTS: 8,
        COMMUNICATION_PROVIDER_TIMEOUT_MS: 5000,
        COMMUNICATION_ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        NOTIFICATION_TELEGRAM_ENABLED: 'false',
        NOTIFICATION_EMAIL_ENABLED: 'false',
    };
}

function response(status = 200): Response {
    return new Response(
        JSON.stringify({
            osm3s: { timestamp_osm_base: '2026-09-10T10:00:00.000Z' },
            elements: [
                {
                    type: 'node',
                    id: 42,
                    lat: 55.75,
                    lon: 37.61,
                    version: 3,
                    timestamp: '2026-09-10T09:00:00.000Z',
                    tags: { sport: 'pickleball', leisure: 'pitch', name: 'Тестовый корт' },
                },
            ],
        }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );
}

describe('OverpassAdapter', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('retries bounded provider failures and returns complete attribution', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-10T10:00:00.000Z') });
        const fetchMock = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(response(429))
            .mockResolvedValueOnce(response(503))
            .mockResolvedValueOnce(response());
        const result = new OverpassAdapter(environment()).fetch(scope);

        await jest.advanceTimersByTimeAsync(1500);
        await expect(result).resolves.toMatchObject({
            sourceVersion: '2026-09-10T10:00:00.000Z',
            items: [
                {
                    externalSourceId: 'node/42',
                    externalSourceVersion: '3',
                    provenance: {
                        license: 'ODbL-1.0',
                        policyVersion: 'review-test-v1',
                        attributionText: '© OpenStreetMap contributors',
                    },
                },
            ],
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            method: 'POST',
            headers: { 'User-Agent': 'PickleHub verification test' },
        });
    });

    it('enforces the configured interval between successive imports', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-10T10:00:00.000Z') });
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response()));
        const adapter = new OverpassAdapter(environment());

        await adapter.fetch(scope);
        const second = adapter.fetch(scope);
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(1000);
        await expect(second).resolves.toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('rejects antimeridian-crossing and malformed import scopes before a provider call', async () => {
        const fetchMock = jest.spyOn(globalThis, 'fetch');
        const adapter = new OverpassAdapter(environment());

        await expect(
            adapter.fetch(
                JSON.stringify({
                    south: 50,
                    west: 179,
                    north: 51,
                    east: -179,
                    locality: 'Тест',
                    timeZone: 'Europe/Moscow',
                })
            )
        ).rejects.toThrow('VENUE_IMPORT_SCOPE_INVALID');
        await expect(adapter.fetch('{broken-json')).rejects.toBeInstanceOf(SyntaxError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
