import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ConfiguredGeocoderAdapter } from './configured-geocoder.adapter';
import { OverpassAdapter } from './overpass.adapter';
import { VenueCacheService } from './venue-cache.service';
import { VenueController } from './venue.controller';
import { VenueIdempotencyService } from './venue-idempotency.service';
import { VenueImportService } from './venue-import.service';
import { MatchModuleUnavailableAdapter, VenueMatchPort } from './venue-match.port';
import { VenueMetricsService } from './venue-metrics.service';
import { GeocoderPort, VenueCatalogImportPort } from './venue-provider';
import { VenueService } from './venue.service';

@Module({
    imports: [IdentityModule, OutboxModule, AuditModule],
    controllers: [VenueController],
    providers: [
        VenueService,
        VenueIdempotencyService,
        VenueImportService,
        VenueCacheService,
        VenueMetricsService,
        { provide: GeocoderPort, useClass: ConfiguredGeocoderAdapter },
        { provide: VenueCatalogImportPort, useClass: OverpassAdapter },
        { provide: VenueMatchPort, useClass: MatchModuleUnavailableAdapter },
    ],
    exports: [VenueService, VenueImportService, VenueMatchPort, VenueMetricsService],
})
export class VenuesModule {}
