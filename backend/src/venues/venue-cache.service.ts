import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { VenueMetricsService } from './venue-metrics.service';

@Injectable()
export class VenueCacheService {
    constructor(
        private readonly redis: RedisService,
        private readonly metrics: VenueMetricsService,
        @Inject(ENVIRONMENT) private readonly environment: Environment
    ) {}

    async invalidateCatalogue(): Promise<void> {
        try {
            await this.redis.ping();
            await this.redis.client.incr(`${this.environment.REDIS_NAMESPACE}:venues:catalogue-generation`);
            this.metrics.increment('venue_cache_invalidations_total');
        } catch {
            // PostgreSQL publication state remains the authorization boundary. A cache failure never re-publishes data.
            this.metrics.increment('venue_cache_invalidation_failures_total');
        }
    }
}
