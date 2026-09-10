import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../common/database/database.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { MatchController, MatchInviteController } from './match.controller';
import { MatchIdempotencyService } from './match-idempotency.service';
import { MatchMaintenanceService } from './match-maintenance.service';
import { MatchPolicyService } from './match.policy';
import { MatchService } from './match.service';
import { MatchStatisticsWorkerService } from './match-statistics-worker.service';

@Module({
    imports: [DatabaseModule, IdentityModule, OutboxModule, AuditModule, RequestContextModule],
    controllers: [MatchController, MatchInviteController],
    providers: [
        MatchService,
        MatchPolicyService,
        MatchIdempotencyService,
        MatchMaintenanceService,
        MatchStatisticsWorkerService,
    ],
    exports: [MatchService],
})
export class MatchesModule {}
