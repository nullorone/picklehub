import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ModerationService } from './moderation.service';
import { TrustSafetyCryptoService } from './trust-safety-crypto.service';
import { TrustSafetyCursorService } from './trust-safety-cursor.service';
import { TrustSafetyIdempotencyService } from './trust-safety-idempotency.service';
import { TrustSafetyMetricsService } from './trust-safety-metrics.service';
import { TrustSafetyController } from './trust-safety.controller';
import { TrustSafetyService } from './trust-safety.service';

@Module({
    imports: [IdentityModule, OutboxModule, AuditModule, RequestContextModule],
    controllers: [TrustSafetyController],
    providers: [
        TrustSafetyService,
        TrustSafetyCryptoService,
        TrustSafetyCursorService,
        TrustSafetyIdempotencyService,
        TrustSafetyMetricsService,
        ModerationService,
    ],
    exports: [TrustSafetyService, TrustSafetyMetricsService, ModerationService, TrustSafetyCryptoService],
})
export class TrustSafetyModule {}
