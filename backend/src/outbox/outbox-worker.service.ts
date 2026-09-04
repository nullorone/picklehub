import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Injectable()
export class OutboxWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | undefined;
    private activeDispatch: Promise<void> | undefined;
    private stopped = false;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly dispatcher: OutboxDispatcherService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        this.schedule(0);
    }

    async onModuleDestroy(): Promise<void> {
        this.stopped = true;
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        await this.activeDispatch;
    }

    private schedule(delayMs: number): void {
        this.timer = setTimeout(() => {
            this.activeDispatch = this.runOnce();
        }, delayMs);
        this.timer.unref();
    }

    private async runOnce(): Promise<void> {
        try {
            await this.dispatcher.dispatchBatch();
        } catch (error) {
            this.logger.error(
                error instanceof Error ? error : new Error('Outbox dispatch failed'),
                undefined,
                OutboxWorkerService.name
            );
        } finally {
            this.activeDispatch = undefined;
            if (!this.stopped) {
                this.schedule(this.environment.OUTBOX_POLL_INTERVAL_MS);
            }
        }
    }
}
