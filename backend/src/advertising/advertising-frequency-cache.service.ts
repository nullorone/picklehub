import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { IdentityCryptoService } from '../identity/identity-crypto.service';

interface CachedFrequency {
    day: number;
    week: number;
    lastViewableAt: string;
}

@Injectable()
export class AdvertisingFrequencyCacheService {
    private readonly namespace: string;

    constructor(
        @Inject(ENVIRONMENT) environment: Environment,
        private readonly redis: RedisService,
        private readonly crypto: IdentityCryptoService
    ) {
        this.namespace = environment.REDIS_NAMESPACE;
    }

    async capped(counterId: string, dayLimit: number, weekLimit: number, now: Date): Promise<boolean> {
        try {
            const value = await this.redis.client.get(this.key(counterId));
            if (value === null) return false;
            const cached = JSON.parse(value) as CachedFrequency;
            return (
                cached.day >= dayLimit ||
                cached.week >= weekLimit ||
                now.getTime() - new Date(cached.lastViewableAt).getTime() < 300_000
            );
        } catch {
            return false;
        }
    }

    async store(counterId: string, day: number, week: number, lastViewableAt: Date): Promise<void> {
        try {
            await this.redis.client.set(
                this.key(counterId),
                JSON.stringify({ day, week, lastViewableAt: lastViewableAt.toISOString() }),
                'EX',
                300
            );
        } catch {
            // PostgreSQL remains authoritative; a missing acceleration cache cannot relax its trigger.
        }
    }

    private key(counterId: string): string {
        return `${this.namespace}:advertising:frequency:${this.crypto.hash(counterId)}`;
    }
}
