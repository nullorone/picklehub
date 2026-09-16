export interface CircuitBreakerOptions {
    failureThreshold: number;
    resetAfterMs: number;
    now?: () => number;
    onResult?: (outcome: 'success' | 'failure' | 'circuit_open', state: 'closed' | 'open' | 'half_open') => void;
}

export class CircuitOpenError extends Error {
    constructor() {
        super('PROVIDER_CIRCUIT_OPEN');
        this.name = 'CircuitOpenError';
    }
}

/**
 * Process-local protection for outbound adapters. It is intentionally not coordinated through Redis: a Redis
 * outage must not disable the breaker, and each replica should stop adding load independently.
 */
export class CircuitBreaker {
    private failures = 0;
    private openedAt: number | undefined;
    private trialInProgress = false;
    private readonly now: () => number;

    constructor(private readonly options: CircuitBreakerOptions) {
        this.now = options.now ?? Date.now;
    }

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        this.enter();
        try {
            const result = await operation();
            this.failures = 0;
            this.openedAt = undefined;
            this.options.onResult?.('success', this.state());
            return result;
        } catch (error) {
            this.failures += 1;
            if (this.failures >= this.options.failureThreshold) this.openedAt = this.now();
            this.options.onResult?.('failure', this.state());
            throw error;
        } finally {
            this.trialInProgress = false;
        }
    }

    state(): 'closed' | 'open' | 'half_open' {
        if (this.openedAt === undefined) return 'closed';
        return this.now() - this.openedAt >= this.options.resetAfterMs ? 'half_open' : 'open';
    }

    private enter(): void {
        const state = this.state();
        if (state === 'open' || (state === 'half_open' && this.trialInProgress)) {
            this.options.onResult?.('circuit_open', state);
            throw new CircuitOpenError();
        }
        if (state === 'half_open') this.trialInProgress = true;
    }
}
