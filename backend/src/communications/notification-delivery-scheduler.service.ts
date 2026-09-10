import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { NotificationDeliveryDispatcherService } from './notification-delivery-dispatcher.service';

@Injectable()
export class NotificationDeliverySchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | undefined;
    private active: Promise<void> | undefined;
    private stopped = false;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly dispatcher: NotificationDeliveryDispatcherService,
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
            await this.dispatcher.quarantineExpired();
            await this.dispatcher.dispatchBatch();
        } catch (error) {
            this.logger.error(
                error instanceof Error ? error : new Error('Notification delivery dispatch failed'),
                undefined,
                NotificationDeliverySchedulerService.name
            );
        } finally {
            this.active = undefined;
            if (!this.stopped) this.schedule(this.environment.COMMUNICATION_DELIVERY_POLL_INTERVAL_MS);
        }
    }
}
