import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { advertisingError } from './advertising.errors';

@Injectable()
export class AdvertisingRateLimitService {
    private readonly namespace: string;

    constructor(
        @Inject(ENVIRONMENT) environment: Environment,
        private readonly redis: RedisService,
        private readonly crypto: IdentityCryptoService
    ) {
        this.namespace = environment.REDIS_NAMESPACE;
    }

    async consume(scope: string, maximum: number, seconds: number, policyRequired: boolean): Promise<void> {
        const key = `${this.namespace}:advertising:limit:${this.crypto.hash(scope)}`;
        try {
            const count = await this.redis.client.incr(key);
            if (count === 1) await this.redis.client.expire(key, seconds);
            if (count > maximum) throw advertisingError('RATE_LIMITED', 429);
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'RATE_LIMITED') throw error;
            if (error instanceof Error && error.constructor.name === 'AdvertisingException') throw error;
            if (policyRequired) throw advertisingError('AD_POLICY_UNAVAILABLE', 503);
        }
    }
}
