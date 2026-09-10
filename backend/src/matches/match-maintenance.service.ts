import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { MatchService } from './match.service';

@Injectable()
export class MatchMaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | undefined;
    private active: Promise<void> | undefined;
    private stopped = false;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly matches: MatchService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE === 'worker') this.schedule(0);
    }

    async onModuleDestroy(): Promise<void> {
        this.stopped = true;
        if (this.timer !== undefined) clearTimeout(this.timer);
        await this.active;
    }

    private schedule(delay: number): void {
        this.timer = setTimeout(() => {
            this.active = this.run();
        }, delay);
        this.timer.unref();
    }

    private async run(): Promise<void> {
        try {
            await this.matches.expireOffersBatch();
        } catch (error) {
            this.logger.error(
                error instanceof Error ? error : new Error('Match maintenance failed'),
                undefined,
                MatchMaintenanceService.name
            );
        } finally {
            this.active = undefined;
            if (!this.stopped) this.schedule(30_000);
        }
    }
}
