import { AdvertisingRateLimitService } from '../../src/advertising/advertising-rate-limit.service';

function service(increment: () => Promise<number>) {
    return new AdvertisingRateLimitService(
        { REDIS_NAMESPACE: 'verification' } as never,
        {
            client: {
                expire: jest.fn().mockResolvedValue(1),
                incr: jest.fn(increment),
            },
        } as never,
        { hash: (value: string) => `hash:${String(value.length)}` } as never
    );
}

describe('advertising measurement anti-fraud limiter', () => {
    it('allows the declared click retry tolerance and rejects the next request', async () => {
        let count = 0;
        const limiter = service(() => Promise.resolve((count += 1)));

        for (let attempt = 0; attempt < 5; attempt += 1) {
            await expect(limiter.consume('click:opaque-token', 5, 60, true)).resolves.toBeUndefined();
        }
        await expect(limiter.consume('click:opaque-token', 5, 60, true)).rejects.toMatchObject({
            code: 'RATE_LIMITED',
        });
    });

    it('fails measurement closed when Redis is unavailable', async () => {
        const limiter = service(() => Promise.reject(new Error('synthetic Redis outage')));

        await expect(limiter.consume('impression:opaque-token', 8, 60, true)).rejects.toMatchObject({
            code: 'AD_POLICY_UNAVAILABLE',
        });
    });

    it('does not turn a decision limiter outage into a product failure', async () => {
        const limiter = service(() => Promise.reject(new Error('synthetic Redis outage')));

        await expect(limiter.consume('decision:opaque-session', 60, 60, false)).resolves.toBeUndefined();
    });
});
