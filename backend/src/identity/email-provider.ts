import { Inject, Injectable, Optional } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { CircuitBreaker } from '../common/resilience/circuit-breaker';
import { OperationalMetricsService } from '../operations/operational-metrics.service';

export interface MagicEmail {
    address: string;
    link: string;
    purpose: 'LOGIN' | 'PROOF';
}

export abstract class EmailProvider {
    abstract sendMagicLink(message: MagicEmail): Promise<void>;
}

@Injectable()
export class ConfiguredEmailProvider extends EmailProvider {
    private readonly breaker: CircuitBreaker;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        @Optional() metrics?: OperationalMetricsService
    ) {
        super();
        this.breaker = new CircuitBreaker({
            failureThreshold: environment.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            resetAfterMs: environment.CIRCUIT_BREAKER_RESET_MS,
            onResult: (outcome, state) => metrics?.observeProvider('email_auth', outcome, state),
        });
    }

    async sendMagicLink(message: MagicEmail): Promise<void> {
        const endpoint = this.environment.EMAIL_PROVIDER_ENDPOINT;
        const token = this.environment.EMAIL_PROVIDER_TOKEN;
        if (endpoint === undefined || token === undefined) {
            return;
        }
        await this.breaker.execute(async () => {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: message.address,
                    magicLink: message.link,
                    purpose: message.purpose,
                    disableClickTracking: true,
                    disableUrlRewriting: true,
                }),
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) throw new Error('EMAIL_DELIVERY_FAILED');
        });
    }
}
