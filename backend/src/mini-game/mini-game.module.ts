import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { MiniGameAuthService } from './mini-game-auth.service';
import { MiniGameController } from './mini-game.controller';
import { MiniGameCryptoService } from './mini-game-crypto.service';
import { MiniGameIdempotencyService } from './mini-game-idempotency.service';
import { MiniGameLaunchService } from './mini-game-launch.service';
import { MiniGameMaintenanceService } from './mini-game-maintenance.service';
import { MiniGameMetricsService } from './mini-game-metrics.service';
import { MiniGameRateLimitService } from './mini-game-rate-limit.service';
import { MiniGameRewardService } from './mini-game-reward.service';
import { MiniGameService } from './mini-game.service';

@Module({
    imports: [AuditModule, IdentityModule, OutboxModule],
    controllers: [MiniGameController],
    providers: [
        MiniGameAuthService,
        MiniGameCryptoService,
        MiniGameIdempotencyService,
        MiniGameLaunchService,
        MiniGameMaintenanceService,
        MiniGameMetricsService,
        MiniGameRateLimitService,
        MiniGameRewardService,
        MiniGameService,
    ],
    exports: [MiniGameMaintenanceService, MiniGameMetricsService, MiniGameRewardService, MiniGameService],
})
export class MiniGameModule {}
