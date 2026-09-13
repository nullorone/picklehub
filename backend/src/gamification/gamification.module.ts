import { Module } from '@nestjs/common';

import { AdministrationModule } from '../administration/administration.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { GamificationController } from './gamification.controller';
import { GamificationRuleEngine } from './gamification.domain';
import { GamificationEventWorkerService } from './gamification-event-worker.service';
import { GamificationIdempotencyService } from './gamification-idempotency.service';
import { GamificationMaintenanceService } from './gamification-maintenance.service';
import { GamificationMetricsService } from './gamification-metrics.service';
import { GamificationProjectionService } from './gamification-projection.service';
import { GamificationService } from './gamification.service';
import { GamificationSeasonService } from './gamification-season.service';

@Module({
    imports: [IdentityModule, AdministrationModule, AuditModule, OutboxModule],
    controllers: [GamificationController],
    providers: [
        GamificationService,
        GamificationRuleEngine,
        GamificationProjectionService,
        GamificationEventWorkerService,
        GamificationMaintenanceService,
        GamificationIdempotencyService,
        GamificationMetricsService,
        GamificationSeasonService,
    ],
    exports: [GamificationProjectionService, GamificationMetricsService],
})
export class GamificationModule {}
