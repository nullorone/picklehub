import { CircuitBreaker, CircuitOpenError } from '../../src/common/resilience/circuit-breaker';

describe('CircuitBreaker', () => {
    it('opens after bounded failures and permits one trial after the reset delay', async () => {
        let now = 1000;
        const breaker = new CircuitBreaker({ failureThreshold: 2, resetAfterMs: 5000, now: () => now });
        const failure = jest.fn().mockRejectedValue(new Error('provider unavailable'));

        await expect(breaker.execute(failure)).rejects.toThrow('provider unavailable');
        await expect(breaker.execute(failure)).rejects.toThrow('provider unavailable');
        await expect(breaker.execute(failure)).rejects.toBeInstanceOf(CircuitOpenError);
        expect(failure).toHaveBeenCalledTimes(2);

        now += 5000;
        await expect(breaker.execute(() => Promise.resolve('recovered'))).resolves.toBe('recovered');
        expect(breaker.state()).toBe('closed');
    });
});
