import { Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module';
import { AdministrationModule } from './administration/administration.module';
import { ClubsModule } from './clubs/clubs.module';
import { TypedConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { LifecycleModule } from './common/lifecycle/lifecycle.module';
import { LoggingModule } from './common/logging/logging.module';
import { RedisModule } from './common/redis/redis.module';
import { RequestContextModule } from './common/request-context/request-context.module';
import { CommunicationsModule } from './communications/communications.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { IdentityModule } from './identity/identity.module';
import { MatchesModule } from './matches/matches.module';
import { OutboxModule } from './outbox/outbox.module';
import { ProfilesModule } from './profiles/profiles.module';
import { VenuesModule } from './venues/venues.module';
import { TrustSafetyModule } from './trust-safety/trust-safety.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { GamificationModule } from './gamification/gamification.module';
import { ContentModule } from './content/content.module';

@Module({
    imports: [
        TypedConfigModule,
        RequestContextModule,
        LoggingModule,
        LifecycleModule,
        DatabaseModule,
        RedisModule,
        HealthModule,
        OutboxModule,
        IntegrationsModule,
        AuditModule,
        IdentityModule,
        VenuesModule,
        MatchesModule,
        CommunicationsModule,
        ProfilesModule,
        TrustSafetyModule,
        AdministrationModule,
        ClubsModule,
        TournamentsModule,
        GamificationModule,
        ContentModule,
    ],
})
export class AppModule {}
