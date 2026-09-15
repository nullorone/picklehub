import { Module } from '@nestjs/common';

import { AdministrationModule } from '../administration/administration.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AdvertisingController } from './advertising.controller';
import { AdvertisingIdempotencyService } from './advertising-idempotency.service';
import { AdvertisingProviderPort, DisabledAdvertisingProvider } from './advertising-provider';
import { AdvertisingRateLimitService } from './advertising-rate-limit.service';
import { AdvertisingService } from './advertising.service';
import { AdvertisingMaintenanceService } from './advertising-maintenance.service';
import { AdvertisingMaintenanceSchedulerService } from './advertising-maintenance-scheduler.service';
import { AdvertisingFrequencyCacheService } from './advertising-frequency-cache.service';

@Module({
    imports: [AdministrationModule, AuditModule, IdentityModule, OutboxModule],
    controllers: [AdvertisingController],
    providers: [
        AdvertisingService,
        AdvertisingIdempotencyService,
        AdvertisingRateLimitService,
        AdvertisingMaintenanceService,
        AdvertisingMaintenanceSchedulerService,
        AdvertisingFrequencyCacheService,
        { provide: AdvertisingProviderPort, useClass: DisabledAdvertisingProvider },
    ],
    exports: [AdvertisingService, AdvertisingProviderPort, AdvertisingMaintenanceService],
})
export class AdvertisingModule {}
