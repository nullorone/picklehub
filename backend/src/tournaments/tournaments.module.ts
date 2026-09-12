import { Module } from '@nestjs/common';

import { DatabaseModule } from '../common/database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { TournamentIdempotencyService } from './tournament-idempotency.service';
import { TournamentOrchestrator } from './tournament-orchestrator';
import { TournamentStrategyRegistry } from './tournament-strategy.registry';

@Module({
    imports: [DatabaseModule, IdentityModule],
    providers: [TournamentStrategyRegistry, TournamentOrchestrator, TournamentIdempotencyService],
    exports: [TournamentStrategyRegistry, TournamentOrchestrator, TournamentIdempotencyService],
})
export class TournamentsModule {}
