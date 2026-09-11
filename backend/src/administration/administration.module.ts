import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { TrustSafetyModule } from '../trust-safety/trust-safety.module';
import { AdministrationConfirmationService } from './administration-confirmation.service';
import { AdministrationController } from './administration.controller';
import { AdministrationCursorService } from './administration-cursor.service';
import { AdministrationMetricsService } from './administration-metrics.service';
import { AdministrationPolicy } from './administration.policy';
import { AdministrationRateLimitService } from './administration-rate-limit.service';
import { AdministrationService } from './administration.service';
import { AdministrationSessionService } from './administration-session.service';

@Module({
    imports: [AuditModule, IdentityModule, OutboxModule, TrustSafetyModule],
    controllers: [AdministrationController],
    providers: [
        AdministrationPolicy,
        AdministrationSessionService,
        AdministrationCursorService,
        AdministrationConfirmationService,
        AdministrationRateLimitService,
        AdministrationMetricsService,
        AdministrationService,
    ],
    exports: [AdministrationPolicy, AdministrationSessionService, AdministrationMetricsService],
})
export class AdministrationModule {}
