import { Global, Module } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module';
import { OperationalMetricsService } from './operational-metrics.service';
import { OperationsController } from './operations.controller';

@Global()
@Module({
    imports: [OutboxModule],
    controllers: [OperationsController],
    providers: [OperationalMetricsService],
    exports: [OperationalMetricsService],
})
export class OperationsModule {}
