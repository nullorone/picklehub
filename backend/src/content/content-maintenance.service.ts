import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { ContentService } from './content.service';

@Injectable()
export class ContentMaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | undefined;
    private running: Promise<void> | undefined;
    private stopped = false;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly content: ContentService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE === 'worker') this.schedule(1000);
    }
    async onModuleDestroy(): Promise<void> {
        this.stopped = true;
        if (this.timer !== undefined) clearTimeout(this.timer);
        await this.running;
    }

    private schedule(delay: number): void {
        this.timer = setTimeout(() => {
            this.running = this.run();
        }, delay);
        this.timer.unref();
    }

    private async run(): Promise<void> {
        try {
            await this.content.publishScheduled();
            await this.content.purgeExpiredData();
        } catch (error) {
            this.logger.error(
                error instanceof Error ? error : new Error('Content maintenance failed'),
                undefined,
                ContentMaintenanceService.name
            );
        } finally {
            this.running = undefined;
            if (!this.stopped) this.schedule(60_000);
        }
    }
}
