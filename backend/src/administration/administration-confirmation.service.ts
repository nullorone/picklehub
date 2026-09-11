import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { administrationError } from './administration.errors';

@Injectable()
export class AdministrationConfirmationService {
    constructor(
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock,
        private readonly redis: RedisService,
        @Inject(ENVIRONMENT) private readonly environment: Environment
    ) {}

    issue(actorId: string, action: string, targetId: string): string {
        return this.value(actorId, action, targetId, Math.floor(this.clock.now().getTime() / 300_000));
    }

    async consume(token: string | undefined, actorId: string, action: string, targetId: string): Promise<void> {
        const bucket = Math.floor(this.clock.now().getTime() / 300_000);
        const valid =
            token !== undefined &&
            [bucket, bucket - 1].some((candidate) =>
                this.crypto.equalHash(token, this.value(actorId, action, targetId, candidate))
            );
        if (!valid) throw administrationError('CONFIRMATION_REQUIRED', 400);
        try {
            await this.redis.ping();
            const consumed = await this.redis.client.set(
                `${this.environment.REDIS_NAMESPACE}:admin:confirmation:${token}`,
                '1',
                'EX',
                600,
                'NX'
            );
            if (consumed !== 'OK') throw administrationError('CONFIRMATION_REQUIRED', 400);
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'CONFIRMATION_REQUIRED') throw error;
            throw administrationError('ADMIN_AUTHORIZATION_UNAVAILABLE', 503);
        }
    }

    private value(actorId: string, action: string, targetId: string, bucket: number): string {
        return this.crypto.hash(`ADMIN_CONFIRM:${actorId}:${action}:${targetId}:${String(bucket)}`);
    }
}
