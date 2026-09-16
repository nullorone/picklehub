import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { ApplicationLogger } from '../common/logging/application-logger.service';

@Injectable()
export class MiniGameMaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | undefined;
    private running: Promise<void> | undefined;
    private stopped = false;

    constructor(
        private readonly prisma: PrismaService,
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (this.environment.APP_ROLE === 'worker') this.schedule(0);
    }

    async onModuleDestroy(): Promise<void> {
        this.stopped = true;
        if (this.timer !== undefined) clearTimeout(this.timer);
        await this.running;
    }

    async run(now = new Date()): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await tx.gameSession.updateMany({
                where: { state: 'ISSUED', expiresAt: { lte: now } },
                data: { state: 'EXPIRED', terminalAt: now },
            });
            await tx.processedGameNonce.deleteMany({ where: { expiresAt: { lte: now } } });
            await tx.processedGameTask.deleteMany({ where: { expiresAt: { lte: now } } });
            await tx.miniGameOperationReceipt.deleteMany({ where: { expiresAt: { lte: now } } });
            await tx.gameLaunchCapability.deleteMany({
                where: { expiresAt: { lte: now }, OR: [{ consumedAt: null }, { accessTokenExpiresAt: { lte: now } }] },
            });
        });
    }

    private schedule(delay: number): void {
        this.timer = setTimeout(() => {
            this.running = this.runScheduled();
        }, delay);
        this.timer.unref();
    }

    private async runScheduled(): Promise<void> {
        try {
            await this.run();
        } catch (error) {
            this.logger.error(
                error instanceof Error ? error : new Error('Mini-game maintenance failed'),
                undefined,
                MiniGameMaintenanceService.name
            );
        } finally {
            this.running = undefined;
            if (!this.stopped) this.schedule(60 * 60_000);
        }
    }
}
