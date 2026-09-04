import { Inject, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';

import { ENVIRONMENT } from '../config/config.module';
import type { Environment } from '../config/environment';
import { ApplicationLogger } from '../logging/application-logger.service';
import { ApplicationLifecycleService } from './application-lifecycle.service';

@Injectable()
export class ShutdownService implements BeforeApplicationShutdown {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly lifecycle: ApplicationLifecycleService,
        private readonly logger: ApplicationLogger
    ) {}

    beforeApplicationShutdown(signal?: string): void {
        this.lifecycle.beginShutdown();
        this.logger.log(
            {
                event: 'application.shutdown.started',
                signal: signal ?? 'application_close',
                gracePeriodMs: this.environment.SHUTDOWN_GRACE_MS,
            },
            ShutdownService.name
        );
    }
}
