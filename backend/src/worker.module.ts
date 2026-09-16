import { Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module';
import { ClubsModule } from './clubs/clubs.module';
import { TypedConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { LifecycleModule } from './common/lifecycle/lifecycle.module';
import { LoggingModule } from './common/logging/logging.module';
import { RedisModule } from './common/redis/redis.module';
import { RequestContextModule } from './common/request-context/request-context.module';
import { CommunicationsModule } from './communications/communications.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MatchesModule } from './matches/matches.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxWorkerService } from './outbox/outbox-worker.service';
import { ProfilesModule } from './profiles/profiles.module';
import { VenuesModule } from './venues/venues.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { GamificationModule } from './gamification/gamification.module';
import { ContentModule } from './content/content.module';
import { AdvertisingModule } from './advertising/advertising.module';
import { MiniGameModule } from './mini-game/mini-game.module';
import { OperationsModule } from './operations/operations.module';

@Module({
    imports: [
        TypedConfigModule,
        RequestContextModule,
        OperationsModule,
        LoggingModule,
        LifecycleModule,
        DatabaseModule,
        RedisModule,
        OutboxModule,
        IntegrationsModule,
        AuditModule,
        VenuesModule,
        MatchesModule,
        CommunicationsModule,
        ProfilesModule,
        ClubsModule,
        TournamentsModule,
        GamificationModule,
        ContentModule,
        AdvertisingModule,
        MiniGameModule,
    ],
    providers: [OutboxWorkerService],
})
export class WorkerModule {}
