import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { ENVIRONMENT } from '../config/config.module';
import type { Environment } from '../config/environment';

@Injectable()
export class RedisService implements OnModuleDestroy {
    readonly client: Redis;

    constructor(@Inject(ENVIRONMENT) environment: Environment) {
        this.client = new Redis(environment.REDIS_URL, {
            connectionName: `${environment.REDIS_NAMESPACE}:${environment.APP_ROLE}`,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
        });

        this.client.on('error', () => undefined);
    }

    async ping(): Promise<boolean> {
        if (this.client.status === 'wait' || this.client.status === 'end') {
            await this.client.connect();
        }

        await this.client.ping();
        return true;
    }

    async onModuleDestroy(): Promise<void> {
        if (this.client.status === 'ready' || this.client.status === 'connecting' || this.client.status === 'connect') {
            await this.client.quit();
            return;
        }

        this.client.disconnect(false);
    }
}
