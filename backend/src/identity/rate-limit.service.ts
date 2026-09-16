import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { IdentityException, identityError } from './identity.errors';
import { IdentityMetricsService } from './identity-metrics.service';

@Injectable()
export class IdentityRateLimitService {
    constructor(
        private readonly redis: RedisService,
        private readonly metrics: IdentityMetricsService,
        @Inject(ENVIRONMENT) private readonly environment: Environment
    ) {}

    async consume(bucket: string, maximum: number, seconds: number, silent = false): Promise<boolean> {
        try {
            await this.redis.ping();
            const key = `${this.environment.REDIS_NAMESPACE}:identity:limit:${bucket}`;
            const count = await this.redis.client.incr(key);
            if (count === 1) {
                await this.redis.client.expire(key, seconds);
            }
            if (count > maximum) {
                this.metrics.increment('identity_rate_limit_total', { bucket: bucket.split(':', 1)[0] ?? 'unknown' });
                if (silent) {
                    return false;
                }
                throw identityError('RATE_LIMITED', 429);
            }
            return true;
        } catch (error) {
            if (error instanceof IdentityException) {
                throw error;
            }
            throw identityError('AUTH_TEMPORARILY_UNAVAILABLE', 503);
        }
    }
}
