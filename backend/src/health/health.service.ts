import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLifecycleService } from '../common/lifecycle/application-lifecycle.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { RedisService } from '../common/redis/redis.service';

export interface ReadinessResult {
    ready: boolean;
}

@Injectable()
export class HealthService {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly lifecycle: ApplicationLifecycleService,
        private readonly logger: ApplicationLogger
    ) {}

    async readiness(): Promise<ReadinessResult> {
        if (!this.lifecycle.isAcceptingTraffic()) {
            return { ready: false };
        }

        const checks = await Promise.allSettled([
            this.withTimeout('postgresql', this.prisma.isReady()),
            this.withTimeout('redis', this.redis.ping()),
        ]);
        const ready = checks.every((check) => check.status === 'fulfilled' && check.value);

        if (!ready) {
            this.logger.warn(
                {
                    event: 'health.readiness.failed',
                    failedChecks: checks.flatMap((check, index) =>
                        check.status === 'fulfilled' && check.value ? [] : [index === 0 ? 'postgresql' : 'redis']
                    ),
                },
                HealthService.name
            );
        }

        return { ready };
    }

    private async withTimeout(name: string, check: Promise<boolean>): Promise<boolean> {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`${name} readiness timed out`));
            }, this.environment.DEPENDENCY_TIMEOUT_MS);
        });

        try {
            return await Promise.race([check, timeout]);
        } finally {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        }
    }
}
