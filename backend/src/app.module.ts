import { Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module';
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
    ],
})
export class AppModule {}
