import { Module } from '@nestjs/common';

import { DatabaseModule } from '../common/database/database.module';
import { LoggingModule } from '../common/logging/logging.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { IdentityModule } from '../identity/identity.module';
import { MatchesModule } from '../matches/matches.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ClubController } from './club.controller';
import { ClubIdempotencyService } from './club-idempotency.service';
import { ClubMetricsService } from './club-metrics.service';
import { ClubPolicyService } from './club.policy';
import { ClubService } from './club.service';
import { RecurringMatchGeneratorService } from './recurring-match-generator.service';

@Module({
    imports: [DatabaseModule, LoggingModule, RequestContextModule, IdentityModule, MatchesModule, OutboxModule],
    controllers: [ClubController],
    providers: [
        ClubService,
        ClubPolicyService,
        ClubIdempotencyService,
        ClubMetricsService,
        RecurringMatchGeneratorService,
    ],
    exports: [ClubService, ClubMetricsService, RecurringMatchGeneratorService],
})
export class ClubsModule {}
