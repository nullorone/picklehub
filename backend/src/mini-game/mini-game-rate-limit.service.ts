import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { miniGameError } from './mini-game.errors';
import { MiniGameCryptoService } from './mini-game-crypto.service';
import { MiniGameMetricsService } from './mini-game-metrics.service';

@Injectable()
export class MiniGameRateLimitService {
    private readonly namespace: string;

    constructor(
        @Inject(ENVIRONMENT) environment: Environment,
        private readonly redis: RedisService,
        private readonly crypto: MiniGameCryptoService,
        private readonly metrics: MiniGameMetricsService
    ) {
        this.namespace = environment.REDIS_NAMESPACE;
    }

    async consume(scope: string, maximum: number, seconds: number): Promise<void> {
        const key = `${this.namespace}:mini-game:limit:${this.crypto.hash('RATE', scope)}`;
        try {
            const count = await this.redis.client.incr(key);
            if (count === 1) await this.redis.client.expire(key, seconds);
            if (count > maximum) {
                this.metrics.increment('request.rate_limited');
                throw miniGameError('RATE_LIMITED', 429);
            }
            this.metrics.increment('request.allowed');
        } catch (error) {
            if (error instanceof Error && error.constructor.name === 'MiniGameException') throw error;
            this.metrics.increment('reward.unavailable');
            throw miniGameError('GAME_REWARDS_UNAVAILABLE', 503);
        }
    }
}
