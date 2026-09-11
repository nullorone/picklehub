import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { AdministrationMetricsService } from './administration-metrics.service';
import { administrationError } from './administration.errors';

@Injectable()
export class AdministrationRateLimitService {
    constructor(
        private readonly redis: RedisService,
        private readonly metrics: AdministrationMetricsService,
        @Inject(ENVIRONMENT) private readonly environment: Environment
    ) {}

    async consume(actorId: string, action: string, maximum: number, seconds: number): Promise<void> {
        try {
            await this.redis.ping();
            const key = `${this.environment.REDIS_NAMESPACE}:admin:limit:${action}:${actorId}`;
            const count = await this.redis.client.incr(key);
            if (count === 1) await this.redis.client.expire(key, seconds);
            if (count > maximum) {
                this.metrics.increment('admin_rate_limited_total', { action });
                throw administrationError('RATE_LIMITED', 429);
            }
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'RATE_LIMITED') throw error;
            this.metrics.increment('admin_dependency_fail_closed_total', { dependency: 'rate_limit' });
            throw administrationError('ADMIN_AUTHORIZATION_UNAVAILABLE', 503);
        }
    }
}
